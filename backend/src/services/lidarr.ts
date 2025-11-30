import axios, { AxiosInstance } from "axios";
import { config } from "../config";
import { getSystemSettings } from "../utils/systemSettings";

interface LidarrArtist {
    id: number;
    artistName: string;
    foreignArtistId: string; // MusicBrainz ID
    monitored: boolean;
}

interface LidarrAlbum {
    id: number;
    title: string;
    foreignAlbumId: string; // MusicBrainz release group ID
    artistId: number;
    monitored: boolean;
    artist?: {
        foreignArtistId: string; // MusicBrainz artist ID
        artistName: string;
    };
}

class LidarrService {
    private client: AxiosInstance | null = null;
    private enabled: boolean;
    private initialized: boolean = false;

    constructor() {
        // Initial check from .env (for backwards compatibility)
        this.enabled = config.lidarr?.enabled || false;

        if (this.enabled && config.lidarr) {
            this.client = axios.create({
                baseURL: config.lidarr.url,
                timeout: 30000,
                headers: {
                    "X-Api-Key": config.lidarr.apiKey,
                },
            });
        }
    }

    private async ensureInitialized() {
        if (this.initialized) return;

        try {
            // Try to load from database
            const settings = await getSystemSettings();

            if (settings && settings.lidarrEnabled) {
                const url = settings.lidarrUrl || config.lidarr?.url;
                const apiKey = settings.lidarrApiKey || config.lidarr?.apiKey;

                if (url && apiKey) {
                    console.log("Lidarr configured from database");
                    this.client = axios.create({
                        baseURL: url,
                        timeout: 30000,
                        headers: {
                            "X-Api-Key": apiKey,
                        },
                    });
                    this.enabled = true;
                } else {
                    console.warn(
                        "  Lidarr enabled but missing URL or API key"
                    );
                    this.enabled = false;
                }
            } else if (config.lidarr) {
                // Fallback to .env
                console.log("Lidarr configured from .env");
                this.enabled = true;
            } else {
                console.log("  Lidarr not enabled");
                this.enabled = false;
            }
        } catch (error) {
            console.error("Failed to load Lidarr settings:", error);
            // Keep .env config if database fails
        }

        this.initialized = true;
    }

    async isEnabled(): Promise<boolean> {
        await this.ensureInitialized();
        return this.enabled;
    }

    /**
     * Ensure the root folder exists in Lidarr, fallback to first available if not
     */
    private async ensureRootFolderExists(
        requestedPath: string
    ): Promise<string> {
        if (!this.client) {
            return requestedPath;
        }

        try {
            // Get all root folders from Lidarr
            const response = await this.client.get("/api/v1/rootfolder");
            const rootFolders = response.data;

            if (rootFolders.length === 0) {
                console.warn("  No root folders configured in Lidarr!");
                return requestedPath;
            }

            // Check if requested path exists
            const exists = rootFolders.find(
                (folder: any) => folder.path === requestedPath
            );

            if (exists) {
                return requestedPath;
            }

            // Fallback to first available root folder
            const fallback = rootFolders[0].path;
            console.log(
                `  Root folder "${requestedPath}" not found in Lidarr`
            );
            console.log(`   Using fallback: "${fallback}"`);
            return fallback;
        } catch (error) {
            console.error("Error checking root folders:", error);
            return requestedPath; // Return requested path and let Lidarr error if needed
        }
    }

    async searchArtist(
        artistName: string,
        mbid?: string
    ): Promise<LidarrArtist[]> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            const response = await this.client.get("/api/v1/artist/lookup", {
                params: {
                    term: mbid ? `lidarr:${mbid}` : artistName,
                },
            });

