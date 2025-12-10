import axios, { AxiosInstance } from "axios";
import { getSystemSettings } from "../utils/systemSettings";

/**
 * Audiobookshelf API Service
 * Handles all interactions with the Audiobookshelf server
 */
class AudiobookshelfService {
    private client: AxiosInstance | null = null;
    private baseUrl: string | null = null;
    private apiKey: string | null = null;
    private initialized = false;
    private podcastCache: { items: any[]; expiresAt: number } | null = null;
    private readonly PODCAST_CACHE_TTL_MS = 5 * 60 * 1000;

    private async ensureInitialized() {
        if (this.initialized && this.client) return;

        try {
            // Try to get from database first
            const settings = await getSystemSettings();

            // Check if Audiobookshelf is explicitly disabled
            if (settings && settings.audiobookshelfEnabled === false) {
                throw new Error("Audiobookshelf is disabled in settings");
            }

            if (
                settings?.audiobookshelfEnabled &&
                settings?.audiobookshelfUrl &&
                settings?.audiobookshelfApiKey
            ) {
                this.baseUrl = settings.audiobookshelfUrl.replace(/\/$/, ""); // Remove trailing slash
                this.apiKey = settings.audiobookshelfApiKey;
                this.client = axios.create({
                    baseURL: this.baseUrl,
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    timeout: 30000, // 30 seconds for remote server
                });
                console.log("Audiobookshelf configured from database");
                this.initialized = true;
                return;
            }
        } catch (error: any) {
            if (error.message === "Audiobookshelf is disabled in settings") {
                throw error;
            }
            console.log(
                "  Could not load Audiobookshelf from database, checking .env"
            );
        }

        // Fallback to .env
        if (
            process.env.AUDIOBOOKSHELF_URL &&
            process.env.AUDIOBOOKSHELF_API_KEY
        ) {
            this.baseUrl = process.env.AUDIOBOOKSHELF_URL.replace(/\/$/, "");
            this.apiKey = process.env.AUDIOBOOKSHELF_API_KEY;
            this.client = axios.create({
                baseURL: this.baseUrl,
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
                timeout: 30000, // 30 seconds for remote server
            });
            console.log("Audiobookshelf configured from .env");
            this.initialized = true;
        } else {
            throw new Error("Audiobookshelf not configured");
        }
    }

    /**
     * Test connection to Audiobookshelf
     */
    async ping(): Promise<boolean> {
        try {
            await this.ensureInitialized();
            const response = await this.client!.get("/api/libraries");
            return response.status === 200;
        } catch (error) {
            console.error("Audiobookshelf connection failed:", error);
            return false;
        }
    }

    /**
     * Get all libraries from Audiobookshelf
     */
    async getLibraries() {
        await this.ensureInitialized();
        const response = await this.client!.get("/api/libraries");
        return response.data.libraries || [];
    }

    /**
     * Get all audiobooks from a specific library
     */
    async getLibraryItems(libraryId: string) {
        await this.ensureInitialized();
        const response = await this.client!.get(
            `/api/libraries/${libraryId}/items`
        );
        return response.data.results || [];
    }

    /**
     * Get all audiobooks from all libraries
     */
    async getAllAudiobooks() {
        await this.ensureInitialized();
        const libraries = await this.getLibraries();

        const allBooks: any[] = [];
        for (const library of libraries) {
            if (library.mediaType === "book") {
                // Only get audiobook libraries
                const items = await this.getLibraryItems(library.id);

                // DEBUG: Log the structure of the first item with series
                if (items.length > 0) {
                    const itemsWithSeries = items.filter((item: any) => 
                        item.media?.metadata?.series || item.media?.metadata?.seriesName
                    );
                    if (itemsWithSeries.length > 0) {
                        console.log(
                            "[AUDIOBOOKSHELF DEBUG] Sample item WITH series:",
                            JSON.stringify(itemsWithSeries[0], null, 2).substring(0, 2000)
                        );
                    } else {
                        console.log(
                            "[AUDIOBOOKSHELF DEBUG] No items with series found! Sample item:",
                            JSON.stringify(items[0], null, 2).substring(0, 1000)
                        );
                    }
                }

                allBooks.push(...items);
            }
        }

        return allBooks;
    }

