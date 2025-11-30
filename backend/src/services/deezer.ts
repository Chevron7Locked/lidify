import axios, { AxiosInstance } from "axios";
import { redisClient } from "../utils/redis";
import { getSystemSettings } from "../utils/systemSettings";
import { config } from "../config";

/**
 * Deezer API Service
 *
 * Provides artist/album images, track previews, and metadata
 * API Docs: https://developers.deezer.com/api
 *
 * Free tier available (no API key required)
 * Optional API key for higher rate limits
 * Rate limit: ~50 requests/second (free), higher with API key
 */
class DeezerService {
    private client: AxiosInstance;
    private apiKey: string | null = null;
    private initialized = false;

    constructor() {
        this.client = axios.create({
            baseURL: "https://api.deezer.com",
            timeout: 10000,
            headers: {
                "User-Agent": "Lidify/1.0",
            },
        });
    }

    /**
     * Initialize service with API key from database or environment
     */
    async ensureInitialized() {
        if (this.initialized) return;

        try {
            const settings = await getSystemSettings();
            if (settings?.deezerApiKey) {
                this.apiKey = settings.deezerApiKey;
                console.log("Deezer: Using API key from database");
            } else if (config.deezer.apiKey) {
                this.apiKey = config.deezer.apiKey;
                console.log("Deezer: Using API key from environment");
            } else {
                console.log(" Deezer: Using free tier (no API key)");
            }
        } catch (error) {
            console.warn("Deezer initialization warning:", error);
            // Continue without API key (free tier)
        }

        this.initialized = true;
    }

    /**
     * Get request parameters with optional API key
     */
    private getRequestParams(params: any = {}) {
        if (this.apiKey) {
            return { ...params, access_token: this.apiKey };
        }
        return params;
    }