            return response.data;
        } catch (error) {
            console.error("Lidarr artist search error:", error);
            return [];
        }
    }

    async addArtist(
        mbid: string,
        artistName: string,
        rootFolderPath: string = "/music",
        searchForMissingAlbums: boolean = true,
        monitorAllAlbums: boolean = true
    ): Promise<LidarrArtist | null> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            // 🆕 Ensure root folder exists, fallback to default if not
            const validRootFolder = await this.ensureRootFolderExists(
                rootFolderPath
            );

            console.log(
                ` Searching Lidarr for artist: "${artistName}"${
                    mbid ? ` (MBID: ${mbid})` : " (no MBID - using name search)"
                }`
            );
            console.log(`   Root folder: ${validRootFolder}`);

            // Search for artist (by MBID if available, otherwise by name)
            const searchResults = await this.searchArtist(artistName, mbid);

            if (searchResults.length === 0) {
                console.error(` Artist not found in Lidarr: ${artistName}`);
                return null;
            }

            console.log(`   Found ${searchResults.length} results from Lidarr`);

            let artistData: LidarrArtist;

            if (mbid) {
                // 🆕 STRICT MBID FILTERING - Only use exact MBID match
                const exactMatch = searchResults.find(
                    (artist) => artist.foreignArtistId === mbid
                );

                if (!exactMatch) {
                    console.error(
                        ` No exact MBID match found for: ${artistName} (${mbid})`
                    );
                    console.log(
                        "   Available results:",
                        searchResults.map((a) => ({
                            name: a.artistName,
                            mbid: a.foreignArtistId,
                            type: a.artistType,
                        }))
                    );
                    return null;
                }

                // 🆕 ADDITIONAL CHECK: If exact match is a "Group" with 0 albums,
                // look for a better match with same name but different type
                if (
                    exactMatch.artistType === "Group" &&
                    (exactMatch.statistics?.albumCount || 0) === 0
                ) {
                    console.log(
                        ` Exact MBID match is a Group with 0 albums - checking for better match...`
                    );

                    // Look for same artist name but different type with albums
                    const betterMatch = searchResults.find(
                        (artist) =>
                            artist.artistName.toLowerCase() ===
                                exactMatch.artistName.toLowerCase() &&
                            artist.foreignArtistId !== mbid &&
                            (artist.statistics?.albumCount || 0) > 0 &&
                            (artist.artistType === "Person" ||
                                artist.artistType === "Artist")
                    );

                    if (betterMatch) {
                        console.log(
                            `   Found better match: "${
                                betterMatch.artistName
                            }" (Type: ${betterMatch.artistType}, Albums: ${
                                betterMatch.statistics?.albumCount || 0
                            })`
                        );
                        artistData = betterMatch;
                    } else {
                        console.log(
                            ` No better match found, using Group entry`
                        );
                        artistData = exactMatch;
                    }
                } else {
                    console.log(
                        `Exact match found: "${exactMatch.artistName}" (Type: ${
                            exactMatch.artistType
                        }, Albums: ${exactMatch.statistics?.albumCount || 0})`
                    );
                    artistData = exactMatch;
                }
            } else {
                // 🆕 FALLBACK: No MBID - Use smart filtering for best match
                console.log(
                    " No MBID available - using smart selection..."
                );

                // Filter and score results
                const scoredResults = searchResults.map((artist) => {
                    let score = 0;

                    // Prefer "Person" or "Group" types for actual artists
                    const type = (artist.artistType || "").toLowerCase();
                    if (type === "person") score += 1000;
                    else if (type === "group") score += 900;
                    else if (type === "artist") score += 800;

                    // Album count (more albums = more likely correct)
                    const albumCount = artist.statistics?.albumCount || 0;
                    score += albumCount * 10;

                    // Exact name match bonus (case-insensitive)
                    const artistNameNormalized = (artist.artistName || "")
                        .toLowerCase()
                        .trim();
                    const searchNameNormalized = artistName
                        .toLowerCase()
                        .trim();

                    if (artistNameNormalized === searchNameNormalized) {
                        score += 500;
                    } else if (
                        artistNameNormalized.includes(searchNameNormalized) ||
                        searchNameNormalized.includes(artistNameNormalized)
                    ) {
                        score += 250; // Partial match
                    }

                    // Popularity
                    if (artist.ratings?.votes && artist.ratings?.votes > 0) {
                        score += Math.min(artist.ratings.votes / 10, 100);
                    }

                    // Penalize "Various Artists" entries
                    if (
                        artistNameNormalized.includes("various") ||
                        artistNameNormalized.includes("compilation")
                    ) {
                        score -= 1000;
                    }

                    return { artist, score };
                });

                // Sort by score
                scoredResults.sort((a, b) => b.score - a.score);

                // Log candidates for debugging
                console.log("   Candidates:");
                scoredResults.slice(0, 3).forEach((item, i) => {
                    console.log(
                        `     ${i + 1}. "${item.artist.artistName}" - Type: ${
                            item.artist.artistType || "Unknown"
                        } - Albums: ${
                            item.artist.statistics?.albumCount || 0
                        } - Score: ${item.score}${i === 0 ? " ← SELECTED" : ""}`
                    );
                });

                artistData = scoredResults[0].artist;
            }

            // Check if already exists
            const existingArtists = await this.client.get("/api/v1/artist");
            const exists = existingArtists.data.find(
                (a: LidarrArtist) =>
                    a.foreignArtistId === artistData.foreignArtistId ||
                    (mbid && a.foreignArtistId === mbid)
            );

            if (exists) {
                console.log(`Artist already in Lidarr: ${artistName}`);

                // If monitorAllAlbums is true, update the artist to monitor all albums
                if (monitorAllAlbums) {
                    console.log(`   Updating artist to monitor all albums...`);
                    try {
                        // Update artist settings
                        const updated = await this.client.put(
                            `/api/v1/artist/${exists.id}`,
                            {
                                ...exists,
                                monitored: true,
                                monitorNewItems: "all",
                            }
                        );

                        // Get all albums for this artist and monitor them
                        const albumsResponse = await this.client.get(
                            `/api/v1/album?artistId=${exists.id}`
                        );
                        const albums = albumsResponse.data;

                        console.log(
                            `   Found ${albums.length} albums to monitor`
                        );

                        // Monitor all albums
                        for (const album of albums) {
                            if (!album.monitored) {
                                await this.client.put(
                                    `/api/v1/album/${album.id}`,
                                    {
                                        ...album,
                                        monitored: true,
                                    }
                                );
                            }
                        }

                        // Trigger search for all albums if requested
                        if (searchForMissingAlbums && albums.length > 0) {
                            console.log(
                                `   Triggering search for ${albums.length} albums...`
                            );
                            await this.client.post("/api/v1/command", {
                                name: "AlbumSearch",
                                albumIds: albums.map((a: any) => a.id),
                            });
                        }

                        console.log(
                            `   Updated existing artist and monitored all albums`
                        );
                        return updated.data;
                    } catch (error: any) {
                        console.error(
                            `   Failed to update artist:`,
                            error.message
                        );
                        // Return original artist if update fails
                        return exists;
                    }
                }

                return exists;
            }

            // Add artist
            const response = await this.client.post("/api/v1/artist", {
                ...artistData,
                rootFolderPath: validRootFolder,
                qualityProfileId: 1, // Uses default profile - could be made configurable via settings
                metadataProfileId: 1,
                monitored: true,
                monitorNewItems: monitorAllAlbums ? "all" : "none",
                addOptions: {
                    monitor: monitorAllAlbums ? "all" : "none", // Monitor all existing albums
                    searchForMissingAlbums,
                },
            });

            console.log(`Added artist to Lidarr: ${artistName}`);
            return response.data;
        } catch (error: any) {
            console.error(
                "Lidarr add artist error:",
                error.response?.data || error.message
            );
            return null;
        }
    }

    async searchAlbum(
        artistName: string,
        albumTitle: string,
        rgMbid?: string
    ): Promise<LidarrAlbum[]> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            const searchTerm = rgMbid
                ? `lidarr:${rgMbid}`
                : `${artistName} ${albumTitle}`;
            console.log(`   Searching Lidarr for album: ${searchTerm}`);

            const response = await this.client.get("/api/v1/album/lookup", {
                params: {
                    term: searchTerm,
                },
            });

            console.log(`   Found ${response.data.length} album result(s)`);
            return response.data;
        } catch (error: any) {
            console.error(`   ✗ Lidarr album search error: ${error.message}`);
            if (error.response?.data) {
                console.error(`   Response:`, error.response.data);
            }
            return [];
        }
    }

    async addAlbum(
        rgMbid: string,
        artistName: string,
        albumTitle: string,
        rootFolderPath: string = "/music",
        artistMbid?: string
    ): Promise<LidarrAlbum | null> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            console.log(`   Adding album: ${albumTitle} by ${artistName}`);
            console.log(`   Album MBID: ${rgMbid}`);
            console.log(`   Artist MBID: ${artistMbid || "none"}`);

            // NEW APPROACH: Add artist first, then find album in their catalog
            // This avoids the broken external album search API

            // Check if artist exists
            const existingArtists = await this.client.get("/api/v1/artist");
            let artist = existingArtists.data.find(
                (a: LidarrArtist) =>
                    artistMbid && a.foreignArtistId === artistMbid
            );

            let justAddedArtist = false;

            if (!artist && artistMbid) {
                console.log(`   Adding artist first: ${artistName}`);

                // Add artist WITHOUT searching for all albums
                artist = await this.addArtist(
                    artistMbid,
                    artistName,
                    rootFolderPath,
                    false, // Don't auto-download all albums
                    false // Don't monitor all albums
                );

                if (!artist) {
                    console.error(`   ✗ Failed to add artist`);
                    return null;
                }

                justAddedArtist = true;
                console.log(
                    `   Artist added: ${artist.artistName} (ID: ${artist.id})`
                );
                console.log(
                    `   Waiting for Lidarr to populate album catalog...`
                );
            } else if (!artist) {
                console.error(`   ✗ Artist not found and no MBID provided`);
                return null;
            } else {
                console.log(
                    `   Artist already exists: ${artist.artistName} (ID: ${artist.id})`
                );
            }

            // If we just added the artist, wait and retry to get albums
            // Lidarr needs time to fetch metadata from MusicBrainz
            let artistAlbums: LidarrAlbum[] = [];
            let attempts = 0;
            const maxAttempts = justAddedArtist ? 10 : 1; // Only retry if we just added the artist
            const retryDelay = 2000; // 2 seconds between retries

            while (attempts < maxAttempts) {
                attempts++;

                const artistAlbumsResponse = await this.client.get(
                    `/api/v1/album?artistId=${artist.id}`
                );
                artistAlbums = artistAlbumsResponse.data;

                if (artistAlbums.length > 0 || !justAddedArtist) {
                    break; // Found albums or artist already existed
                }

                if (attempts < maxAttempts) {
                    console.log(
                        `   Attempt ${attempts}/${maxAttempts}: Found ${
                            artistAlbums.length
                        } albums, retrying in ${retryDelay / 1000}s...`
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, retryDelay)
                    );
                }
            }

            console.log(
                `   Found ${artistAlbums.length} albums for ${artist.artistName}`
            );

            // Find the specific album by MBID first
            let albumData = artistAlbums.find(
                (a: LidarrAlbum) => a.foreignAlbumId === rgMbid
            );

            // If MBID doesn't match, try fuzzy matching by name
            // Last.fm MBIDs may not match MusicBrainz MBIDs exactly
            if (!albumData) {
                console.log(
                    `   Album MBID not found, trying name match for: ${albumTitle}`
                );

                const normalizeTitle = (title: string) =>
                    title
                        .toLowerCase()
                        .replace(/[^\w\s]/g, "") // Remove punctuation
                        .replace(/\s+/g, " ") // Normalize whitespace
                        .trim();

                const targetTitle = normalizeTitle(albumTitle);

                // Try exact normalized match first
                albumData = artistAlbums.find(
                    (a: LidarrAlbum) => normalizeTitle(a.title) === targetTitle
                );

                // Try partial match if exact fails
                if (!albumData) {
                    albumData = artistAlbums.find((a: LidarrAlbum) => {
                        const normalized = normalizeTitle(a.title);
                        return (
                            normalized.includes(targetTitle) ||
                            targetTitle.includes(normalized)
                        );
                    });
                }

                if (albumData) {
                    console.log(
                        `   Matched by name: "${albumData.title}" (MBID: ${albumData.foreignAlbumId})`
                    );
                }
            }

            if (!albumData) {
                console.error(
                    `   ✗ Album ${albumTitle} not found in artist's catalog`
                );
                if (artistAlbums.length > 0) {
                    console.log(`   Available albums:`);
                    artistAlbums.slice(0, 5).forEach((a: LidarrAlbum) => {
                        console.log(`     - ${a.title} (${a.foreignAlbumId})`);
                    });
                }
                return null;
            }

            console.log(`   Found album in catalog: ${albumData.title}`);

            // Ensure artist is monitored (might have been added with monitoring disabled)
            if (!artist.monitored) {
                console.log(`   Enabling artist monitoring...`);
                await this.client.put(`/api/v1/artist/${artist.id}`, {
                    ...artist,
                    monitored: true,
                });
                console.log(`   Artist monitoring enabled`);
            } else {
                console.log(`   Artist already monitored`);
            }

            // ALWAYS monitor and search for the album, even if already monitored
            // This ensures Lidarr picks up the request
            console.log(`   Setting album monitoring to true...`);
            console.log(
                `   Album before update:`,
                JSON.stringify(
                    {
                        id: albumData.id,
                        title: albumData.title,
                        monitored: albumData.monitored,
                        foreignAlbumId: albumData.foreignAlbumId,
                        releases: albumData.releases?.length || 0,
                    },
                    null,
                    2
                )
            );

            const updateResponse = await this.client.put(
                `/api/v1/album/${albumData.id}`,
                {
                    ...albumData,
                    monitored: true,
                }
            );

            console.log(
                `   Album after update:`,
                JSON.stringify(
                    {
                        id: updateResponse.data.id,
                        title: updateResponse.data.title,
                        monitored: updateResponse.data.monitored,
                        foreignAlbumId: updateResponse.data.foreignAlbumId,
                        releases: updateResponse.data.releases?.length || 0,
                    },
                    null,
                    2
                )
            );
            console.log(
                `   Album monitoring set (verified: ${updateResponse.data.monitored})`
            );

            // Refresh albumData with updated values
            albumData = updateResponse.data;

            // Check if album has releases - if not, refresh artist metadata from MusicBrainz
            const releaseCount = albumData.releases?.length || 0;
            if (releaseCount === 0) {
                console.warn(
                    ` Album has 0 releases - refreshing artist metadata from MusicBrainz...`
                );

                // Trigger artist refresh to fetch latest metadata
                await this.client.post("/api/v1/command", {
                    name: "RefreshArtist",
                    artistId: artist.id,
                });

                console.log(`   Waiting for metadata refresh to complete...`);
                // Wait for refresh to complete (Lidarr processes this asynchronously)
                await new Promise((resolve) => setTimeout(resolve, 5000));

                // Re-fetch the album to see if releases were populated
                const refreshedAlbumResponse = await this.client.get(
                    `/api/v1/album/${albumData.id}`
                );
                albumData = refreshedAlbumResponse.data;
                const newReleaseCount = albumData.releases?.length || 0;

                console.log(
                    `   After refresh: ${newReleaseCount} releases found`
                );

                if (newReleaseCount === 0) {
                    console.warn(` Still no releases after refresh!`);
                    console.warn(
                        `   This album may not be properly indexed in MusicBrainz yet.`
                    );
                    console.warn(`   Download will be attempted but may fail.`);
                }
            }

            // ALWAYS trigger search to download the album
            console.log(`   Triggering album search command...`);
            const searchResponse = await this.client.post("/api/v1/command", {
                name: "AlbumSearch",
                albumIds: [albumData.id],
            });
            console.log(
                `   Search command response:`,
                JSON.stringify(searchResponse.data, null, 2)
            );
            console.log(
                `   Search command sent (Command ID: ${searchResponse.data.id})`
            );

            if (releaseCount === 0) {
                console.log(
                    ` Album download initiated but likely will fail due to missing release data`
                );
            } else {
                console.log(`   Album download started: ${albumData.title}`);
            }
            return albumData;
        } catch (error: any) {
            console.error(
                "Lidarr add album error:",
                error.response?.data || error.message
            );
            return null;
        }
    }

    async rescanLibrary(): Promise<void> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            await this.client.post("/api/v1/command", {
                name: "RescanFolders",
            });

            console.log("Triggered Lidarr library rescan");
        } catch (error) {
            console.error("Lidarr rescan error:", error);
            throw error;
        }
    }

    async getArtists(): Promise<LidarrArtist[]> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return [];
        }

        try {
            const response = await this.client.get("/api/v1/artist");
            return response.data;
        } catch (error) {
            console.error("Lidarr get artists error:", error);
            return [];
        }
    }

    /**
     * Check if an album exists in Lidarr and has files (already downloaded)
     * Returns true if the album is already available in Lidarr
     */
    async isAlbumAvailable(albumMbid: string): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            // Search for the album by MBID
            const response = await this.client.get("/api/v1/album", {
                params: { foreignAlbumId: albumMbid },
            });

            const albums = response.data;
            if (!albums || albums.length === 0) {
                return false;
            }

            // Check if any matching album has files (statistics.percentOfTracks > 0)
            for (const album of albums) {
                if (album.foreignAlbumId === albumMbid) {
                    // Album exists in Lidarr - check if it has files
                    const hasFiles = album.statistics?.percentOfTracks > 0;
                    if (hasFiles) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error: any) {
            // If 404 or other error, album doesn't exist
            if (error.response?.status === 404) {
                return false;
            }
            console.error("Lidarr album check error:", error.message);
            return false;
        }
    }

    /**
     * Check if an artist exists in Lidarr
     */
    async isArtistInLidarr(artistMbid: string): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            const response = await this.client.get("/api/v1/artist");
            const artists = response.data;
            return artists.some((a: any) => a.foreignArtistId === artistMbid);
        } catch (error) {
            return false;
        }
    }
}