    /**
     * Get all podcasts from all libraries
     */
    async getAllPodcasts(forceRefresh = false) {
        await this.ensureInitialized();

        if (
            !forceRefresh &&
            this.podcastCache &&
            this.podcastCache.expiresAt > Date.now()
        ) {
            return this.podcastCache.items;
        }

        const libraries = await this.getLibraries();
        const podcastLibraries = libraries.filter(
            (library: any) => library.mediaType === "podcast"
        );

        const libraryResults = await Promise.all(
            podcastLibraries.map(async (library: any) => {
                try {
                    return await this.getLibraryItems(library.id);
                } catch (error) {
                    console.error(
                        `Audiobookshelf: failed to load podcast library ${library.id}`,
                        error
                    );
                    return [];
                }
            })
        );

        const allPodcasts = libraryResults.flat();

        this.podcastCache = {
            items: allPodcasts,
            expiresAt: Date.now() + this.PODCAST_CACHE_TTL_MS,
        };

        return allPodcasts;
    }

    /**
     * Get a specific audiobook by ID
     */
    async getAudiobook(audiobookId: string) {
        await this.ensureInitialized();
        const response = await this.client!.get(
            `/api/items/${audiobookId}?expanded=1`
        );
        return response.data;
    }

    /**
     * Get a specific podcast by ID (alias for getAudiobook since API is the same)
     */
    async getPodcast(podcastId: string) {
        return this.getAudiobook(podcastId);
    }

    /**
     * Get user's progress for an audiobook
     */
    async getProgress(audiobookId: string) {
        await this.ensureInitialized();
        const response = await this.client!.get(
            `/api/me/progress/${audiobookId}`
        );
        return response.data;
    }

    /**
     * Update user's progress for an audiobook
     */
    async updateProgress(
        audiobookId: string,
        currentTime: number,
        duration: number,
        isFinished: boolean = false
    ) {
        await this.ensureInitialized();
        const response = await this.client!.patch(
            `/api/me/progress/${audiobookId}`,
            {
                currentTime,
                duration,
                isFinished,
            }
        );
        return response.data;
    }

    /**
     * Get stream URL for an audiobook
     */
    async getStreamUrl(audiobookId: string): Promise<string> {
        await this.ensureInitialized();
        return `${this.baseUrl}/api/items/${audiobookId}/play`;
    }

    /**
     * Stream an audiobook with authentication
     * Returns a readable stream that can be piped to the response
     */
    async streamAudiobook(audiobookId: string, rangeHeader?: string) {
        await this.ensureInitialized();

        // First, get the audiobook to find the track file
        const audiobook = await this.getAudiobook(audiobookId);

        // Get the first track's content URL
        const firstTrack = audiobook.media?.tracks?.[0];
        if (!firstTrack || !firstTrack.contentUrl) {
            throw new Error("No audio track found for this audiobook");
        }

        // Build request headers
        const headers: Record<string, string> = {};
        if (rangeHeader) {
            headers["Range"] = rangeHeader;
        }

        // The contentUrl format is: /api/items/{id}/file/{ino}
        const response = await this.client!.get(firstTrack.contentUrl, {
            responseType: "stream",
            timeout: 0, // No timeout for streaming
            headers,
            // Don't throw on 206 Partial Content
            validateStatus: (status) => status >= 200 && status < 300,
        });

        return {
            stream: response.data,
            headers: response.headers,
            status: response.status,
        };
    }

    /**
     * Stream a podcast episode with authentication
     * For podcasts, we need to get a specific episode ID
     */
    async streamPodcastEpisode(podcastId: string, episodeId: string) {
        await this.ensureInitialized();

        // Get the podcast to find the episode
        const podcast = await this.getPodcast(podcastId);
        const episode = podcast.media?.episodes?.find(
            (ep: any) => ep.id === episodeId
        );

        if (!episode) {
            throw new Error("Episode not found");
        }

        // Podcast episodes use audioTrack.contentUrl, not audioFile.contentUrl
        const contentUrl =
            episode.audioTrack?.contentUrl || episode.audioFile?.contentUrl;

        if (!contentUrl) {
            throw new Error("No audio file found for this episode");
        }

        const response = await this.client!.get(contentUrl, {
            responseType: "stream",
            timeout: 0,
        });

        return {
            stream: response.data,
            headers: response.headers,
        };
    }

    /**
     * Search audiobooks
     */
    async searchAudiobooks(query: string) {
        await this.ensureInitialized();
        const response = await this.client!.get(
            `/api/search/books?q=${encodeURIComponent(query)}`
        );
        return response.data.book || [];
    }
}

export const audiobookshelfService = new AudiobookshelfService();
