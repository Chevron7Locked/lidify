import axios, { AxiosInstance } from "axios";
import { config } from "../config";
import { getSystemSettings } from "../utils/systemSettings";

interface LidarrArtist {
    id: number;
    artistName: string;
    foreignArtistId: string; // MusicBrainz ID
    monitored: boolean;
    tags?: number[]; // Tag IDs
}

interface LidarrTag {
    id: number;
    label: string;
}

// Discovery tag label - used to identify discovery artists in Lidarr
const DISCOVERY_TAG_LABEL = "lidify-discovery";

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
                    console.warn("  Lidarr enabled but missing URL or API key");
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
            console.log(`  Root folder "${requestedPath}" not found in Lidarr`);
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
        monitorAllAlbums: boolean = true,
        isDiscovery: boolean = false
    ): Promise<LidarrArtist | null> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        // Get discovery tag ID if this is a discovery add
        let discoveryTagId: number | null = null;
        if (isDiscovery) {
            discoveryTagId = await this.getOrCreateDiscoveryTag();
            if (discoveryTagId) {
                console.log(`[LIDARR] Will apply discovery tag (ID: ${discoveryTagId}) to artist`);
            }
        }

        try {
            // Ensure root folder exists, fallback to default if not
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
                // STRICT MBID FILTERING - Only use exact MBID match
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

                // ADDITIONAL CHECK: If exact match is a "Group" with 0 albums,
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
                // FALLBACK: No MBID - Use smart filtering for best match
                console.log(" No MBID available - using smart selection...");

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

                // If this is a discovery add and artist doesn't have discovery tag, add it
                if (isDiscovery && discoveryTagId) {
                    const existingTags = exists.tags || [];
                    if (!existingTags.includes(discoveryTagId)) {
                        console.log(`   Adding discovery tag to existing artist...`);
                        await this.addTagsToArtist(exists.id, [discoveryTagId]);
                    }
                }

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

            // Add artist - use "existing" monitor option to ensure album catalog is fetched
            // even if we don't want to download all albums
            const artistPayload: any = {
                ...artistData,
                rootFolderPath: validRootFolder,
                qualityProfileId: 1, // Uses default profile - could be made configurable via settings
                metadataProfileId: 1,
                monitored: true,
                monitorNewItems: monitorAllAlbums ? "all" : "none",
                addOptions: {
                    monitor: "existing", // Always fetch album catalog, but don't monitor unless requested
                    searchForMissingAlbums,
                },
            };

            // Apply discovery tag if this is a discovery add
            if (discoveryTagId) {
                artistPayload.tags = [discoveryTagId];
            }

            const response = await this.client.post("/api/v1/artist", artistPayload);

            console.log(`Added artist to Lidarr: ${artistName}${isDiscovery ? " (tagged as discovery)" : ""}`);
            
            // Trigger metadata refresh to ensure album catalog is populated
            if (!searchForMissingAlbums) {
                console.log(`   Triggering metadata refresh for new artist...`);
                try {
                    await this.client.post("/api/v1/command", {
                        name: "RefreshArtist",
                        artistId: response.data.id,
                    });
                } catch (refreshError) {
                    console.warn(`   Metadata refresh command failed (non-blocking)`);
                }
            }
            
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

    /**
     * Get all albums for an artist that exist in Lidarr's catalog
     * Used for same-artist fallback to avoid trying MusicBrainz albums that Lidarr can't find
     */
    async getArtistAlbums(artistMbid: string): Promise<LidarrAlbum[]> {
        if (!this.client) {
            console.warn("Lidarr not enabled");
            return [];
        }

        try {
            // First find the artist in Lidarr
            const artistsResponse = await this.client.get("/api/v1/artist");
            const artist = artistsResponse.data.find(
                (a: LidarrArtist) => a.foreignArtistId === artistMbid
            );

            if (!artist) {
                console.log(`   Artist not found in Lidarr: ${artistMbid}`);
                return [];
            }

            // Get albums for this artist
            const albumsResponse = await this.client.get(`/api/v1/album?artistId=${artist.id}`);
            return albumsResponse.data || [];
        } catch (error: any) {
            console.error(`   Failed to get artist albums: ${error.message}`);
            return [];
        }
    }

    async addAlbum(
        rgMbid: string,
        artistName: string,
        albumTitle: string,
        rootFolderPath: string = "/music",
        artistMbid?: string,
        isDiscovery: boolean = false
    ): Promise<LidarrAlbum | null> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            console.log(`   Adding album: ${albumTitle} by ${artistName}${isDiscovery ? " (discovery)" : ""}`);
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

            // If discovery and artist exists, ensure they have the discovery tag
            if (isDiscovery && artist) {
                const discoveryTagId = await this.getOrCreateDiscoveryTag();
                if (discoveryTagId) {
                    const existingTags = artist.tags || [];
                    if (!existingTags.includes(discoveryTagId)) {
                        console.log(`   Adding discovery tag to existing artist...`);
                        await this.addTagsToArtist(artist.id, [discoveryTagId]);
                    }
                }
            }

            if (!artist && artistMbid) {
                console.log(`   Adding artist first: ${artistName}`);

                // Add artist WITHOUT searching for all albums
                // Pass isDiscovery to tag the artist appropriately
                artist = await this.addArtist(
                    artistMbid,
                    artistName,
                    rootFolderPath,
                    false, // Don't auto-download all albums
                    false, // Don't monitor all albums
                    isDiscovery // Tag as discovery if this is a discovery download
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

            // Get artist's albums from Lidarr
            let artistAlbums: LidarrAlbum[] = [];
            
            // First check - get current album list
            const artistAlbumsResponse = await this.client.get(
                `/api/v1/album?artistId=${artist.id}`
            );
            artistAlbums = artistAlbumsResponse.data;
            
            // If we just added the artist and no albums yet, wait for metadata to populate
            if (artistAlbums.length === 0 && justAddedArtist) {
                console.log(`   Waiting for Lidarr to fetch album metadata...`);

                // Increased timeout: 15 attempts * 3 seconds = 45 seconds total
                // Large artist catalogs (e.g., prolific bands) need more time
                const maxAttempts = 15;
                const retryDelay = 3000; // 3 seconds between retries
                
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                    
                    const retryResponse = await this.client.get(
                        `/api/v1/album?artistId=${artist.id}`
                    );
                    artistAlbums = retryResponse.data;
                    
                    if (artistAlbums.length > 0) {
                        console.log(`   Albums loaded after ${attempt * 3}s`);
                        break;
                    }
                    
                    if (attempt < maxAttempts) {
                        console.log(`   Attempt ${attempt}/${maxAttempts}: Still waiting...`);
                    }
                }
            } else if (artistAlbums.length === 0 && !justAddedArtist) {
                // Artist exists but has 0 albums - try refreshing metadata once
                console.log(`   Artist exists but has 0 albums - refreshing metadata...`);
                try {
                    await this.client.post("/api/v1/command", {
                        name: "RefreshArtist",
                        artistId: artist.id,
                    });
                    // Wait for refresh to complete
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                    
                    const retryResponse = await this.client.get(
                        `/api/v1/album?artistId=${artist.id}`
                    );
                    artistAlbums = retryResponse.data;
                } catch (refreshError) {
                    console.warn(`   Metadata refresh failed`);
                }
            }

            console.log(
                `   Found ${artistAlbums.length} albums for ${artist.artistName}`
            );

            // Find the specific album by MBID first
            let albumData = artistAlbums.find(
                (a: LidarrAlbum) => a.foreignAlbumId === rgMbid
            );

            // If MBID doesn't match, try STRICT name matching
            // IMPORTANT: We removed loose matching (base name, first word) because it caused
            // wrong albums to be downloaded (e.g., "A Trip To The Mystery Planet" matching "A Funk Odyssey")
            if (!albumData) {
                console.log(
                    `   Album MBID not found, trying STRICT name match for: ${albumTitle}`
                );

                // Normalize title for matching - remove parenthetical suffixes, edition markers, etc.
                const normalizeTitle = (title: string) =>
                    title
                        .toLowerCase()
                        .replace(/\(.*?\)/g, "") // Remove parenthetical content (deluxe edition, remaster, etc.)
                        .replace(/\[.*?\]/g, "") // Remove bracketed content
                        .replace(/[-–—]\s*(deluxe|remaster|bonus|special|anniversary|expanded|limited|collector).*$/i, "") // Remove edition suffixes
                        .replace(/[^\w\s]/g, "") // Remove remaining punctuation
                        .replace(/\s+/g, " ") // Normalize whitespace
                        .trim();

                const targetTitle = normalizeTitle(albumTitle);
                console.log(`   Normalized target: "${targetTitle}"`);

                // Try exact normalized match first
                albumData = artistAlbums.find(
                    (a: LidarrAlbum) => normalizeTitle(a.title) === targetTitle
                );
                if (albumData) {
                    console.log(`   ✓ Matched exact normalized: "${albumData.title}"`);
                }

                // Try partial match ONLY if one contains the other completely
                // This handles "Album Name" matching "Album Name (Deluxe Edition)"
                if (!albumData) {
                    albumData = artistAlbums.find((a: LidarrAlbum) => {
                        const normalized = normalizeTitle(a.title);
                        // Only match if one is a substring of the other AND they share significant content
                        // The shorter one must be at least 60% of the longer one's length
                        const shorter = normalized.length < targetTitle.length ? normalized : targetTitle;
                        const longer = normalized.length >= targetTitle.length ? normalized : targetTitle;
                        if (longer.includes(shorter) && shorter.length >= longer.length * 0.6) {
                            return true;
                        }
                        return false;
                    });
                    if (albumData) {
                        console.log(`   ✓ Matched partial (contained): "${albumData.title}"`);
                    }
                }

                // NO base name matching - this caused wrong albums to be matched
                // NO first word matching - this caused wrong albums to be matched
                // If we don't have an exact or contained match, we should FAIL
                // and let the discovery system find a different album

                if (albumData) {
                    console.log(
                        `   Final match: "${albumData.title}" (MBID: ${albumData.foreignAlbumId})`
                    );
                } else {
                    console.log(`   ✗ No strict match found - will NOT use loose matching to avoid wrong albums`);
                }
            }

            if (!albumData) {
                console.error(
                    `   ✗ Album "${albumTitle}" not found in artist's ${artistAlbums.length} albums`
                );
                if (artistAlbums.length > 0) {
                    console.log(`   Looking for: "${albumTitle}" (MBID: ${rgMbid})`);
                    console.log(`   Available albums in Lidarr (showing up to 10):`);
                    artistAlbums.slice(0, 10).forEach((a: LidarrAlbum) => {
                        console.log(`     - "${a.title}" (${a.foreignAlbumId})`);
                    });
                }
                // Return null - let the caller handle replacement logic
                // We should NOT download a random album that isn't what was requested
                return null;
            }

            console.log(`   Found album in catalog: ${albumData.title} (ID: ${albumData.id})`);

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

            // CRITICAL: Fetch the FULL album data from Lidarr
            // The album list endpoint may return incomplete data
            console.log(`   Fetching full album data from Lidarr...`);
            const fullAlbumResponse = await this.client.get(`/api/v1/album/${albumData.id}`);
            const fullAlbumData = fullAlbumResponse.data;
            
            console.log(`   Full album data retrieved:`, JSON.stringify({
                id: fullAlbumData.id,
                title: fullAlbumData.title,
                monitored: fullAlbumData.monitored,
                foreignAlbumId: fullAlbumData.foreignAlbumId,
                anyReleaseOk: fullAlbumData.anyReleaseOk,
                profileId: fullAlbumData.profileId,
                releases: fullAlbumData.releases?.length || 0,
            }, null, 2));

            // ALWAYS monitor and search for the album, even if already monitored
            // This ensures Lidarr picks up the request
            console.log(`   Setting album monitoring to true...`);

            const updateResponse = await this.client.put(
                `/api/v1/album/${fullAlbumData.id}`,
                {
                    ...fullAlbumData,
                    monitored: true,
                }
            );

            console.log(`   PUT response monitored: ${updateResponse.data.monitored}`);
            
            // CRITICAL: Re-fetch the album to verify the change actually persisted
            const verifyResponse = await this.client.get(`/api/v1/album/${fullAlbumData.id}`);
            const verifiedMonitored = verifyResponse.data.monitored;
            
            console.log(`   Album monitoring VERIFIED after re-fetch: ${verifiedMonitored}`);
            
            if (!verifiedMonitored) {
                console.error(`   ✗ CRITICAL: Album monitoring failed to persist!`);
                console.error(`   Full album data we sent:`, JSON.stringify(fullAlbumData, null, 2).slice(0, 500));
                console.error(`   Response from GET after PUT:`, JSON.stringify(verifyResponse.data, null, 2).slice(0, 500));
            }

            // Use the verified album data
            const updatedAlbum = verifyResponse.data;

            // Check if album has releases - if not, refresh artist metadata from MusicBrainz
            const releaseCount = updatedAlbum.releases?.length || 0;
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
                    `/api/v1/album/${updatedAlbum.id}`
                );
                const refreshedAlbum = refreshedAlbumResponse.data;
                const newReleaseCount = refreshedAlbum.releases?.length || 0;

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
            console.log(`   Triggering album search command for album ID ${updatedAlbum.id}...`);
            const searchResponse = await this.client.post("/api/v1/command", {
                name: "AlbumSearch",
                albumIds: [updatedAlbum.id],
            });
            console.log(
                `   Search command sent (Command ID: ${searchResponse.data.id})`
            );

            // Wait a moment and check if search found anything
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const commandStatus = await this.client.get(`/api/v1/command/${searchResponse.data.id}`);
            console.log(`   Search result: ${commandStatus.data.message || 'pending'}`);
            
            if (commandStatus.data.message?.includes('0 reports')) {
                console.warn(`   [WARN] No releases grabbed automatically. Album may require manual intervention.`);
            }

            console.log(`   Album download started: ${updatedAlbum.title}`);
            return updatedAlbum;
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
     * Delete an artist from Lidarr by MusicBrainz ID
     * This removes the artist and optionally deletes files
     */
    async deleteArtist(
        mbid: string,
        deleteFiles: boolean = true
    ): Promise<{ success: boolean; message: string }> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return { success: false, message: "Lidarr not enabled or configured" };
        }

        if (!mbid || mbid.startsWith("temp-")) {
            return { success: false, message: "Invalid or temporary MBID" };
        }

        try {
            // Find artist in Lidarr by foreignArtistId (MBID)
            const artists = await this.getArtists();
            const lidarrArtist = artists.find(a => a.foreignArtistId === mbid);

            if (!lidarrArtist) {
                console.log(`[LIDARR] Artist with MBID ${mbid} not found in Lidarr`);
                return { success: true, message: "Artist not in Lidarr (already removed or never added)" };
            }

            console.log(`[LIDARR] Deleting artist: ${lidarrArtist.artistName} (ID: ${lidarrArtist.id})`);

            // Delete the artist from Lidarr (with timeout to prevent hanging)
            await this.client.delete(`/api/v1/artist/${lidarrArtist.id}`, {
                params: {
                    deleteFiles: deleteFiles,
                    addImportListExclusion: false,
                },
                timeout: 30000, // 30 second timeout
            });

            console.log(`[LIDARR] Successfully deleted artist: ${lidarrArtist.artistName}`);
            return { success: true, message: `Deleted ${lidarrArtist.artistName} from Lidarr` };
        } catch (error: any) {
            console.error("[LIDARR] Delete artist error:", error?.message || error);
            return { success: false, message: error?.message || "Failed to delete from Lidarr" };
        }
    }

    /**
     * Delete an album from Lidarr by Lidarr album ID
     * This unmonitors the album and optionally deletes files
     */
    async deleteAlbum(
        lidarrAlbumId: number,
        deleteFiles: boolean = true
    ): Promise<{ success: boolean; message: string }> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return { success: false, message: "Lidarr not enabled or configured" };
        }

        try {
            console.log(`[LIDARR] Deleting album ID: ${lidarrAlbumId}`);

            // First get the album to check for track files
            const albumResponse = await this.client.get(`/api/v1/album/${lidarrAlbumId}`);
            const album = albumResponse.data;
            const artistId = album.artistId;
            const albumTitle = album.title || "Unknown";

            if (deleteFiles) {
                // Get track files for this album
                const trackFilesResponse = await this.client.get("/api/v1/trackFile", {
                    params: { albumId: lidarrAlbumId },
                });
                
                const trackFiles = trackFilesResponse.data;
                
                if (trackFiles && trackFiles.length > 0) {
                    // Delete each track file
                    for (const trackFile of trackFiles) {
                        try {
                            await this.client.delete(`/api/v1/trackFile/${trackFile.id}`);
                        } catch (e) {
                            // Ignore individual file deletion errors
                        }
                    }
                    console.log(`[LIDARR] Deleted ${trackFiles.length} track files for album: ${albumTitle}`);
                }
            }

            // Unmonitor the album (don't delete the album record, just unmonitor)
            await this.client.put(`/api/v1/album/${lidarrAlbumId}`, {
                ...album,
                monitored: false,
            });

            console.log(`[LIDARR] Successfully unmonitored album: ${albumTitle}`);
            return { success: true, message: `Deleted files and unmonitored ${albumTitle}` };
        } catch (error: any) {
            console.error("[LIDARR] Delete album error:", error?.message || error);
            return { success: false, message: error?.message || "Failed to delete album from Lidarr" };
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

    // ============================================
    // Tag Management Methods (for discovery tracking)
    // ============================================

    /**
     * Get all tags from Lidarr
     */
    async getTags(): Promise<LidarrTag[]> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return [];
        }

        try {
            const response = await this.client.get("/api/v1/tag");
            return response.data || [];
        } catch (error: any) {
            console.error("[LIDARR] Failed to get tags:", error.message);
            return [];
        }
    }

    /**
     * Create a new tag in Lidarr
     */
    async createTag(label: string): Promise<LidarrTag | null> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return null;
        }

        try {
            const response = await this.client.post("/api/v1/tag", { label });
            console.log(`[LIDARR] Created tag: ${label} (ID: ${response.data.id})`);
            return response.data;
        } catch (error: any) {
            console.error("[LIDARR] Failed to create tag:", error.message);
            return null;
        }
    }

    /**
     * Get or create the discovery tag
     * Returns the tag ID, caching it for subsequent calls
     */
    private discoveryTagId: number | null = null;

    async getOrCreateDiscoveryTag(): Promise<number | null> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return null;
        }

        // Return cached tag ID if available
        if (this.discoveryTagId !== null) {
            return this.discoveryTagId;
        }

        try {
            // Check if tag already exists
            const tags = await this.getTags();
            const existingTag = tags.find(t => t.label === DISCOVERY_TAG_LABEL);

            if (existingTag) {
                console.log(`[LIDARR] Found existing discovery tag (ID: ${existingTag.id})`);
                this.discoveryTagId = existingTag.id;
                return existingTag.id;
            }

            // Create the tag
            const newTag = await this.createTag(DISCOVERY_TAG_LABEL);
            if (newTag) {
                this.discoveryTagId = newTag.id;
                return newTag.id;
            }

            return null;
        } catch (error: any) {
            console.error("[LIDARR] Failed to get/create discovery tag:", error.message);
            return null;
        }
    }

    /**
     * Add tags to an artist
     */
    async addTagsToArtist(artistId: number, tagIds: number[]): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            // Get current artist data
            const response = await this.client.get(`/api/v1/artist/${artistId}`);
            const artist = response.data;

            // Merge new tags with existing (avoid duplicates)
            const existingTags = artist.tags || [];
            const mergedTags = [...new Set([...existingTags, ...tagIds])];

            // Update artist with new tags
            await this.client.put(`/api/v1/artist/${artistId}`, {
                ...artist,
                tags: mergedTags,
            });

            console.log(`[LIDARR] Added tags ${tagIds} to artist ${artist.artistName}`);
            return true;
        } catch (error: any) {
            console.error("[LIDARR] Failed to add tags to artist:", error.message);
            return false;
        }
    }

    /**
     * Remove tags from an artist
     */
    async removeTagsFromArtist(artistId: number, tagIds: number[]): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            // Get current artist data
            const response = await this.client.get(`/api/v1/artist/${artistId}`);
            const artist = response.data;

            // Remove specified tags
            const existingTags = artist.tags || [];
            const filteredTags = existingTags.filter((t: number) => !tagIds.includes(t));

            // Update artist with filtered tags
            await this.client.put(`/api/v1/artist/${artistId}`, {
                ...artist,
                tags: filteredTags,
            });

            console.log(`[LIDARR] Removed tags ${tagIds} from artist ${artist.artistName}`);
            return true;
        } catch (error: any) {
            console.error("[LIDARR] Failed to remove tags from artist:", error.message);
            return false;
        }
    }

    /**
     * Get all artists that have a specific tag
     */
    async getArtistsByTag(tagId: number): Promise<LidarrArtist[]> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return [];
        }

        try {
            const response = await this.client.get("/api/v1/artist");
            const artists: LidarrArtist[] = response.data;

            // Filter artists that have the specified tag
            return artists.filter(artist => artist.tags?.includes(tagId));
        } catch (error: any) {
            console.error("[LIDARR] Failed to get artists by tag:", error.message);
            return [];
        }
    }

    /**
     * Get all discovery-tagged artists (convenience method)
     */
    async getDiscoveryArtists(): Promise<LidarrArtist[]> {
        const tagId = await this.getOrCreateDiscoveryTag();
        if (!tagId) {
            return [];
        }
        return this.getArtistsByTag(tagId);
    }

    /**
     * Remove discovery tag from an artist by MBID
     * Used when user likes an album (artist becomes "owned")
     */
    async removeDiscoveryTagByMbid(artistMbid: string): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return false;
        }

        try {
            const tagId = await this.getOrCreateDiscoveryTag();
            if (!tagId) {
                return false;
            }

            // Find artist by MBID
            const artists = await this.getArtists();
            const artist = artists.find(a => a.foreignArtistId === artistMbid);

            if (!artist) {
                console.log(`[LIDARR] Artist ${artistMbid} not found in Lidarr`);
                return true; // Not an error - artist might not be in Lidarr
            }

            // Check if artist has the discovery tag
            if (!artist.tags?.includes(tagId)) {
                console.log(`[LIDARR] Artist ${artist.artistName} doesn't have discovery tag`);
                return true; // Already doesn't have tag
            }

            return await this.removeTagsFromArtist(artist.id, [tagId]);
        } catch (error: any) {
            console.error("[LIDARR] Failed to remove discovery tag:", error.message);
            return false;
        }
    }

    /**
     * Delete artist by Lidarr ID (used for cleanup)
     */
    async deleteArtistById(
        lidarrId: number,
        deleteFiles: boolean = true
    ): Promise<{ success: boolean; message: string }> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return { success: false, message: "Lidarr not enabled" };
        }

        try {
            await this.client.delete(`/api/v1/artist/${lidarrId}`, {
                params: {
                    deleteFiles,
                    addImportListExclusion: false,
                },
                timeout: 30000,
            });

            return { success: true, message: "Artist deleted" };
        } catch (error: any) {
            if (error.response?.status === 404) {
                return { success: true, message: "Artist already removed" };
            }
            console.error("[LIDARR] Delete artist by ID error:", error.message);
            return { success: false, message: error.message };
        }
    }

    // ============================================
    // Release Iteration Methods (for exhaustive retry)
    // ============================================

    /**
     * Get all available releases for an album from all indexers
     * This is what Lidarr's "Interactive Search" uses
     */
    async getAlbumReleases(lidarrAlbumId: number): Promise<LidarrRelease[]> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            console.log(`[LIDARR] Fetching releases for album ID: ${lidarrAlbumId}`);
            const response = await this.client.get("/api/v1/release", {
                params: { albumId: lidarrAlbumId },
                timeout: 60000, // 60s timeout for indexer searches
            });

            const releases: LidarrRelease[] = response.data || [];
            console.log(`[LIDARR] Found ${releases.length} releases from indexers`);

            // Sort by preferred criteria (Lidarr already sorts by quality/preferred words)
            // but we can add seeders as a secondary sort for torrents
            releases.sort((a, b) => {
                // Approved releases first
                if (a.approved && !b.approved) return -1;
                if (!a.approved && b.approved) return 1;

                // Higher seeders for torrents
                if (a.seeders !== undefined && b.seeders !== undefined) {
                    return b.seeders - a.seeders;
                }

                // Keep original order (Lidarr's quality sorting)
                return 0;
            });

            return releases;
        } catch (error: any) {
            console.error(`[LIDARR] Failed to fetch releases:`, error.message);
            return [];
        }
    }

    /**
     * Grab (download) a specific release by GUID
     * This tells Lidarr to download the specified release
     */
    async grabRelease(release: LidarrRelease): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            console.log(`[LIDARR] Grabbing release: ${release.title}`);
            console.log(`   GUID: ${release.guid}`);
            console.log(`   Indexer: ${release.indexer || 'unknown'}`);
            console.log(`   Size: ${Math.round((release.size || 0) / 1024 / 1024)} MB`);

            await this.client.post("/api/v1/release", {
                guid: release.guid,
                indexerId: release.indexerId || 0,
            });

            console.log(`[LIDARR] Release grabbed successfully`);
            return true;
        } catch (error: any) {
            console.error(`[LIDARR] Failed to grab release:`, error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Remove a download from queue and blocklist the release
     * Use skipRedownload=true since we'll manually grab the next release
     */
    async blocklistAndRemove(downloadId: string): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            throw new Error("Lidarr not enabled");
        }

        try {
            // Find the queue item by downloadId
            const queueResponse = await this.client.get("/api/v1/queue", {
                params: { page: 1, pageSize: 100 },
            });

            const queueItem = queueResponse.data.records.find(
                (item: any) => item.downloadId === downloadId
            );

            if (!queueItem) {
                console.log(`[LIDARR] Download ${downloadId} not found in queue (may already be removed)`);
                return true; // Consider it success if not in queue
            }

            console.log(`[LIDARR] Blocklisting and removing: ${queueItem.title}`);

            await this.client.delete(`/api/v1/queue/${queueItem.id}`, {
                params: {
                    removeFromClient: true,
                    blocklist: true,
                    skipRedownload: true, // We'll grab the next release manually
                },
            });

            console.log(`[LIDARR] Successfully blocklisted: ${queueItem.title}`);
            return true;
        } catch (error: any) {
            console.error(`[LIDARR] Failed to blocklist:`, error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Find queue item by download ID
     */
    async findQueueItemByDownloadId(downloadId: string): Promise<any | null> {
        await this.ensureInitialized();

        if (!this.enabled || !this.client) {
            return null;
        }

        try {
            const response = await this.client.get("/api/v1/queue", {
                params: { page: 1, pageSize: 100 },
            });

            return response.data.records.find(
                (item: any) => item.downloadId === downloadId
            ) || null;
        } catch (error: any) {
            console.error(`[LIDARR] Failed to find queue item:`, error.message);
            return null;
        }
    }
}

// Interface for release data from Lidarr (exported for use by simpleDownloadManager)
export interface LidarrRelease {
    guid: string;
    title: string;
    indexerId: number;
    indexer?: string;
    size?: number;
    seeders?: number;
    leechers?: number;
    protocol: string; // usenet, torrent
    approved: boolean;
    rejected: boolean;
    rejections?: string[];
    quality?: {
        quality: { name: string };
    };
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
    "Has missing tracks", // Individual tracks from discography packs
    "missing tracks",
    "Album match is not close enough", // Lidarr matching threshold failure
    "Artist name mismatch", // Manual import required - artist doesn't match
    "automatic import is not possible", // Generic auto-import failure
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

            // Log ALL items to understand what states we're seeing
            console.log(`   - ${item.title}`);
            console.log(
                `      Status: ${item.status}, TrackedStatus: ${item.trackedDownloadStatus}, State: ${item.trackedDownloadState}`
            );
            if (allMessages.length > 0) {
                console.log(`      Messages: ${allMessages.join("; ")}`);
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

            // CRITICAL: importFailed state is TERMINAL - will never recover
            // Don't wait for timeout, clean up immediately
            const isImportFailed = item.trackedDownloadState === "importFailed";

            const shouldRemove = hasFailedPattern || isStuckWarning || isImportFailed;

            if (shouldRemove) {
                const reason = isImportFailed
                    ? "importFailed state (terminal)"
                    : hasFailedPattern
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

/**
 * Check if a specific download is still actively downloading in Lidarr's queue
 * Returns true if actively downloading, false if not found or stuck
 */
export async function isDownloadActive(
    downloadId: string
): Promise<{ active: boolean; status?: string; progress?: number }> {
    const settings = await getSystemSettings();
    if (!settings?.lidarrEnabled || !settings.lidarrUrl || !settings.lidarrApiKey) {
        return { active: false };
    }

    try {
        const response = await axios.get<QueueResponse>(
            `${settings.lidarrUrl}/api/v1/queue`,
            {
                params: {
                    page: 1,
                    pageSize: 100,
                    includeUnknownArtistItems: true,
                },
                headers: { "X-Api-Key": settings.lidarrApiKey },
            }
        );

        const item = response.data.records.find(r => r.downloadId === downloadId);
        
        if (!item) {
            return { active: false, status: "not_found" };
        }

        // Check if it's actively downloading (not stuck in warning/failed state)
        const isActivelyDownloading = 
            item.status === "downloading" || 
            (item.trackedDownloadState === "downloading" && item.trackedDownloadStatus !== "warning");

        return {
            active: isActivelyDownloading,
            status: item.trackedDownloadState || item.status,
            progress: item.sizeleft && item.size 
                ? Math.round((1 - item.sizeleft / item.size) * 100) 
                : undefined
        };
    } catch (error: any) {
        console.error("Failed to check download status:", error.message);
        return { active: false };
    }
}