export const lidarrService = new LidarrService();

// ============================================
// Queue Cleaner Functions
// ============================================

// Types for queue monitoring
interface QueueItem {
    id: number;
    title: string;
    status: string;
    downloadId: string;
    trackedDownloadStatus: string;
    trackedDownloadState: string;
    statusMessages: { title: string; messages: string[] }[];
}

interface QueueResponse {
    page: number;
    pageSize: number;
    totalRecords: number;
    records: QueueItem[];
}

interface HistoryRecord {
    id: number;
    albumId: number;
    downloadId: string;
    eventType: string;
    date: string;
    data: {
        droppedPath?: string;
        importedPath?: string;
    };
    album: {
        id: number;
        title: string;
        foreignAlbumId: string; // MBID
    };
    artist: {
        name: string;
    };
}

interface HistoryResponse {
    page: number;
    pageSize: number;
    totalRecords: number;
    records: HistoryRecord[];
}

// Patterns that indicate a stuck download (case-insensitive matching)
const FAILED_IMPORT_PATTERNS = [
    // Import issues
    "No files found are eligible for import",
    "Not an upgrade for existing",
    "Not a Custom Format upgrade",
    // Unpack/extraction failures
    "Unable to extract",
    "Failed to extract",
    "Unpacking failed",
    "unpack error",
    "Error extracting",
    "extraction failed",
    "corrupt archive",
    "invalid archive",
    "CRC failed",
    "bad archive",
    // Download/transfer issues
    "Download failed",
    "import failed",
    "Sample",
];

