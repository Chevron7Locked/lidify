import { Router } from "express";
import { requireAuthOrToken } from "../middleware/auth";
import { prisma } from "../utils/db";
import { redisClient } from "../utils/redis";

const router = Router();

// All routes require auth (session or API key)
router.use(requireAuthOrToken);

/**
 * GET /homepage/genres
 * Get top genres from user's library with sample albums
 */
router.get("/genres", async (req, res) => {
    try {
        const { limit = "4" } = req.query; // Get top 4 genres by default
        const limitNum = parseInt(limit as string, 10);

        // Check Redis cache first (cache for 24 hours)
        const cacheKey = `homepage:genres:${limitNum}`;
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log(`[HOMEPAGE] Cache HIT for genres`);
                return res.json(JSON.parse(cached));
            }
        } catch (cacheError) {
            console.warn("[HOMEPAGE] Redis cache read error:", cacheError);
        }

        console.log(
            `[HOMEPAGE] ✗ Cache MISS for genres, fetching from database...`
        );

        // Get all albums with genres (excluding discovery albums)
        const albums = await prisma.album.findMany({
            where: {
                genres: {
                    isEmpty: false, // Only albums with genres
                },
                location: "LIBRARY", // Exclude discovery albums
            },
            select: {
                id: true,
                title: true,
                year: true,
                coverUrl: true,
                genres: true,
                artistId: true,
                artist: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        // Count genre occurrences
        const genreCounts = new Map<string, number>();
        for (const album of albums) {
            for (const genre of album.genres) {
                genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
            }
        }

        // Get top genres
        const topGenres = Array.from(genreCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limitNum)
            .map(([genre]) => genre);

        console.log(`[HOMEPAGE] Top genres: ${topGenres.join(", ")}`);

        // For each top genre, get sample albums (up to 10)
        const genresWithAlbums = topGenres.map((genre) => {
            const genreAlbums = albums
                .filter((a) => a.genres.includes(genre))
                .slice(0, 10)
                .map((a) => ({
                    id: a.id,
                    title: a.title,
                    year: a.year,
                    coverArt: a.coverUrl,
                    artist: {
                        id: a.artist.id,
                        name: a.artist.name,
                    },
                }));

            return {
                genre,
                albums: genreAlbums,
                totalCount: genreCounts.get(genre) || 0,
            };
        });

        // Cache for 24 hours
        try {
            await redisClient.setEx(
                cacheKey,
                24 * 60 * 60,
                JSON.stringify(genresWithAlbums)
            );
            console.log(`[HOMEPAGE] Cached genres for 24 hours`);
        } catch (cacheError) {
            console.warn("[HOMEPAGE] Redis cache write error:", cacheError);
        }

        res.json(genresWithAlbums);
    } catch (error) {
        console.error("Get homepage genres error:", error);
        res.status(500).json({ error: "Failed to fetch genres" });
    }
});

/**
 * GET /homepage/top-podcasts
 * Get top podcasts (most subscribed or most recent episodes)
 */
router.get("/top-podcasts", async (req, res) => {
    try {
        const { limit = "6" } = req.query; // Get top 6 podcasts by default
        const limitNum = parseInt(limit as string, 10);

        // Check Redis cache first (cache for 24 hours)
        const cacheKey = `homepage:top-podcasts:${limitNum}`;
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log(`[HOMEPAGE] Cache HIT for top podcasts`);
                return res.json(JSON.parse(cached));
            }
        } catch (cacheError) {
            console.warn("[HOMEPAGE] Redis cache read error:", cacheError);
        }

        console.log(
            `[HOMEPAGE] ✗ Cache MISS for top podcasts, fetching from database...`
        );

        // Get podcasts with episode counts
        const podcasts = await prisma.podcast.findMany({
            take: limitNum,
            orderBy: { createdAt: "desc" }, // Most recently added
            select: {
                id: true,
                title: true,
                author: true,
                description: true,
                imageUrl: true,
                _count: {
                    select: { episodes: true },
                },
            },
        });

        const result = podcasts.map((podcast) => ({
            id: podcast.id,
            title: podcast.title,
            author: podcast.author,
            description: podcast.description?.substring(0, 150) + "...",
            coverArt: podcast.imageUrl,
            episodeCount: podcast._count.episodes,
        }));

        // Cache for 24 hours
        try {
            await redisClient.setEx(
                cacheKey,
                24 * 60 * 60,
                JSON.stringify(result)
            );
            console.log(`[HOMEPAGE] Cached top podcasts for 24 hours`);
        } catch (cacheError) {
            console.warn("[HOMEPAGE] Redis cache write error:", cacheError);
        }

        res.json(result);
    } catch (error) {
        console.error("Get top podcasts error:", error);
        res.status(500).json({ error: "Failed to fetch top podcasts" });
    }
});

export default router;
