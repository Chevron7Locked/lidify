import axios, { AxiosInstance } from "axios";
import { redisClient } from "../utils/redis";
import { rateLimiter } from "./rateLimiter";

class MusicBrainzService {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: "https://musicbrainz.org/ws/2",
            timeout: 10000,
            headers: {
                "User-Agent":
                    "Lidify/1.0.0 (https://github.com/Chevron7Locked/lidify)",
            },
        });
    }

    private async cachedRequest(
        cacheKey: string,
        requestFn: () => Promise<any>,
        ttlSeconds = 2592000 // 30 days
    ) {
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (err) {
            console.warn("Redis get error:", err);
        }

        // Use global rate limiter instead of local rate limiting
        const data = await rateLimiter.execute("musicbrainz", requestFn);

        try {
            await redisClient.setEx(cacheKey, ttlSeconds, JSON.stringify(data));
        } catch (err) {
            console.warn("Redis set error:", err);
        }

        return data;
    }

    async searchArtist(query: string, limit = 10) {
        const cacheKey = `mb:search:artist:${query}:${limit}`;

        return this.cachedRequest(cacheKey, async () => {
            const response = await this.client.get("/artist", {
                params: {
                    query,
                    limit,
                    fmt: "json",
                },
            });
            return response.data.artists || [];
        });
    }

    async getArtist(mbid: string, includes: string[] = ["url-rels", "tags"]) {
        const cacheKey = `mb:artist:${mbid}:${includes.join(",")}`;

        return this.cachedRequest(cacheKey, async () => {
            const response = await this.client.get(`/artist/${mbid}`, {
                params: {
                    inc: includes.join("+"),
                    fmt: "json",
                },
            });
            return response.data;
        });
    }

    async getReleaseGroups(
        artistMbid: string,
        types: string[] = ["album", "ep"],
        limit = 100
    ) {
        const cacheKey = `mb:rg:${artistMbid}:${types.join(",")}:${limit}`;

        return this.cachedRequest(cacheKey, async () => {
            const response = await this.client.get("/release-group", {
                params: {
                    artist: artistMbid,
                    type: types.join("|"),
                    limit,
                    fmt: "json",
                },
            });
            return response.data["release-groups"] || [];
        });
    }

    async getReleaseGroup(rgMbid: string) {
        const cacheKey = `mb:rg:${rgMbid}`;

        return this.cachedRequest(cacheKey, async () => {
            const response = await this.client.get(`/release-group/${rgMbid}`, {
                params: {
                    inc: "artist-credits+releases",
                    fmt: "json",
                },
            });
            return response.data;
        });
    }

    async getReleaseGroupDetails(rgMbid: string) {
        const cacheKey = `mb:rg:details:${rgMbid}`;

        return this.cachedRequest(cacheKey, async () => {
            const response = await this.client.get(`/release-group/${rgMbid}`, {
                params: {
                    inc: "artist-credits+releases+labels",
                    fmt: "json",
                },
            });
            return response.data;
        });
    }

    async getRelease(releaseMbid: string) {
        const cacheKey = `mb:release:${releaseMbid}`;

        return this.cachedRequest(cacheKey, async () => {
            const response = await this.client.get(`/release/${releaseMbid}`, {
                params: {
                    inc: "recordings+artist-credits+labels",
                    fmt: "json",
                },
            });
            return response.data;
        });
    }

    extractPrimaryArtist(artistCredits: any[]): string {
        if (!artistCredits || artistCredits.length === 0)
            return "Unknown Artist";
        return (
            artistCredits[0].name ||
            artistCredits[0].artist?.name ||
            "Unknown Artist"
        );
    }

    /**
     * Escape special characters for Lucene query syntax
     * MusicBrainz uses Lucene, which requires escaping: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
     */
    private escapeLucene(str: string): string {
        return str.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
    }

    /**
     * Normalize album/artist names for better matching
     * Removes common suffixes and cleans up the string
     */
    private normalizeForSearch(str: string): string {
        return str
            .replace(/\s*\([^)]*\)\s*/g, ' ')  // Remove parenthetical content
            .replace(/\s*\[[^\]]*\]\s*/g, ' ') // Remove bracketed content
            .replace(/\s*-\s*(deluxe|remastered|remaster|edition|version|expanded|bonus|explicit|clean|single)\s*/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Search for an album (release-group) by title and artist name
     * Returns the first matching release group or null
     * Uses multiple search strategies for better matching
     */
    async searchAlbum(
        albumTitle: string,
        artistName: string
    ): Promise<{ id: string; title: string } | null> {
        const cacheKey = `mb:search:album:${artistName}:${albumTitle}`;

        return this.cachedRequest(cacheKey, async () => {
            // Strategy 1: Exact match with escaped special characters
            const escapedTitle = this.escapeLucene(albumTitle);
            const escapedArtist = this.escapeLucene(artistName);

            try {
                const query1 = `releasegroup:"${escapedTitle}" AND artist:"${escapedArtist}"`;
                const response1 = await this.client.get("/release-group", {
                    params: {
                        query: query1,
                        limit: 5,
                        fmt: "json",
                    },
                });

                const releaseGroups1 = response1.data["release-groups"] || [];
                if (releaseGroups1.length > 0) {
                    return {
                        id: releaseGroups1[0].id,
                        title: releaseGroups1[0].title,
                    };
                }
            } catch (e) {
                // Continue to strategy 2
            }

            // Strategy 2: Normalized/cleaned title search
            const normalizedTitle = this.normalizeForSearch(albumTitle);
            const normalizedArtist = this.normalizeForSearch(artistName);

            if (normalizedTitle !== albumTitle || normalizedArtist !== artistName) {
                try {
                    const escapedNormTitle = this.escapeLucene(normalizedTitle);
                    const escapedNormArtist = this.escapeLucene(normalizedArtist);
                    const query2 = `releasegroup:"${escapedNormTitle}" AND artist:"${escapedNormArtist}"`;
                    const response2 = await this.client.get("/release-group", {
                        params: {
                            query: query2,
                            limit: 5,
                            fmt: "json",
                        },
                    });

                    const releaseGroups2 = response2.data["release-groups"] || [];
                    if (releaseGroups2.length > 0) {
                        return {
                            id: releaseGroups2[0].id,
                            title: releaseGroups2[0].title,
                        };
                    }
                } catch (e) {
                    // Continue to strategy 3
                }
            }

            // Strategy 3: Fuzzy search without quotes (last resort)
            try {
                // Use simple terms without quotes for fuzzy matching
                const simpleTitle = normalizedTitle.split(' ').slice(0, 3).join(' '); // First 3 words
                const simpleArtist = normalizedArtist.split(' ')[0]; // First word of artist
                const query3 = `${this.escapeLucene(simpleTitle)} AND artist:${this.escapeLucene(simpleArtist)}`;

                const response3 = await this.client.get("/release-group", {
                    params: {
                        query: query3,
                        limit: 10,
                        fmt: "json",
                    },
                });

                const releaseGroups3 = response3.data["release-groups"] || [];

                // Find a match where the artist name contains our search term
                for (const rg of releaseGroups3) {
                    const rgArtist = rg["artist-credit"]?.[0]?.name || rg["artist-credit"]?.[0]?.artist?.name || "";
                    if (rgArtist.toLowerCase().includes(simpleArtist.toLowerCase())) {
                        return {
                            id: rg.id,
                            title: rg.title,
                        };
                    }
                }
            } catch (e) {
                // All strategies failed
            }

            return null;
        });
    }
}

export const musicBrainzService = new MusicBrainzService();