/**
 * Clean stuck downloads from Lidarr queue
 * Returns items that were removed and will trigger automatic search for alternatives
 */
export async function cleanStuckDownloads(
    lidarrUrl: string,
    apiKey: string
): Promise<{ removed: number; items: string[] }> {
    const removed: string[] = [];

    try {
        // Fetch current queue
        const response = await axios.get<QueueResponse>(
            `${lidarrUrl}/api/v1/queue`,
            {
                params: {
                    page: 1,
                    pageSize: 100,
                    includeUnknownArtistItems: true,
                },
                headers: { "X-Api-Key": apiKey },
            }
        );

        console.log(
            ` Queue cleaner: checking ${response.data.records.length} items`
        );

        for (const item of response.data.records) {
            // Check if this item has a failed import message
            const allMessages =
                item.statusMessages?.flatMap((sm) => sm.messages) || [];

            // Log item details for debugging
            if (
                allMessages.length > 0 ||
                item.trackedDownloadStatus === "warning"
            ) {
                console.log(`   📋 ${item.title}`);
                console.log(
                    `      Status: ${item.status}, TrackedStatus: ${item.trackedDownloadStatus}, State: ${item.trackedDownloadState}`
                );
                if (allMessages.length > 0) {
                    console.log(`      Messages: ${allMessages.join("; ")}`);
                }
            }

            // Check for pattern matches in messages
            const hasFailedPattern = allMessages.some((msg) =>
                FAILED_IMPORT_PATTERNS.some((pattern) =>
                    msg.toLowerCase().includes(pattern.toLowerCase())
                )
            );

            // Also check if trackedDownloadStatus is "warning" with importPending state
            // These are items that have finished downloading but can't be imported
            const isStuckWarning =
                item.trackedDownloadStatus === "warning" &&
                item.trackedDownloadState === "importPending";

            const shouldRemove = hasFailedPattern || isStuckWarning;

            if (shouldRemove) {
                const reason = hasFailedPattern
                    ? "failed pattern match"
                    : "stuck warning state";
                console.log(`   [REMOVE] Removing ${item.title} (${reason})`);

                try {
                    // Remove from queue, blocklist the release, trigger new search
                    await axios.delete(`${lidarrUrl}/api/v1/queue/${item.id}`, {
                        params: {
                            removeFromClient: true, // Remove from NZBGet too
                            blocklist: true, // Don't try this release again
                            skipRedownload: false, // DO trigger new search
                        },
                        headers: { "X-Api-Key": apiKey },
                    });

                    removed.push(item.title);
                    console.log(`   Removed and blocklisted: ${item.title}`);
                } catch (deleteError: any) {
                    // Item might already be gone - that's fine
                    if (deleteError.response?.status !== 404) {
                        console.error(
                            `    Failed to remove ${item.title}:`,
                            deleteError.message
                        );
                    }
                }
            }
        }

        if (removed.length > 0) {
            console.log(
                ` Queue cleaner: removed ${removed.length} stuck item(s)`
            );
        }

        return { removed: removed.length, items: removed };
    } catch (error: any) {
        console.error("Queue clean failed:", error.message);
        throw error;
    }
}

