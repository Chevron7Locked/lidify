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
     * Search for an album (release-group) by title and artist name
     * Returns the first matching release group or null
     */
    async searchAlbum(
        albumTitle: string,
        artistName: string
    ): Promise<{ id: string; title: string } | null> {
        const cacheKey = `mb:search:album:${artistName}:${albumTitle}`;

        return this.cachedRequest(cacheKey, async () => {
            const query = `releasegroup:"${albumTitle}" AND artist:"${artistName}"`;
            const response = await this.client.get("/release-group", {
                params: {
                    query,
                    limit: 1,
                    fmt: "json",
                },
            });

            const releaseGroups = response.data["release-groups"] || [];
            if (releaseGroups.length > 0) {
                return {
                    id: releaseGroups[0].id,
                    title: releaseGroups[0].title,
                };
            }
            return null;
        });
    }
}

export const musicBrainzService = new MusicBrainzService();