    /**
     * Search for an artist by name and get their image
     */
    async getArtistImage(artistName: string): Promise<string | null> {
        await this.ensureInitialized();

        // Check cache first
        const cacheKey = `deezer:artist:${artistName.toLowerCase()}`;
        try {
            if (redisClient.isOpen) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log(`  Deezer: Using cached image`);
                    return cached;
                }
            }
        } catch (error) {
            // Redis errors are non-critical
        }

        try {
            console.log(`  Searching Deezer for "${artistName}"...`);
            const response = await this.client.get("/search/artist", {
                params: this.getRequestParams({
                    q: artistName,
                    limit: 1,
                }),
            });

            const data = response.data;

            if (data.data && data.data.length > 0) {
                const artist = data.data[0];

                // Deezer provides multiple image sizes: picture_small, picture_medium, picture_big, picture_xl
                const imageUrl =
                    artist.picture_xl ||
                    artist.picture_big ||
                    artist.picture_medium;

                if (imageUrl) {
                    console.log(`  Deezer: Found image (XL quality)`);

                    // Cache for 7 days
                    if (redisClient.isOpen) {
                        try {
                            await redisClient.setEx(
                                cacheKey,
                                7 * 24 * 60 * 60,
                                imageUrl
                            );
                        } catch (error) {
                            // Redis errors are non-critical
                        }
                    }

                    return imageUrl;
                }
            }

            return null;
        } catch (error: any) {
            console.error(`Deezer error:`, error.message);
            return null;
        }
    }

    /**
     * Search for an album by artist and title, get cover art
     */
    async getAlbumCover(
        artistName: string,
        albumTitle: string
    ): Promise<string | null> {
        await this.ensureInitialized();

        const cacheKey =
            `deezer:album:${artistName}:${albumTitle}`.toLowerCase();
        try {
            if (redisClient.isOpen) {
                const cached = await redisClient.get(cacheKey);
                if (cached) return cached;
            }
        } catch (error) {
            // Redis errors are non-critical
        }

        try {
            const response = await this.client.get("/search/album", {
                params: this.getRequestParams({
                    q: `artist:"${artistName}" album:"${albumTitle}"`,
                    limit: 1,
                }),
            });

            const data = response.data;

            if (data.data && data.data.length > 0) {
                const album = data.data[0];
                const imageUrl =
                    album.cover_xl || album.cover_big || album.cover_medium;

                if (imageUrl && redisClient.isOpen) {
                    try {
                        await redisClient.setEx(
                            cacheKey,
                            7 * 24 * 60 * 60,
                            imageUrl
                        );
                    } catch (error) {
                        // Redis errors are non-critical
                    }
                }

                return imageUrl;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Search for a track and get preview URL
     * Returns 30-second MP3 preview URL
     */
    async getTrackPreview(
        artistName: string,
        trackTitle: string
    ): Promise<string | null> {
        await this.ensureInitialized();

        const cacheKey =
            `deezer:track:preview:${artistName}:${trackTitle}`.toLowerCase();
        try {
            if (redisClient.isOpen) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log(`  Deezer: Using cached preview URL`);
                    return cached;
                }
            }
        } catch (error) {
            // Redis errors are non-critical
        }

        try {
            console.log(
                `  Searching Deezer for track "${trackTitle}" by ${artistName}...`
            );

            // Try multiple search strategies for better results
            const searches = [
                // Strategy 1: Exact match with quotes
                `artist:"${artistName}" track:"${trackTitle}"`,
                // Strategy 2: Just track title (for collaborations where artist name is complex)
                `"${trackTitle}"`,
                // Strategy 3: First artist name + track (for "Artist1 & Artist2" collaborations)
                `artist:"${artistName
                    .split(/&|feat\.|ft\.|featuring/i)[0]
                    .trim()}" track:"${trackTitle}"`,
                // Strategy 4: Simple unquoted search
                `${artistName} ${trackTitle}`,
            ];

            for (const query of searches) {
                try {
                    const response = await this.client.get("/search/track", {
                        params: this.getRequestParams({
                            q: query,
                            limit: 5, // Get more results to find better match
                        }),
                    });

                    const data = response.data;

                    if (data.data && data.data.length > 0) {
                        // Find the best match based on title similarity
                        for (const track of data.data) {
                            const titleMatch =
                                track.title
                                    .toLowerCase()
                                    .includes(trackTitle.toLowerCase()) ||
                                trackTitle
                                    .toLowerCase()
                                    .includes(track.title.toLowerCase());

                            if (titleMatch && track.preview) {
                                console.log(
                                    `  Deezer: Found preview URL using query: ${query}`
                                );

                                // Cache for 7 days
                                if (redisClient.isOpen) {
                                    try {
                                        await redisClient.setEx(
                                            cacheKey,
                                            7 * 24 * 60 * 60,
                                            track.preview
                                        );
                                    } catch (error) {
                                        // Redis errors are non-critical
                                    }
                                }

                                return track.preview;
                            }
                        }
                    }
                } catch (searchError) {
                    // Try next search strategy
                    continue;
                }
            }

            console.log(
                `    Deezer: No preview found after trying multiple search strategies`
            );
            return null;
        } catch (error: any) {
            console.error(`   Deezer track search error:`, error.message);
            return null;
        }
    }

    /**
     * Search for tracks by artist and get multiple results with previews
     */
    async searchTracks(
        artistName: string,
        trackTitle?: string,
        limit: number = 10
    ): Promise<
        Array<{
            id: string;
            title: string;
            artist: string;
            album: string;
            duration: number;
            previewUrl: string | null;
            coverUrl: string | null;
        }>
    > {
        await this.ensureInitialized();

        try {
            let query = `artist:"${artistName}"`;
            if (trackTitle) {
                query += ` track:"${trackTitle}"`;
            }

            const response = await this.client.get("/search/track", {
                params: this.getRequestParams({
                    q: query,
                    limit,
                }),
            });

            const data = response.data;

            if (data.data && data.data.length > 0) {
                return data.data.map((track: any) => ({
                    id: track.id.toString(),
                    title: track.title,
                    artist: track.artist.name,
                    album: track.album?.title || "",
                    duration: track.duration,
                    previewUrl: track.preview || null,
                    coverUrl:
                        track.album?.cover_xl ||
                        track.album?.cover_big ||
                        track.album?.cover_medium ||
                        null,
                }));
            }

            return [];
        } catch (error: any) {
            console.error(`Deezer track search error:`, error.message);
            return [];
        }
    }

    /**
     * Search for an album preview (first track from album)
     * Used for unavailable albums in Discover Weekly
     */
    async getAlbumPreview(
        artistName: string,
        albumTitle: string
    ): Promise<{
        trackId: string;
        albumId: string;
        previewUrl: string;
        trackTitle: string;
        coverUrl: string | null;
    } | null> {
        await this.ensureInitialized();

        const cacheKey =
            `deezer:album:preview:${artistName}:${albumTitle}`.toLowerCase();
        try {
            if (redisClient.isOpen) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log(`  Deezer: Using cached album preview`);
                    return JSON.parse(cached);
                }
            }
        } catch (error) {
            // Redis errors are non-critical
        }

        try {
            console.log(
                `  Searching Deezer for album "${albumTitle}" by ${artistName}...`
            );

            // Search for the album
            const response = await this.client.get("/search/album", {
                params: this.getRequestParams({
                    q: `artist:"${artistName}" album:"${albumTitle}"`,
                    limit: 5,
                }),
            });

            const data = response.data;

            if (!data.data || data.data.length === 0) {
                console.log(`    Deezer: No album found`);
                return null;
            }

            // Find best matching album
            const normalizeString = (str: string) =>
                str
                    .toLowerCase()
                    .replace(/[^\w\s]/g, "")
                    .trim();

            const normalizedArtist = normalizeString(artistName);
            const normalizedAlbum = normalizeString(albumTitle);

            let bestAlbum = data.data[0];
            let bestScore = 0;

            for (const album of data.data) {
                const albumArtist = normalizeString(album.artist.name);
                const albumName = normalizeString(album.title);

                let score = 0;
                if (
                    albumArtist.includes(normalizedArtist) ||
                    normalizedArtist.includes(albumArtist)
                ) {
                    score += 50;
                }
                if (
                    albumName.includes(normalizedAlbum) ||
                    normalizedAlbum.includes(albumName)
                ) {
                    score += 50;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestAlbum = album;
                }

                if (score === 100) break;
            }

            // Get album tracks
            const albumResponse = await this.client.get(
                `/album/${bestAlbum.id}`,
                {
                    params: this.getRequestParams({}),
                }
            );

            const albumData = albumResponse.data;

            if (
                !albumData.tracks ||
                !albumData.tracks.data ||
                albumData.tracks.data.length === 0
            ) {
                console.log(`   Deezer: No tracks found in album`);
                return null;
            }

            // Get first track with a preview
            const trackWithPreview = albumData.tracks.data.find(
                (track: any) => track.preview
            );

            if (!trackWithPreview) {
                console.log(`Deezer: No preview available for album`);
                return null;
            }

            const result = {
                trackId: trackWithPreview.id.toString(),
                albumId: bestAlbum.id.toString(),
                previewUrl: trackWithPreview.preview,
                trackTitle: trackWithPreview.title,
                coverUrl:
                    bestAlbum.cover_xl ||
                    bestAlbum.cover_big ||
                    bestAlbum.cover_medium ||
                    null,
            };

            console.log(
                `  Deezer: Found album preview - "${trackWithPreview.title}"`
            );
            console.log(`    Preview URL: ${trackWithPreview.preview}`);

            // Cache for 7 days
            if (redisClient.isOpen) {
                try {
                    await redisClient.setEx(
                        cacheKey,
                        7 * 24 * 60 * 60,
                        JSON.stringify(result)
                    );
                } catch (error) {
                    // Redis errors are non-critical
                }
            }

            return result;
        } catch (error: any) {
            console.error(`   Deezer album preview error:`, error.message);
            return null;
        }
    }
}

export const deezerService = new DeezerService();