/**
 * Get recently completed downloads from Lidarr history
 * Used to find orphaned completions (webhooks that never arrived)
 */
export async function getRecentCompletedDownloads(
    lidarrUrl: string,
    apiKey: string,
    sinceMinutes: number = 5
): Promise<HistoryRecord[]> {
    try {
        const response = await axios.get<HistoryResponse>(
            `${lidarrUrl}/api/v1/history`,
            {
                params: {
                    page: 1,
                    pageSize: 100,
                    sortKey: "date",
                    sortDirection: "descending",
                    eventType: 3, // 3 = downloadFolderImported (successful import)
                },
                headers: { "X-Api-Key": apiKey },
            }
        );

        // Filter to only recent imports (within last X minutes)
        const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000);
        return response.data.records.filter((record) => {
            return new Date(record.date) >= cutoff;
        });
    } catch (error: any) {
        console.error("Failed to fetch Lidarr history:", error.message);
        throw error;
    }
}

/**
 * Get the current queue count from Lidarr
 */
export async function getQueueCount(
    lidarrUrl: string,
    apiKey: string
): Promise<number> {
    try {
        const response = await axios.get<QueueResponse>(
            `${lidarrUrl}/api/v1/queue`,
            {
                params: {
                    page: 1,
                    pageSize: 1,
                },
                headers: { "X-Api-Key": apiKey },
            }
        );
        return response.data.totalRecords;
    } catch (error: any) {
        console.error("Failed to get queue count:", error.message);
        return 0;
    }
}
