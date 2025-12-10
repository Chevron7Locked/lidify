import { prisma } from "../utils/db";
import { redisClient } from "../utils/redis";

interface SearchOptions {
    query: string;
    limit?: number;
    offset?: number;
}

interface ArtistSearchResult {
    id: string;
    name: string;
    mbid: string;
    heroUrl: string | null;
    rank: number;
}

interface AlbumSearchResult {
    id: string;
    title: string;
    artistId: string;
    artistName: string;
    year: number | null;
    coverUrl: string | null;
    rank: number;
}

interface TrackSearchResult {
    id: string;
    title: string;
    albumId: string;
    albumTitle: string;
    artistId: string;
    artistName: string;
    duration: number;
    rank: number;
}

interface PodcastSearchResult {
    id: string;
    title: string;
    author: string | null;
    description: string | null;
    imageUrl: string | null;
    episodeCount: number;
}

export class SearchService {
    /**
     * Convert user query to PostgreSQL tsquery format
     * Splits on whitespace and adds prefix matching (:*)
     * Example: "radio head" -> "radio:* & head:*"
     */
    private queryToTsquery(query: string): string {
        return query
            .trim()
            .split(/\s+/)
            .map((term) => `${term.replace(/[^\w]/g, "")}:*`)
            .join(" & ");
    }

    async searchArtists({
        query,
        limit = 20,
        offset = 0,
    }: SearchOptions): Promise<ArtistSearchResult[]> {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const tsquery = this.queryToTsquery(query);

        try {
            const results = await prisma.$queryRaw<ArtistSearchResult[]>`
        SELECT
          id,
          name,
          mbid,
          "heroUrl",
          ts_rank(search_vector, to_tsquery('english', ${tsquery})) AS rank
        FROM "Artist"
        WHERE search_vector @@ to_tsquery('english', ${tsquery})
        ORDER BY rank DESC, name ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

            return results;
        } catch (error) {
            console.error("Artist search error:", error);
            // Fallback to LIKE query if full-text search fails
            const results = await prisma.artist.findMany({
                where: {
                    name: {
                        contains: query,
                        mode: "insensitive",
                    },
                },
                select: {
                    id: true,
                    name: true,
                    mbid: true,
                    heroUrl: true,
                },
                take: limit,
                skip: offset,
                orderBy: {
                    name: "asc",
                },
            });

            return results.map((r) => ({ ...r, rank: 0 }));
        }
    }

    async searchAlbums({
        query,
        limit = 20,
        offset = 0,
    }: SearchOptions): Promise<AlbumSearchResult[]> {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const tsquery = this.queryToTsquery(query);

        try {
            const results = await prisma.$queryRaw<AlbumSearchResult[]>`
        SELECT
          a.id,
          a.title,
          a."artistId",
          ar.name as "artistName",
          a.year,
          a."coverUrl",
          GREATEST(
            ts_rank(a.search_vector, to_tsquery('english', ${tsquery})),
            ts_rank(ar.search_vector, to_tsquery('english', ${tsquery}))
          ) AS rank
        FROM "Album" a
        LEFT JOIN "Artist" ar ON a."artistId" = ar.id
        WHERE a.search_vector @@ to_tsquery('english', ${tsquery})
           OR ar.search_vector @@ to_tsquery('english', ${tsquery})
        ORDER BY rank DESC, a.title ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

            return results;
        } catch (error) {
            console.error("Album search error:", error);
            // Fallback to LIKE query - search both album title and artist name
            const results = await prisma.album.findMany({
                where: {
                    OR: [
                        {
                            title: {
                                contains: query,
                                mode: "insensitive",
                            },
                        },
                        {
                            artist: {
                                name: {
                                    contains: query,
                                    mode: "insensitive",
                                },
                            },
                        },
                    ],
                },
                select: {
                    id: true,
                    title: true,
                    artistId: true,
                    year: true,
                    coverUrl: true,
                    artist: {
                        select: {
                            name: true,
                        },
                    },
                },
                take: limit,
                skip: offset,
                orderBy: {
                    title: "asc",
                },
            });

            return results.map((r) => ({
                id: r.id,
                title: r.title,
                artistId: r.artistId,
                artistName: r.artist.name,
                year: r.year,
                coverUrl: r.coverUrl,
                rank: 0,
            }));
        }
    }

    async searchTracks({
        query,
        limit = 20,
        offset = 0,
    }: SearchOptions): Promise<TrackSearchResult[]> {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const tsquery = this.queryToTsquery(query);

        try {
            const results = await prisma.$queryRaw<TrackSearchResult[]>`
        SELECT
          t.id,
          t.title,
          t."albumId",
          t.duration,
          a.title as "albumTitle",
          a."artistId",
          ar.name as "artistName",
          ts_rank(t.search_vector, to_tsquery('english', ${tsquery})) AS rank
        FROM "Track" t
        LEFT JOIN "Album" a ON t."albumId" = a.id
        LEFT JOIN "Artist" ar ON a."artistId" = ar.id
        WHERE t.search_vector @@ to_tsquery('english', ${tsquery})
        ORDER BY rank DESC, t.title ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

            return results;
        } catch (error) {
            console.error("Track search error:", error);
            // Fallback to LIKE query
            const results = await prisma.track.findMany({
                where: {
                    title: {
                        contains: query,
                        mode: "insensitive",
                    },
                },
                select: {
                    id: true,
                    title: true,
                    albumId: true,
                    duration: true,
                    album: {
                        select: {
                            title: true,
                            artistId: true,
                            artist: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                },
                take: limit,
                skip: offset,
                orderBy: {
                    title: "asc",
                },
            });

            return results.map((r) => ({
                id: r.id,
                title: r.title,
                albumId: r.albumId,
                albumTitle: r.album.title,
                artistId: r.album.artistId,
                artistName: r.album.artist.name,
                duration: r.duration,
                rank: 0,
            }));
        }
    }

    async searchPodcasts({
        query,
        limit = 20,
        offset = 0,
    }: SearchOptions): Promise<PodcastSearchResult[]> {
        if (!query || query.trim().length === 0) {
            return [];
        }

        // Simple LIKE search for podcasts (no full-text search vector on podcasts yet)
        try {
            const results = await prisma.podcast.findMany({
                where: {
                    OR: [
                        {
                            title: {
                                contains: query,
                                mode: "insensitive",
                            },
                        },
                        {
                            author: {
                                contains: query,
                                mode: "insensitive",
                            },
                        },
                        {
                            description: {
                                contains: query,
                                mode: "insensitive",
                            },
                        },
                    ],
                },
                select: {
                    id: true,
                    title: true,
                    author: true,
                    description: true,
                    imageUrl: true,
                    episodeCount: true,
                },
                take: limit,
                skip: offset,
                orderBy: {
                    title: "asc",
                },
            });

            return results;
        } catch (error) {
            console.error("Podcast search error:", error);
            return [];
        }
    }

    async searchAll({ query, limit = 10 }: SearchOptions) {
        if (!query || query.trim().length === 0) {
            return {
                artists: [],
                albums: [],
                tracks: [],
                podcasts: [],
            };
        }

        // Check Redis cache first
        const cacheKey = `search:all:${query}:${limit}`;
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log(`[SEARCH] Cache HIT for query: "${query}"`);
                return JSON.parse(cached);
            }
        } catch (err) {
            console.warn("[SEARCH] Redis cache read error:", err);
        }

        console.log(
            `[SEARCH]  Cache MISS for query: "${query}" - fetching from database`
        );

        const [artists, albums, tracks, podcasts] = await Promise.all([
            this.searchArtists({ query, limit }),
            this.searchAlbums({ query, limit }),
            this.searchTracks({ query, limit }),
            this.searchPodcasts({ query, limit }),
        ]);

        const results = { artists, albums, tracks, podcasts };

        // Cache for 1 hour (search results don't change often)
        try {
            await redisClient.setEx(cacheKey, 3600, JSON.stringify(results));
        } catch (err) {
            console.warn("[SEARCH] Redis cache write error:", err);
        }

        return results;
    }
}

export const searchService = new SearchService();
