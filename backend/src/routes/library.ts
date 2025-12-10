import { Router, Response } from "express";
import { requireAuth, requireAuthOrToken } from "../middleware/auth";
import { imageLimiter, apiLimiter } from "../middleware/rateLimiter";
import { lastFmService } from "../services/lastfm";
import { prisma } from "../utils/db";
import { getEnrichmentProgress } from "../workers/enrichment";
import { redisClient } from "../utils/redis";
import crypto from "crypto";
import path from "path";
import fs from "fs";

// Static imports for performance (avoid dynamic imports in hot paths)
import { config } from "../config";
import { fanartService } from "../services/fanart";
import { deezerService } from "../services/deezer";
import { musicBrainzService } from "../services/musicbrainz";
import { coverArtService } from "../services/coverArt";
import { getSystemSettings } from "../utils/systemSettings";
import { AudioStreamingService } from "../services/audioStreaming";
import { scanQueue } from "../workers/queues";
import { organizeSingles } from "../workers/organizeSingles";
import { enrichSimilarArtist } from "../workers/artistEnrichment";
import { extractColorsFromImage } from "../utils/colorExtractor";
import { dataCacheService } from "../services/dataCache";

const router = Router();

const applyCoverArtCorsHeaders = (res: Response, origin?: string) => {
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
        res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
};

// All routes require auth (session or API key)
router.use(requireAuthOrToken);

// Apply API rate limiter to routes that need it
// Skip rate limiting for high-traffic endpoints (cover-art, streaming)
router.use((req, res, next) => {
    // Skip rate limiting for cover-art endpoint (handled by imageLimiter separately)
    if (req.path.startsWith("/cover-art")) {
        return next();
    }
    // Skip rate limiting for streaming endpoints - audio must not be interrupted
    if (req.path.includes("/stream")) {
        return next();
    }
    // Apply API rate limiter to all other routes
    return apiLimiter(req, res, next);
});

/**
 * @openapi
 * /library/scan:
 *   post:
 *     summary: Start a library scan job
 *     description: Initiates a background job to scan the music directory and index all audio files
 *     tags: [Library]
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Library scan started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Library scan started"
 *                 jobId:
 *                   type: string
 *                   description: Job ID to track progress
 *                   example: "123"
 *                 musicPath:
 *                   type: string
 *                   example: "/path/to/music"
 *       500:
 *         description: Failed to start scan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/scan", async (req, res) => {
    try {

        if (!config.music.musicPath) {
            return res.status(500).json({
                error: "Music path not configured. Please set MUSIC_PATH environment variable.",
            });
        }

        const userId = req.user?.id || "system";

        // Add scan job to queue
        const job = await scanQueue.add("scan", {
            userId,
            musicPath: config.music.musicPath,
        });

        res.json({
            message: "Library scan started",
            jobId: job.id,
            musicPath: config.music.musicPath,
        });
    } catch (error) {
        console.error("Scan trigger error:", error);
        res.status(500).json({ error: "Failed to start scan" });
    }
});

// GET /library/scan/status/:jobId - Check scan job status
router.get("/scan/status/:jobId", async (req, res) => {
    try {
        const job = await scanQueue.getJob(req.params.jobId);

        if (!job) {
            return res.status(404).json({ error: "Job not found" });
        }

        const state = await job.getState();
        const progress = job.progress();
        const result = job.returnvalue;

        res.json({
            status: state,
            progress,
            result,
        });
    } catch (error) {
        console.error("Get scan status error:", error);
        res.status(500).json({ error: "Failed to get job status" });
    }
});

// POST /library/organize - Manually trigger organization script
router.post("/organize", async (req, res) => {
    try {

        // Run in background
        organizeSingles().catch((err) => {
            console.error("Manual organization failed:", err);
        });

        res.json({ message: "Organization started in background" });
    } catch (error) {
        console.error("Organization trigger error:", error);
        res.status(500).json({ error: "Failed to start organization" });
    }
});

// POST /library/artists/:id/enrich - Manually enrich artist metadata
router.post("/artists/:id/enrich", async (req, res) => {
    try {
        const artist = await prisma.artist.findUnique({
            where: { id: req.params.id },
        });

        if (!artist) {
            return res.status(404).json({ error: "Artist not found" });
        }

        // Use enrichment functions

        // Run enrichment in background
        enrichSimilarArtist(artist).catch((err) => {
            console.error(`Failed to enrich artist ${artist.name}:`, err);
        });

        res.json({ message: "Artist enrichment started in background" });
    } catch (error) {
        console.error("Enrich artist error:", error);
        res.status(500).json({ error: "Failed to enrich artist" });
    }
});

// GET /library/enrichment-progress - Get enrichment worker progress
router.get("/enrichment-progress", async (req, res) => {
    try {
        const progress = await getEnrichmentProgress();
        res.json(progress);
    } catch (error) {
        console.error("Failed to get enrichment progress:", error);
        res.status(500).json({ error: "Failed to get enrichment progress" });
    }
});

// POST /library/re-enrich-all - Re-enrich all artists with missing images (no auth required for convenience)
router.post("/re-enrich-all", async (req, res) => {
    try {
        // Reset all artists that have no heroUrl to "pending"
        const result = await prisma.artist.updateMany({
            where: {
                OR: [{ heroUrl: null }, { heroUrl: "" }],
            },
            data: {
                enrichmentStatus: "pending",
                lastEnriched: null,
            },
        });

        console.log(
            ` Reset ${result.count} artists with missing images to pending`
        );

        res.json({
            message: `Reset ${result.count} artists for re-enrichment`,
            count: result.count,
        });
    } catch (error) {
        console.error("Failed to reset artists:", error);
        res.status(500).json({ error: "Failed to reset artists" });
    }
});

// GET /library/recently-listened?limit=10
router.get("/recently-listened", async (req, res) => {
    try {
        const { limit = "10" } = req.query;
        const userId = req.user!.id;
        const limitNum = parseInt(limit as string, 10);

        const [recentPlays, inProgressAudiobooks, inProgressPodcasts] =
            await Promise.all([
                prisma.play.findMany({
                    where: {
                        userId,
                        // Exclude pure discovery plays (only show library and kept discovery)
                        source: { in: ["LIBRARY", "DISCOVERY_KEPT"] },
                        // Also filter by album location to exclude discovery albums
                        track: {
                            album: {
                                location: "LIBRARY",
                            },
                        },
                    },
                    orderBy: { playedAt: "desc" },
                    take: limitNum * 3, // Get more than needed to account for duplicates
                    include: {
                        track: {
                            include: {
                                album: {
                                    include: {
                                        artist: {
                                            select: {
                                                id: true,
                                                mbid: true,
                                                name: true,
                                                heroUrl: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
                prisma.audiobookProgress.findMany({
                    where: {
                        userId,
                        isFinished: false,
                        currentTime: { gt: 0 }, // Only show if actually started
                    },
                    orderBy: { lastPlayedAt: "desc" },
                    take: Math.ceil(limitNum / 3), // Get up to 1/3 for audiobooks
                }),
                prisma.podcastProgress.findMany({
                    where: {
                        userId,
                        isFinished: false,
                        currentTime: { gt: 0 }, // Only show if actually started
                    },
                    orderBy: { lastPlayedAt: "desc" },
                    take: limitNum * 2, // Get extra to account for deduplication
                    include: {
                        episode: {
                            include: {
                                podcast: {
                                    select: {
                                        id: true,
                                        title: true,
                                        author: true,
                                        imageUrl: true,
                                    },
                                },
                            },
                        },
                    },
                }),
            ]);

        // Deduplicate podcasts - keep only the most recently played episode per podcast
        const seenPodcasts = new Set();
        const uniquePodcasts = inProgressPodcasts
            .filter((pp) => {
                const podcastId = pp.episode.podcast.id;
                if (seenPodcasts.has(podcastId)) {
                    return false;
                }
                seenPodcasts.add(podcastId);
                return true;
            })
            .slice(0, Math.ceil(limitNum / 3)); // Limit to 1/3 after deduplication

        // Extract unique artists and audiobooks
        const items: any[] = [];
        const artistsMap = new Map();

        // Add music artists
        for (const play of recentPlays) {
            const artist = play.track.album.artist;
            if (!artistsMap.has(artist.id)) {
                artistsMap.set(artist.id, {
                    ...artist,
                    type: "artist",
                    lastPlayedAt: play.playedAt,
                });
            }
            if (items.length >= limitNum) break;
        }

        // Combine artists, audiobooks, and podcasts
        const combined = [
            ...Array.from(artistsMap.values()),
            ...inProgressAudiobooks.map((ab: any) => {
                // For audiobooks, prefix the path with 'audiobook__' so the frontend knows to use the audiobook endpoint
                const coverArt =
                    ab.coverUrl && !ab.coverUrl.startsWith("http")
                        ? `audiobook__${ab.coverUrl}`
                        : ab.coverUrl;

                return {
                    id: ab.audiobookshelfId,
                    name: ab.title,
                    coverArt,
                    type: "audiobook",
                    author: ab.author,
                    progress:
                        ab.duration > 0
                            ? Math.round((ab.currentTime / ab.duration) * 100)
                            : 0,
                    lastPlayedAt: ab.lastPlayedAt,
                };
            }),
            ...uniquePodcasts.map((pp: any) => ({
                id: pp.episode.podcast.id,
                episodeId: pp.episodeId,
                name: pp.episode.podcast.title,
                coverArt: pp.episode.podcast.imageUrl,
                type: "podcast",
                author: pp.episode.podcast.author,
                progress:
                    pp.duration > 0
                        ? Math.round((pp.currentTime / pp.duration) * 100)
                        : 0,
                lastPlayedAt: pp.lastPlayedAt,
            })),
        ];

        // Sort by lastPlayedAt and limit
        combined.sort(
            (a, b) =>
                new Date(b.lastPlayedAt).getTime() -
                new Date(a.lastPlayedAt).getTime()
        );
        const limitedItems = combined.slice(0, limitNum);

        // Get album counts for artists
        const artistIds = limitedItems
            .filter((item) => item.type === "artist")
            .map((item) => item.id);
        const albumCounts = await prisma.ownedAlbum.groupBy({
            by: ["artistId"],
            where: { artistId: { in: artistIds } },
            _count: { rgMbid: true },
        });
        const albumCountMap = new Map(
            albumCounts.map((ac) => [ac.artistId, ac._count.rgMbid])
        );

        // Add on-demand image fetching for artists without heroUrl
        const results = await Promise.all(
            limitedItems.map(async (item) => {
                if (item.type === "audiobook" || item.type === "podcast") {
                    return item;
                } else {
                    let coverArt = item.heroUrl;

                    // Fetch image on-demand if missing
                    if (!coverArt) {
                        console.log(
                            `[IMAGE] Fetching image on-demand for ${item.name}...`
                        );

                        // Check Redis cache first
                        const cacheKey = `hero-image:${item.id}`;
                        try {
                            const cached = await redisClient.get(cacheKey);
                            if (cached) {
                                coverArt = cached;
                                console.log(`  Found cached image`);
                            }
                        } catch (err) {
                            // Redis errors are non-critical
                        }

                        // Try Fanart.tv if we have real MBID
                        if (
                            !coverArt &&
                            item.mbid &&
                            !item.mbid.startsWith("temp-")
                        ) {
                            try {
                                coverArt = await fanartService.getArtistImage(
                                    item.mbid
                                );
                            } catch (err) {
                                // Fanart.tv failed, continue to next source
                            }
                        }

                        // Fallback to Deezer
                        if (!coverArt) {
                            try {
                                coverArt = await deezerService.getArtistImage(
                                    item.name
                                );
                            } catch (err) {
                                // Deezer failed, continue to next source
                            }
                        }

                        // Fallback to Last.fm
                        if (!coverArt) {
                            try {
                                const validMbid =
                                    item.mbid && !item.mbid.startsWith("temp-")
                                        ? item.mbid
                                        : undefined;
                                const lastfmInfo =
                                    await lastFmService.getArtistInfo(
                                        item.name,
                                        validMbid
                                    );

                                if (
                                    lastfmInfo.image &&
                                    lastfmInfo.image.length > 0
                                ) {
                                    const largestImage =
                                        lastfmInfo.image.find(
                                            (img: any) =>
                                                img.size === "extralarge" ||
                                                img.size === "mega"
                                        ) ||
                                        lastfmInfo.image[
                                            lastfmInfo.image.length - 1
                                        ];

                                    if (largestImage && largestImage["#text"]) {
                                        coverArt = largestImage["#text"];
                                        console.log(`  Found Last.fm image`);
                                    }
                                }
                            } catch (err) {
                                // Last.fm failed, leave as null
                            }
                        }

                        // Cache the result for 7 days
                        if (coverArt) {
                            try {
                                await redisClient.setEx(
                                    cacheKey,
                                    7 * 24 * 60 * 60,
                                    coverArt
                                );
                                console.log(`  Cached image for 7 days`);
                            } catch (err) {
                                // Redis errors are non-critical
                            }
                        }
                    }

                    return {
                        ...item,
                        coverArt,
                        albumCount: albumCountMap.get(item.id) || 0,
                    };
                }
            })
        );

        res.json({ items: results });
    } catch (error) {
        console.error("Get recently listened error:", error);
        res.status(500).json({ error: "Failed to fetch recently listened" });
    }
});

// GET /library/recently-added?limit=10
router.get("/recently-added", async (req, res) => {
    try {
        const { limit = "10" } = req.query;
        const limitNum = parseInt(limit as string, 10);

        // Get the 20 most recently added LIBRARY albums (by lastSynced timestamp)
        // This limits "Recently Added" to actual recent additions, not the entire library
        const recentAlbums = await prisma.album.findMany({
            where: { 
                location: "LIBRARY",
                tracks: { some: {} }, // Only albums with actual tracks
            },
            orderBy: { lastSynced: "desc" },
            take: 20, // Hard limit to last 20 albums
            include: {
                artist: {
                    select: {
                        id: true,
                        mbid: true,
                        name: true,
                        heroUrl: true,
                    },
                },
            },
        });

        // Extract unique artists from recent albums (preserving order of most recent)
        const artistsMap = new Map();
        for (const album of recentAlbums) {
            if (!artistsMap.has(album.artist.id)) {
                artistsMap.set(album.artist.id, album.artist);
            }
            if (artistsMap.size >= limitNum) break;
        }

        // Get album counts for each artist (only LIBRARY albums)
        const artistIds = Array.from(artistsMap.keys());
        const albumCounts = await prisma.album.groupBy({
            by: ["artistId"],
            where: {
                artistId: { in: artistIds },
                location: "LIBRARY",
                tracks: { some: {} },
            },
            _count: { id: true },
        });
        const albumCountMap = new Map(
            albumCounts.map((ac) => [ac.artistId, ac._count.id])
        );

        // ========== ON-DEMAND IMAGE FETCHING FOR RECENTLY ADDED ==========
        // For artists without heroUrl, fetch images on-demand
        const artistsWithImages = await Promise.all(
            Array.from(artistsMap.values()).map(async (artist) => {
                let coverArt = artist.heroUrl;

                if (!coverArt) {
                    console.log(
                        `[IMAGE] Fetching image on-demand for ${artist.name}...`
                    );

                    // Check Redis cache first
                    const cacheKey = `hero-image:${artist.id}`;
                    try {
                        const cached = await redisClient.get(cacheKey);
                        if (cached) {
                            coverArt = cached;
                            console.log(`  Found cached image`);
                        }
                    } catch (err) {
                        // Redis errors are non-critical
                    }

                    // Try Fanart.tv if we have real MBID
                    if (
                        !coverArt &&
                        artist.mbid &&
                        !artist.mbid.startsWith("temp-")
                    ) {
                        try {
                            coverArt = await fanartService.getArtistImage(
                                artist.mbid
                            );
                        } catch (err) {
                            // Fanart.tv failed, continue to next source
                        }
                    }

                    // Fallback to Deezer
                    if (!coverArt) {
                        try {
                            coverArt = await deezerService.getArtistImage(
                                artist.name
                            );
                        } catch (err) {
                            // Deezer failed, continue to next source
                        }
                    }

                    // Fallback to Last.fm
                    if (!coverArt) {
                        try {
                            const validMbid =
                                artist.mbid && !artist.mbid.startsWith("temp-")
                                    ? artist.mbid
                                    : undefined;
                            const lastfmInfo =
                                await lastFmService.getArtistInfo(
                                    artist.name,
                                    validMbid
                                );

                            if (
                                lastfmInfo.image &&
                                lastfmInfo.image.length > 0
                            ) {
                                const largestImage =
                                    lastfmInfo.image.find(
                                        (img: any) =>
                                            img.size === "extralarge" ||
                                            img.size === "mega"
                                    ) ||
                                    lastfmInfo.image[
                                        lastfmInfo.image.length - 1
                                    ];

                                if (largestImage && largestImage["#text"]) {
                                    coverArt = largestImage["#text"];
                                    console.log(`  Found Last.fm image`);
                                }
                            }
                        } catch (err) {
                            // Last.fm failed, leave as null
                        }
                    }

                    // Cache the result for 7 days
                    if (coverArt) {
                        try {
                            await redisClient.setEx(
                                cacheKey,
                                7 * 24 * 60 * 60,
                                coverArt
                            );
                            console.log(`  Cached image for 7 days`);
                        } catch (err) {
                            // Redis errors are non-critical
                        }
                    }
                }

                return {
                    ...artist,
                    coverArt,
                    albumCount: albumCountMap.get(artist.id) || 0,
                };
            })
        );

        res.json({ artists: artistsWithImages });
    } catch (error) {
        console.error("Get recently added error:", error);
        res.status(500).json({ error: "Failed to fetch recently added" });
    }
});

// GET /library/artists?query=&limit=&offset=&filter=owned|discovery|all
router.get("/artists", async (req, res) => {
    try {
        const {
            query = "",
            limit: limitParam = "500",
            offset: offsetParam = "0",
            filter = "owned", // owned (default), discovery, all
        } = req.query;
        const limit = Math.min(parseInt(limitParam as string, 10) || 500, 1000); // Max 1000
        const offset = parseInt(offsetParam as string, 10) || 0;

        // Build where clause based on filter
        let where: any = {
            albums: {
                some: {
                    tracks: { some: {} }, // Only artists with albums that have actual tracks
                },
            },
        };

        if (filter === "owned") {
            // Artists with at least 1 LIBRARY album OR an OwnedAlbum record (liked discovery)
            where.OR = [
                {
                    albums: {
                        some: {
                            location: "LIBRARY",
                            tracks: { some: {} },
                        },
                    },
                },
                {
                    // Include artists with OwnedAlbum records (includes liked discovery albums)
                    ownedAlbums: {
                        some: {},
                    },
                    albums: {
                        some: {
                            tracks: { some: {} },
                        },
                    },
                },
            ];
        } else if (filter === "discovery") {
            // Artists with ONLY DISCOVERY albums (no LIBRARY albums)
            where = {
                AND: [
                    {
                        albums: {
                            some: {
                                location: "DISCOVER",
                                tracks: { some: {} },
                            },
                        },
                    },
                    {
                        albums: {
                            none: {
                                location: "LIBRARY",
                            },
                        },
                    },
                ],
            };
        }
        // filter === "all" uses the default (any albums with tracks)

        if (query) {
            if (where.AND) {
                where.AND.push({ name: { contains: query as string, mode: "insensitive" } });
            } else {
                where.name = { contains: query as string, mode: "insensitive" };
            }
        }

        // Determine which album location to count based on filter
        const albumLocationFilter = filter === "discovery" ? "DISCOVER" : filter === "all" ? undefined : "LIBRARY";

        const [artistsWithAlbums, total] = await Promise.all([
            prisma.artist.findMany({
                where,
                skip: offset,
                take: limit,
                orderBy: { name: "asc" },
                select: {
                    id: true,
                    mbid: true,
                    name: true,
                    heroUrl: true,
                    albums: {
                        where: {
                            ...(albumLocationFilter ? { location: albumLocationFilter } : {}),
                            tracks: { some: {} },
                        },
                        select: {
                            id: true,
                        },
                    },
                },
            }),
            prisma.artist.count({ where }),
        ]);

        // Use DataCacheService for batch image lookup (DB + Redis, no API calls for lists)
        const imageMap = await dataCacheService.getArtistImagesBatch(
            artistsWithAlbums.map((a) => ({ id: a.id, heroUrl: a.heroUrl }))
        );

        const artistsWithImages = artistsWithAlbums.map((artist) => {
            const coverArt = imageMap.get(artist.id) || artist.heroUrl || null;
            return {
                id: artist.id,
                mbid: artist.mbid,
                name: artist.name,
                heroUrl: coverArt,
                coverArt, // Alias for frontend consistency
                albumCount: artist.albums.length,
            };
        });

        res.json({
            artists: artistsWithImages,
            total,
            offset,
            limit,
        });
    } catch (error: any) {
        console.error("[Library] Get artists error:", error?.message || error);
        console.error("[Library] Stack:", error?.stack);
        res.status(500).json({
            error: "Failed to fetch artists",
            details: error?.message,
        });
    }
});

// GET /library/enrichment-diagnostics - Debug why artist images aren't populating
router.get("/enrichment-diagnostics", async (req, res) => {
    try {
        // Get enrichment status breakdown
        const statusCounts = await prisma.artist.groupBy({
            by: ["enrichmentStatus"],
            _count: true,
        });

        // Get artists that completed enrichment but have no heroUrl
        const completedNoImage = await prisma.artist.count({
            where: {
                enrichmentStatus: "completed",
                OR: [{ heroUrl: null }, { heroUrl: "" }],
            },
        });

        // Get artists with temp MBIDs (can't use Fanart.tv)
        const tempMbidCount = await prisma.artist.count({
            where: {
                mbid: { startsWith: "temp-" },
            },
        });

        // Sample of artists with issues
        const problemArtists = await prisma.artist.findMany({
            where: {
                enrichmentStatus: "completed",
                OR: [{ heroUrl: null }, { heroUrl: "" }],
            },
            select: {
                id: true,
                name: true,
                mbid: true,
                enrichmentStatus: true,
                lastEnriched: true,
            },
            take: 10,
        });

        // Sample of failed artists
        const failedArtists = await prisma.artist.findMany({
            where: {
                enrichmentStatus: "failed",
            },
            select: {
                id: true,
                name: true,
                mbid: true,
                lastEnriched: true,
            },
            take: 10,
        });

        res.json({
            summary: {
                statusBreakdown: statusCounts.reduce((acc, s) => {
                    acc[s.enrichmentStatus || "unknown"] = s._count;
                    return acc;
                }, {} as Record<string, number>),
                completedWithoutImage: completedNoImage,
                tempMbidArtists: tempMbidCount,
            },
            problemArtists,
            failedArtists,
            suggestions: [
                completedNoImage > 0 ? `${completedNoImage} artists completed enrichment but have no image - external APIs may be failing or rate limited` : null,
                tempMbidCount > 0 ? `${tempMbidCount} artists have temp MBIDs - Fanart.tv won't work for them, relies on Deezer/Last.fm` : null,
                statusCounts.find(s => s.enrichmentStatus === "pending")?._count ? "Enrichment still in progress - check logs" : null,
                statusCounts.find(s => s.enrichmentStatus === "failed")?._count ? "Some artists failed enrichment - may need retry" : null,
            ].filter(Boolean),
        });
    } catch (error: any) {
        console.error("[Library] Enrichment diagnostics error:", error?.message);
        res.status(500).json({ error: "Failed to get diagnostics" });
    }
});

// POST /library/retry-enrichment - Retry failed enrichments
router.post("/retry-enrichment", async (req, res) => {
    try {
        // Reset failed artists to pending so worker picks them up
        const result = await prisma.artist.updateMany({
            where: { enrichmentStatus: "failed" },
            data: { enrichmentStatus: "pending" },
        });

        res.json({ 
            message: `Reset ${result.count} failed artists to pending`,
            count: result.count 
        });
    } catch (error: any) {
        console.error("[Library] Retry enrichment error:", error?.message);
        res.status(500).json({ error: "Failed to retry enrichment" });
    }
});

// GET /library/artists/:id
router.get("/artists/:id", async (req, res) => {
    try {
        const idParam = req.params.id;

        const artistInclude = {
            albums: {
                orderBy: { year: "desc" },
                include: {
                    tracks: {
                        orderBy: { trackNo: "asc" },
                        take: 10, // Top tracks
                        include: {
                            album: {
                                select: {
                                    id: true,
                                    title: true,
                                    coverUrl: true,
                                },
                            },
                        },
                    },
                },
            },
            ownedAlbums: true,
            similarFrom: {
                where: {
                    weight: {
                        gte: 0.1, // Only show 10%+ similarity (Last.fm match score)
                    },
                },
                take: 10,
                orderBy: { weight: "desc" },
                include: {
                    toArtist: {
                        select: {
                            id: true,
                            mbid: true,
                            name: true,
                            heroUrl: true,
                        },
                    },
                },
            },
        };

        // Try finding by ID first
        let artist = await prisma.artist.findUnique({
            where: { id: idParam },
            include: artistInclude,
        });

        // If not found by ID, try by name (for URL-encoded names)
        if (!artist) {
            const decodedName = decodeURIComponent(idParam);
            artist = await prisma.artist.findFirst({
                where: {
                    name: {
                        equals: decodedName,
                        mode: "insensitive",
                    },
                },
                include: artistInclude,
            });
        }

        // If not found and param looks like an MBID, try looking up by MBID
        if (
            !artist &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                idParam
            )
        ) {
            artist = await prisma.artist.findFirst({
                where: { mbid: idParam },
                include: artistInclude,
            });
        }

        if (!artist) {
            return res.status(404).json({ error: "Artist not found" });
        }

        // ========== DISCOGRAPHY HANDLING ==========
        // For enriched artists with ownedAlbums, skip expensive MusicBrainz calls
        // Only fetch from MusicBrainz if the artist hasn't been enriched yet
        let albumsWithOwnership = [];
        const ownedRgMbids = new Set(artist.ownedAlbums.map((o) => o.rgMbid));
        const isEnriched = artist.ownedAlbums.length > 0 || artist.heroUrl !== null;

        // If artist has temp MBID, try to find real MBID by searching MusicBrainz
        let effectiveMbid = artist.mbid;
        if (!effectiveMbid || effectiveMbid.startsWith("temp-")) {
            console.log(
                ` Artist has temp/no MBID, searching MusicBrainz for ${artist.name}...`
            );
            try {
                const searchResults = await musicBrainzService.searchArtist(
                    artist.name,
                    1
                );
                if (searchResults.length > 0) {
                    effectiveMbid = searchResults[0].id;
                    console.log(`  Found MBID: ${effectiveMbid}`);

                    // Update database with real MBID for future use (skip if duplicate)
                    try {
                        await prisma.artist.update({
                            where: { id: artist.id },
                            data: { mbid: effectiveMbid },
                        });
                    } catch (mbidError: any) {
                        // If MBID already exists for another artist, just log and continue
                        if (mbidError.code === "P2002") {
                            console.log(
                                `MBID ${effectiveMbid} already exists for another artist, skipping update`
                            );
                        } else {
                            console.error(
                                `  ✗ Failed to update MBID:`,
                                mbidError
                            );
                        }
                    }
                } else {
                    console.log(
                        `  ✗ No MusicBrainz match found for ${artist.name}`
                    );
                }
            } catch (error) {
                console.error(`  ✗ MusicBrainz search failed:`, error);
            }
        }

        // ========== ALWAYS include albums from database (actual owned files) ==========
        // These are albums with actual tracks on disk - they MUST show as owned
        const dbAlbums = artist.albums.map((album) => ({
            ...album,
            owned: true, // If it's in the database with tracks, user owns it!
            coverArt: album.coverUrl,
            source: "database" as const,
        }));

        console.log(
            `[Artist] Found ${dbAlbums.length} albums from database (actual owned files)`
        );

        // ========== Supplement with MusicBrainz discography for "available to download" ==========
        // Always fetch discography if we have a valid MBID - users need to see what's available
        const hasDbAlbums = dbAlbums.length > 0;
        const shouldFetchDiscography = effectiveMbid && !effectiveMbid.startsWith("temp-");

        if (shouldFetchDiscography) {
            try {
                // Check Redis cache first (cache for 24 hours)
                const discoCacheKey = `discography:${effectiveMbid}`;
                let releaseGroups: any[] = [];
                
                const cachedDisco = await redisClient.get(discoCacheKey);
                if (cachedDisco && cachedDisco !== "NOT_FOUND") {
                    releaseGroups = JSON.parse(cachedDisco);
                    console.log(`[Artist] Using cached discography (${releaseGroups.length} albums)`);
                } else {
                    console.log(`[Artist] Fetching discography from MusicBrainz...`);
                    releaseGroups = await musicBrainzService.getReleaseGroups(
                        effectiveMbid,
                        ["album", "ep"],
                        100
                    );
                    // Cache for 24 hours
                    await redisClient.setEx(discoCacheKey, 24 * 60 * 60, JSON.stringify(releaseGroups));
                }

                console.log(
                    `  Got ${releaseGroups.length} albums from MusicBrainz (before filtering)`
                );

                // Filter out live albums, compilations, soundtracks, remixes, etc.
                const excludedSecondaryTypes = [
                    "Live",
                    "Compilation",
                    "Soundtrack",
                    "Remix",
                    "DJ-mix",
                    "Mixtape/Street",
                    "Demo",
                    "Interview",
                    "Audio drama",
                    "Audiobook",
                    "Spokenword",
                ];

                const filteredReleaseGroups = releaseGroups.filter(
                    (rg: any) => {
                        // Keep if no secondary types (pure studio album/EP)
                        if (
                            !rg["secondary-types"] ||
                            rg["secondary-types"].length === 0
                        ) {
                            return true;
                        }
                        // Exclude if any secondary type matches our exclusion list
                        return !rg["secondary-types"].some((type: string) =>
                            excludedSecondaryTypes.includes(type)
                        );
                    }
                );

                console.log(
                    `  Filtered to ${filteredReleaseGroups.length} studio albums/EPs`
                );

                // Transform MusicBrainz release groups to album format
                // PERFORMANCE: Only check Redis cache for covers, don't make API calls
                // This makes artist pages load instantly after the first visit
                const mbAlbums = await Promise.all(
                    filteredReleaseGroups.map(async (rg: any) => {
                        let coverUrl = null;

                        // Only check Redis cache - don't make external API calls
                        // Covers will be fetched lazily by the frontend or during enrichment
                        const cacheKey = `caa:${rg.id}`;
                        try {
                            const cached = await redisClient.get(cacheKey);
                            if (cached && cached !== "NOT_FOUND") {
                                coverUrl = cached;
                            }
                        } catch (err) {
                            // Redis error, continue without cover
                        }

                        return {
                            id: rg.id,
                            rgMbid: rg.id,
                            title: rg.title,
                            year: rg["first-release-date"]
                                ? parseInt(
                                      rg["first-release-date"].substring(0, 4)
                                  )
                                : null,
                            type: rg["primary-type"],
                            coverUrl,
                            coverArt: coverUrl,
                            artistId: artist.id,
                            owned: ownedRgMbids.has(rg.id),
                            trackCount: 0,
                            tracks: [],
                            source: "musicbrainz" as const,
                        };
                    })
                );

                // Merge database albums with MusicBrainz albums
                // Database albums take precedence (they have actual files!)
                const dbAlbumTitles = new Set(
                    dbAlbums.map((a) => a.title.toLowerCase())
                );
                const mbAlbumsFiltered = mbAlbums.filter(
                    (a) => !dbAlbumTitles.has(a.title.toLowerCase())
                );

                albumsWithOwnership = [...dbAlbums, ...mbAlbumsFiltered];

                console.log(
                    `  Total albums: ${albumsWithOwnership.length} (${dbAlbums.length} owned from database, ${mbAlbumsFiltered.length} from MusicBrainz)`
                );
                console.log(
                    `  Owned: ${
                        albumsWithOwnership.filter((a) => a.owned).length
                    }, Available: ${
                        albumsWithOwnership.filter((a) => !a.owned).length
                    }`
                );
            } catch (error) {
                console.error(
                    `Failed to fetch MusicBrainz discography:`,
                    error
                );
                // Just use database albums
                albumsWithOwnership = dbAlbums;
            }
        } else {
            // No valid MBID - just use database albums
            console.log(
                `[Artist] No valid MBID, using ${dbAlbums.length} albums from database`
            );
            albumsWithOwnership = dbAlbums;
        }

        // Extract top tracks from library first
        const allTracks = artist.albums.flatMap((a) => a.tracks);
        let topTracks = allTracks
            .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
            .slice(0, 10);

        // Get user play counts for all tracks
        const userId = req.user!.id;
        const trackIds = allTracks.map((t) => t.id);
        const userPlays = await prisma.play.groupBy({
            by: ["trackId"],
            where: {
                userId,
                trackId: { in: trackIds },
            },
            _count: {
                id: true,
            },
        });
        const userPlayCounts = new Map(
            userPlays.map((p) => [p.trackId, p._count.id])
        );

        // Fetch Last.fm top tracks (cached for 24 hours)
        const topTracksCacheKey = `top-tracks:${artist.id}`;
        try {
            // Check cache first
            const cachedTopTracks = await redisClient.get(topTracksCacheKey);
            let lastfmTopTracks: any[] = [];
            
            if (cachedTopTracks && cachedTopTracks !== "NOT_FOUND") {
                lastfmTopTracks = JSON.parse(cachedTopTracks);
                console.log(`[Artist] Using cached top tracks (${lastfmTopTracks.length})`);
            } else {
                // Cache miss - fetch from Last.fm
                const validMbid =
                    effectiveMbid && !effectiveMbid.startsWith("temp-")
                        ? effectiveMbid
                        : "";
                lastfmTopTracks = await lastFmService.getArtistTopTracks(
                    validMbid,
                    artist.name,
                    10
                );
                // Cache for 24 hours
                await redisClient.setEx(topTracksCacheKey, 24 * 60 * 60, JSON.stringify(lastfmTopTracks));
                console.log(`[Artist] Cached ${lastfmTopTracks.length} top tracks`);
            }

            // For each Last.fm track, try to match with library track or add as unowned
            const combinedTracks: any[] = [];

            for (const lfmTrack of lastfmTopTracks) {
                // Try to find matching track in library
                const matchedTrack = allTracks.find(
                    (t) => t.title.toLowerCase() === lfmTrack.name.toLowerCase()
                );

                if (matchedTrack) {
                    // Track exists in library - include user play count
                    combinedTracks.push({
                        ...matchedTrack,
                        playCount: lfmTrack.playcount
                            ? parseInt(lfmTrack.playcount)
                            : matchedTrack.playCount,
                        listeners: lfmTrack.listeners
                            ? parseInt(lfmTrack.listeners)
                            : 0,
                        userPlayCount: userPlayCounts.get(matchedTrack.id) || 0,
                        album: {
                            ...matchedTrack.album,
                            coverArt: matchedTrack.album.coverUrl,
                        },
                    });
                } else {
                    // Track NOT in library - add as preview-only track
                    combinedTracks.push({
                        id: `lastfm-${artist.mbid || artist.name}-${
                            lfmTrack.name
                        }`,
                        title: lfmTrack.name,
                        playCount: lfmTrack.playcount
                            ? parseInt(lfmTrack.playcount)
                            : 0,
                        listeners: lfmTrack.listeners
                            ? parseInt(lfmTrack.listeners)
                            : 0,
                        duration: lfmTrack.duration
                            ? Math.floor(parseInt(lfmTrack.duration) / 1000)
                            : 0,
                        url: lfmTrack.url,
                        album: {
                            title: lfmTrack.album?.["#text"] || "Unknown Album",
                        },
                        userPlayCount: 0,
                        // NO album.id - this indicates track is not in library
                    });
                }
            }

            topTracks = combinedTracks.slice(0, 10);
        } catch (error) {
            console.error(
                `Failed to get Last.fm top tracks for ${artist.name}:`,
                error
            );
            // If Last.fm fails, add user play counts to library tracks
            topTracks = topTracks.map((t) => ({
                ...t,
                userPlayCount: userPlayCounts.get(t.id) || 0,
                album: {
                    ...t.album,
                    coverArt: t.album.coverUrl,
                },
            }));
        }

        // ========== HERO IMAGE FETCHING ==========
        // Use DataCacheService: DB -> Redis -> API -> save to both
        const heroUrl = await dataCacheService.getArtistImage(
            artist.id,
            artist.name,
            effectiveMbid
        );

        // ========== ON-DEMAND SIMILAR ARTISTS FETCHING ==========
        let similarArtists: any[] = [];
        const similarCacheKey = `similar-artists:${artist.id}`;

        if (artist.similarFrom.length === 0) {
            // Check Redis cache first (24-hour cache)
            const cachedSimilar = await redisClient.get(similarCacheKey);
            if (cachedSimilar && cachedSimilar !== "NOT_FOUND") {
                similarArtists = JSON.parse(cachedSimilar);
                console.log(`[Artist] Using cached similar artists (${similarArtists.length})`);
            } else {
                // Cache miss - fetch from Last.fm
                console.log(`[Artist] Fetching similar artists from Last.fm...`);

                try {
                    const validMbid =
                        effectiveMbid && !effectiveMbid.startsWith("temp-")
                            ? effectiveMbid
                            : undefined;
                    const lastfmSimilar = await lastFmService.getSimilarArtists(
                        validMbid,
                        artist.name,
                        10
                    );

                    // Fetch images in parallel (Deezer only - fastest source)
                    const similarWithImages = await Promise.all(
                        lastfmSimilar.map(async (s: any) => {
                            let image = null;
                            try {
                                image = await deezerService.getArtistImage(s.name);
                            } catch (err) {
                                // Deezer failed, leave null
                            }

                            return {
                                id: s.name,
                                name: s.name,
                                mbid: s.mbid || null,
                                coverArt: image,
                                albumCount: 0,
                                ownedAlbumCount: 0,
                                weight: s.match,
                            };
                        })
                    );

                    similarArtists = similarWithImages;
                    
                    // Cache for 24 hours
                    await redisClient.setEx(similarCacheKey, 24 * 60 * 60, JSON.stringify(similarArtists));
                    console.log(`[Artist] Cached ${similarArtists.length} similar artists`);
                } catch (error) {
                    console.error(`[Artist] Failed to fetch similar artists:`, error);
                    similarArtists = [];
                }
            }
        } else {
            // Use enriched data from database
            console.log(
                `[Artist] Using ${artist.similarFrom.length} similar artists from database`
            );

            // Format similar artists with coverArt and album counts
            const similarArtistIds = artist.similarFrom.map(
                (s) => s.toArtist.id
            );

            console.log(
                `Fetching album counts for ${similarArtistIds.length} similar artists...`
            );

            // Count TOTAL albums in discography (from Album - enriched MusicBrainz data)
            const discographyCounts = await prisma.album.groupBy({
                by: ["artistId"],
                where: { artistId: { in: similarArtistIds } },
                _count: { rgMbid: true },
            });
            const discographyCountMap = new Map(
                discographyCounts.map((ac) => [ac.artistId, ac._count.rgMbid])
            );
            console.log(
                `Discography counts: ${discographyCountMap.size} artists have albums`
            );

            // Count albums USER OWNS (from OwnedAlbum - tracking table)
            const userLibraryCounts = await prisma.ownedAlbum.groupBy({
                by: ["artistId"],
                where: { artistId: { in: similarArtistIds } },
                _count: { rgMbid: true },
            });
            const userLibraryCountMap = new Map(
                userLibraryCounts.map((ac) => [ac.artistId, ac._count.rgMbid])
            );
            console.log(
                `User library counts: ${userLibraryCountMap.size} artists are owned`
            );

            // Use DataCacheService for batch image lookup
            const similarImageMap = await dataCacheService.getArtistImagesBatch(
                artist.similarFrom.map((s) => ({
                    id: s.toArtist.id,
                    heroUrl: s.toArtist.heroUrl,
                }))
            );

            similarArtists = artist.similarFrom.map((s) => {
                const albumCount = discographyCountMap.get(s.toArtist.id) || 0;
                const ownedAlbumCount = userLibraryCountMap.get(s.toArtist.id) || 0;
                const coverArt = similarImageMap.get(s.toArtist.id) || s.toArtist.heroUrl || null;

                return {
                    ...s.toArtist,
                    coverArt,
                    albumCount,
                    ownedAlbumCount,
                    weight: s.weight,
                };
            });
        }

        res.json({
            ...artist,
            coverArt: heroUrl, // Use fetched hero image (falls back to artist.heroUrl)
            albums: albumsWithOwnership,
            topTracks,
            similarArtists,
        });
    } catch (error) {
        console.error("Get artist error:", error);
        res.status(500).json({ error: "Failed to fetch artist" });
    }
});

// GET /library/albums?artistId=&limit=&offset=&filter=owned|discovery|all
router.get("/albums", async (req, res) => {
    try {
        const {
            artistId,
            limit: limitParam = "500",
            offset: offsetParam = "0",
            filter = "owned", // owned (default), discovery, all
        } = req.query;
        const limit = Math.min(parseInt(limitParam as string, 10) || 500, 1000); // Max 1000
        const offset = parseInt(offsetParam as string, 10) || 0;

        let where: any = {
            tracks: { some: {} }, // Only albums with tracks
        };

        // Apply location filter
        if (filter === "owned") {
            // Get all owned album rgMbids (includes liked discovery albums)
            const ownedAlbumMbids = await prisma.ownedAlbum.findMany({
                select: { rgMbid: true },
            });
            const ownedMbids = ownedAlbumMbids.map(oa => oa.rgMbid);
            
            // Albums with LIBRARY location OR rgMbid in OwnedAlbum
            where.OR = [
                { location: "LIBRARY", tracks: { some: {} } },
                { rgMbid: { in: ownedMbids }, tracks: { some: {} } },
            ];
        } else if (filter === "discovery") {
            where.location = "DISCOVER";
        }
        // filter === "all" shows all locations

        // If artistId is provided, filter by artist
        if (artistId) {
            if (where.OR) {
                // If we have OR conditions, wrap with AND
                where = {
                    AND: [
                        { OR: where.OR },
                        { artistId: artistId as string }
                    ]
                };
            } else {
                where.artistId = artistId as string;
            }
        }

        const [albumsData, total] = await Promise.all([
            prisma.album.findMany({
                where,
                skip: offset,
                take: limit,
                orderBy: { year: "desc" },
                include: {
                    artist: {
                        select: {
                            id: true,
                            mbid: true,
                            name: true,
                        },
                    },
                },
            }),
            prisma.album.count({ where }),
        ]);

        // Normalize coverArt field for frontend
        const albums = albumsData.map((album) => ({
            ...album,
            coverArt: album.coverUrl,
        }));

        res.json({
            albums,
            total,
            offset,
            limit,
        });
    } catch (error: any) {
        console.error("[Library] Get albums error:", error?.message || error);
        console.error("[Library] Stack:", error?.stack);
        res.status(500).json({
            error: "Failed to fetch albums",
            details: error?.message,
        });
    }
});

// GET /library/albums/:id
router.get("/albums/:id", async (req, res) => {
    try {
        const idParam = req.params.id;

        // Try finding by ID first
        let album = await prisma.album.findUnique({
            where: { id: idParam },
            include: {
                artist: {
                    select: {
                        id: true,
                        mbid: true,
                        name: true,
                    },
                },
                tracks: {
                    orderBy: { trackNo: "asc" },
                },
            },
        });

        // If not found by ID, try by rgMbid (for discovery albums)
        if (!album) {
            album = await prisma.album.findFirst({
                where: { rgMbid: idParam },
                include: {
                    artist: {
                        select: {
                            id: true,
                            mbid: true,
                            name: true,
                        },
                    },
                    tracks: {
                        orderBy: { trackNo: "asc" },
                    },
                },
            });
        }

        if (!album) {
            return res.status(404).json({ error: "Album not found" });
        }

        // Check ownership
        const owned = await prisma.ownedAlbum.findUnique({
            where: {
                artistId_rgMbid: {
                    artistId: album.artistId,
                    rgMbid: album.rgMbid,
                },
            },
        });

        res.json({
            ...album,
            owned: !!owned,
            coverArt: album.coverUrl,
        });
    } catch (error) {
        console.error("Get album error:", error);
        res.status(500).json({ error: "Failed to fetch album" });
    }
});

// GET /library/tracks?albumId=&limit=100
router.get("/tracks", async (req, res) => {
    try {
        const { albumId, limit = "100" } = req.query;
        const limitNum = parseInt(limit as string, 10);

        const where: any = {};
        if (albumId) {
            where.albumId = albumId as string;
        }

        const tracksData = await prisma.track.findMany({
            where,
            take: limitNum,
            orderBy: albumId ? { trackNo: "asc" } : { id: "desc" },
            include: {
                album: {
                    include: {
                        artist: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        // Add coverArt field to albums
        const tracks = tracksData.map((track) => ({
            ...track,
            album: {
                ...track.album,
                coverArt: track.album.coverUrl,
            },
        }));

        res.json({ tracks });
    } catch (error) {
        console.error("Get tracks error:", error);
        res.status(500).json({ error: "Failed to fetch tracks" });
    }
});

// GET /library/cover-art/:id?size= or GET /library/cover-art?url=&size=
// Apply lenient image limiter (500 req/min) instead of general API limiter (100 req/15min)
router.get("/cover-art/:id?", imageLimiter, async (req, res) => {
    try {
        const { size, url } = req.query;
        let coverUrl: string;
        let isAudiobook = false;

        // Check if a full URL was provided as a query parameter
        if (url) {
            const decodedUrl = decodeURIComponent(url as string);

            // Check if this is an audiobook cover (prefixed with "audiobook__")
            if (decodedUrl.startsWith("audiobook__")) {
                isAudiobook = true;
                const audiobookPath = decodedUrl.replace("audiobook__", "");

                // Get Audiobookshelf settings
                const settings = await getSystemSettings();
                const audiobookshelfUrl =
                    settings?.audiobookshelfUrl ||
                    process.env.AUDIOBOOKSHELF_URL ||
                    "";
                const audiobookshelfApiKey =
                    settings?.audiobookshelfApiKey ||
                    process.env.AUDIOBOOKSHELF_API_KEY ||
                    "";
                const audiobookshelfBaseUrl = audiobookshelfUrl.replace(
                    /\/$/,
                    ""
                );

                coverUrl = `${audiobookshelfBaseUrl}/api/${audiobookPath}`;

                // Fetch with authentication
                console.log(
                    `[COVER-ART] Fetching audiobook cover: ${coverUrl.substring(
                        0,
                        100
                    )}...`
                );
                const imageResponse = await fetch(coverUrl, {
                    headers: {
                        Authorization: `Bearer ${audiobookshelfApiKey}`,
                        "User-Agent": "Lidify/1.0",
                    },
                });

                if (!imageResponse.ok) {
                    console.error(
                        `[COVER-ART] Failed to fetch audiobook cover: ${coverUrl} (${imageResponse.status} ${imageResponse.statusText})`
                    );
                    return res
                        .status(404)
                        .json({ error: "Audiobook cover art not found" });
                }

                const buffer = await imageResponse.arrayBuffer();
                const imageBuffer = Buffer.from(buffer);
                const contentType = imageResponse.headers.get("content-type");

                if (contentType) {
                    res.setHeader("Content-Type", contentType);
                }
                applyCoverArtCorsHeaders(
                    res,
                    req.headers.origin as string | undefined
                );
                res.setHeader(
                    "Cache-Control",
                    "public, max-age=31536000, immutable"
                );

                return res.send(imageBuffer);
            }

            // Check if this is a native cover (prefixed with "native:")
            if (decodedUrl.startsWith("native:")) {
                const nativePath = decodedUrl.replace("native:", "");

                const coverCachePath = path.join(
                    config.music.transcodeCachePath,
                    "../covers",
                    nativePath
                );

                console.log(
                    `[COVER-ART] Serving native cover: ${coverCachePath}`
                );

                // Check if file exists
                if (!fs.existsSync(coverCachePath)) {
                    console.error(
                        `[COVER-ART] Native cover not found: ${coverCachePath}`
                    );
                    return res
                        .status(404)
                        .json({ error: "Cover art not found" });
                }

                // Serve the file directly
                const requestOrigin = req.headers.origin;
                const headers: Record<string, string> = {
                    "Content-Type": "image/jpeg", // Assume JPEG for now
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Cross-Origin-Resource-Policy": "cross-origin",
                };
                if (requestOrigin) {
                    headers["Access-Control-Allow-Origin"] = requestOrigin;
                    headers["Access-Control-Allow-Credentials"] = "true";
                } else {
                    headers["Access-Control-Allow-Origin"] = "*";
                }

                return res.sendFile(coverCachePath, {
                    headers,
                });
            }

            coverUrl = decodedUrl;
        } else {
            // Otherwise use the ID from the path parameter
            const coverId = req.params.id;
            if (!coverId) {
                return res
                    .status(400)
                    .json({ error: "No cover ID or URL provided" });
            }

            const decodedId = decodeURIComponent(coverId);

            // Check if this is a native cover (prefixed with "native:")
            if (decodedId.startsWith("native:")) {
                const nativePath = decodedId.replace("native:", "");

                const coverCachePath = path.join(
                    config.music.transcodeCachePath,
                    "../covers",
                    nativePath
                );

                // Check if file exists
                if (fs.existsSync(coverCachePath)) {
                    // Serve the file directly
                    const requestOrigin = req.headers.origin;
                    const headers: Record<string, string> = {
                        "Content-Type": "image/jpeg",
                        "Cache-Control": "public, max-age=31536000, immutable",
                        "Cross-Origin-Resource-Policy": "cross-origin",
                    };
                    if (requestOrigin) {
                        headers["Access-Control-Allow-Origin"] = requestOrigin;
                        headers["Access-Control-Allow-Credentials"] = "true";
                    } else {
                        headers["Access-Control-Allow-Origin"] = "*";
                    }

                    return res.sendFile(coverCachePath, {
                        headers,
                    });
                }

                // Native cover file missing - try to find album and fetch from Deezer
                console.warn(
                    `[COVER-ART] Native cover not found: ${coverCachePath}, trying Deezer fallback`
                );

                // Extract album ID from the path (format: albumId.jpg)
                const albumId = nativePath.replace(".jpg", "");
                try {
                    const album = await prisma.album.findUnique({
                        where: { id: albumId },
                        include: { artist: true },
                    });

                    if (album && album.artist) {
                        const deezerCover = await deezerService.getAlbumCover(
                            album.artist.name,
                            album.title
                        );

                        if (deezerCover) {
                            // Update album with Deezer cover
                            await prisma.album.update({
                                where: { id: albumId },
                                data: { coverUrl: deezerCover },
                            });

                            // Redirect to the Deezer cover
                            return res.redirect(deezerCover);
                        }
                    }
                } catch (error) {
                    console.error(
                        `[COVER-ART] Failed to fetch Deezer fallback for ${albumId}:`,
                        error
                    );
                }

                return res.status(404).json({ error: "Cover art not found" });
            }

            // Check if this is an audiobook cover (prefixed with "audiobook__")
            if (decodedId.startsWith("audiobook__")) {
                isAudiobook = true;
                const audiobookPath = decodedId.replace("audiobook__", "");

                // Get Audiobookshelf settings
                const settings = await getSystemSettings();
                const audiobookshelfUrl =
                    settings?.audiobookshelfUrl ||
                    process.env.AUDIOBOOKSHELF_URL ||
                    "";
                const audiobookshelfApiKey =
                    settings?.audiobookshelfApiKey ||
                    process.env.AUDIOBOOKSHELF_API_KEY ||
                    "";
                const audiobookshelfBaseUrl = audiobookshelfUrl.replace(
                    /\/$/,
                    ""
                );

                coverUrl = `${audiobookshelfBaseUrl}/api/${audiobookPath}`;

                // Fetch with authentication
                console.log(
                    `[COVER-ART] Fetching audiobook cover: ${coverUrl.substring(
                        0,
                        100
                    )}...`
                );
                const imageResponse = await fetch(coverUrl, {
                    headers: {
                        Authorization: `Bearer ${audiobookshelfApiKey}`,
                        "User-Agent": "Lidify/1.0",
                    },
                });

                if (!imageResponse.ok) {
                    console.error(
                        `[COVER-ART] Failed to fetch audiobook cover: ${coverUrl} (${imageResponse.status} ${imageResponse.statusText})`
                    );
                    return res
                        .status(404)
                        .json({ error: "Audiobook cover art not found" });
                }

                const buffer = await imageResponse.arrayBuffer();
                const imageBuffer = Buffer.from(buffer);
                const contentType = imageResponse.headers.get("content-type");

                if (contentType) {
                    res.setHeader("Content-Type", contentType);
                }
                applyCoverArtCorsHeaders(
                    res,
                    req.headers.origin as string | undefined
                );
                res.setHeader(
                    "Cache-Control",
                    "public, max-age=31536000, immutable"
                );

                return res.send(imageBuffer);
            }
            // Check if coverId is already a full URL (from Cover Art Archive or elsewhere)
            else if (
                decodedId.startsWith("http://") ||
                decodedId.startsWith("https://")
            ) {
                coverUrl = decodedId;
            } else {
                // Invalid cover ID format
                return res
                    .status(400)
                    .json({ error: "Invalid cover ID format" });
            }
        }

        // Create cache key from URL + size
        const cacheKey = `cover-art:${crypto
            .createHash("md5")
            .update(`${coverUrl}-${size || "original"}`)
            .digest("hex")}`;

        // Try to get from Redis cache first
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                const cachedData = JSON.parse(cached);

                // Check if this is a cached 404
                if (cachedData.notFound) {
                    console.log(
                        `[COVER-ART] Cached 404 for ${coverUrl.substring(
                            0,
                            60
                        )}...`
                    );
                    return res
                        .status(404)
                        .json({ error: "Cover art not found" });
                }

                console.log(
                    `[COVER-ART] Cache HIT for ${coverUrl.substring(0, 60)}...`
                );
                const imageBuffer = Buffer.from(cachedData.data, "base64");

                // Check if client has cached version
                if (req.headers["if-none-match"] === cachedData.etag) {
                    console.log(`[COVER-ART] Client has cached version (304)`);
                    return res.status(304).end();
                }

                // Set headers and send cached image
                if (cachedData.contentType) {
                    res.setHeader("Content-Type", cachedData.contentType);
                }
                applyCoverArtCorsHeaders(
                    res,
                    req.headers.origin as string | undefined
                );
                res.setHeader(
                    "Cache-Control",
                    "public, max-age=31536000, immutable"
                );
                res.setHeader("ETag", cachedData.etag);
                return res.send(imageBuffer);
            } else {
                console.log(
                    `[COVER-ART] ✗ Cache MISS for ${coverUrl.substring(
                        0,
                        60
                    )}...`
                );
            }
        } catch (cacheError) {
            console.warn("[COVER-ART] Redis cache read error:", cacheError);
        }

        // Fetch the image and proxy it to avoid CORS issues
        console.log(`[COVER-ART] Fetching: ${coverUrl.substring(0, 100)}...`);
        const imageResponse = await fetch(coverUrl, {
            headers: {
                "User-Agent": "Lidify/1.0",
            },
        });
        if (!imageResponse.ok) {
            console.error(
                `[COVER-ART] Failed to fetch: ${coverUrl} (${imageResponse.status} ${imageResponse.statusText})`
            );

            // Cache 404s for 1 hour to avoid repeatedly trying to fetch missing images
            if (imageResponse.status === 404) {
                try {
                    await redisClient.setEx(
                        cacheKey,
                        60 * 60, // 1 hour
                        JSON.stringify({ notFound: true })
                    );
                    console.log(`[COVER-ART] Cached 404 response for 1 hour`);
                } catch (cacheError) {
                    console.warn(
                        "[COVER-ART] Redis cache write error:",
                        cacheError
                    );
                }
            }

            return res.status(404).json({ error: "Cover art not found" });
        }
        console.log(`[COVER-ART] Successfully fetched, caching...`);

        const buffer = await imageResponse.arrayBuffer();
        const imageBuffer = Buffer.from(buffer);

        // Generate ETag from content
        const etag = crypto.createHash("md5").update(imageBuffer).digest("hex");

        // Cache in Redis for 7 days
        try {
            const contentType = imageResponse.headers.get("content-type");
            await redisClient.setEx(
                cacheKey,
                7 * 24 * 60 * 60, // 7 days
                JSON.stringify({
                    etag,
                    contentType,
                    data: imageBuffer.toString("base64"),
                })
            );
        } catch (cacheError) {
            console.warn("Redis cache write error:", cacheError);
        }

        // Check if client has cached version
        if (req.headers["if-none-match"] === etag) {
            return res.status(304).end();
        }

        // Set appropriate headers
        const contentType = imageResponse.headers.get("content-type");
        if (contentType) {
            res.setHeader("Content-Type", contentType);
        }

        // Set aggressive caching headers
        applyCoverArtCorsHeaders(res, req.headers.origin as string | undefined);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // Cache for 1 year
        res.setHeader("ETag", etag);

        // Send the image
        res.send(imageBuffer);
    } catch (error) {
        console.error("Get cover art error:", error);
        res.status(500).json({ error: "Failed to fetch cover art" });
    }
});

// GET /library/album-cover/:mbid - Fetch and cache album cover by MBID
// This is called lazily by the frontend when an album doesn't have a cached cover
router.get("/album-cover/:mbid", imageLimiter, async (req, res) => {
    try {
        const { mbid } = req.params;
        
        if (!mbid || mbid.startsWith("temp-")) {
            return res.status(400).json({ error: "Valid MBID required" });
        }

        // Fetch from Cover Art Archive (this uses caching internally)
        const coverUrl = await coverArtService.getCoverArt(mbid);
        
        if (!coverUrl) {
            // Return 204 No Content instead of 404 to avoid console spam
            // Cover Art Archive doesn't have covers for all albums
            return res.status(204).send();
        }

        res.json({ coverUrl });
    } catch (error) {
        console.error("Get album cover error:", error);
        res.status(500).json({ error: "Failed to fetch cover art" });
    }
});

// GET /library/cover-art-colors?url= - Extract colors from a cover art URL
router.get("/cover-art-colors", imageLimiter, async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ error: "URL parameter required" });
        }

        const imageUrl = decodeURIComponent(url as string);

        // Handle placeholder images - return default fallback colors
        if (
            imageUrl.includes("placeholder") ||
            imageUrl.startsWith("/placeholder")
        ) {
            console.log(
                `[COLORS] Placeholder image detected, returning fallback colors`
            );
            return res.json({
                vibrant: "#1db954",
                darkVibrant: "#121212",
                lightVibrant: "#181818",
                muted: "#535353",
                darkMuted: "#121212",
                lightMuted: "#b3b3b3",
            });
        }

        // Create cache key for colors
        const cacheKey = `colors:${crypto
            .createHash("md5")
            .update(imageUrl)
            .digest("hex")}`;

        // Try to get from Redis cache first
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log(
                    `[COLORS] Cache HIT for ${imageUrl.substring(0, 60)}...`
                );
                return res.json(JSON.parse(cached));
            } else {
                console.log(
                    `[COLORS] ✗ Cache MISS for ${imageUrl.substring(0, 60)}...`
                );
            }
        } catch (cacheError) {
            console.warn("[COLORS] Redis cache read error:", cacheError);
        }

        // Fetch the image
        console.log(
            `[COLORS] Fetching image: ${imageUrl.substring(0, 100)}...`
        );
        const imageResponse = await fetch(imageUrl, {
            headers: {
                "User-Agent": "Lidify/1.0",
            },
        });

        if (!imageResponse.ok) {
            console.error(
                `[COLORS] Failed to fetch image: ${imageUrl} (${imageResponse.status})`
            );
            return res.status(404).json({ error: "Image not found" });
        }

        const buffer = await imageResponse.arrayBuffer();
        const imageBuffer = Buffer.from(buffer);

        // Extract colors using sharp
        const colors = await extractColorsFromImage(imageBuffer);

        console.log(`[COLORS] Extracted colors:`, colors);

        // Cache the result for 30 days
        try {
            await redisClient.setEx(
                cacheKey,
                30 * 24 * 60 * 60, // 30 days
                JSON.stringify(colors)
            );
            console.log(`[COLORS] Cached colors for 30 days`);
        } catch (cacheError) {
            console.warn("[COLORS] Redis cache write error:", cacheError);
        }

        res.json(colors);
    } catch (error) {
        console.error("Extract colors error:", error);
        res.status(500).json({ error: "Failed to extract colors" });
    }
});

// GET /library/tracks/:id/stream
router.get("/tracks/:id/stream", async (req, res) => {
    try {
        console.log("[STREAM] Request received for track:", req.params.id);
        const { quality } = req.query;
        const userId = req.user?.id;

        if (!userId) {
            console.log("[STREAM] No userId in session - unauthorized");
            return res.status(401).json({ error: "Unauthorized" });
        }

        const track = await prisma.track.findUnique({
            where: { id: req.params.id },
        });

        if (!track) {
            console.log("[STREAM] Track not found");
            return res.status(404).json({ error: "Track not found" });
        }

        // Log play start - only if this is a new playback session
        const recentPlay = await prisma.play.findFirst({
            where: {
                userId,
                trackId: track.id,
                playedAt: {
                    gte: new Date(Date.now() - 30 * 1000),
                },
            },
            orderBy: { playedAt: "desc" },
        });

        if (!recentPlay) {
            await prisma.play.create({
                data: {
                    userId,
                    trackId: track.id,
                },
            });
            console.log("[STREAM] Logged new play for track:", track.title);
        }

        // Get user's quality preference
        let requestedQuality: string = "medium";
        if (quality) {
            requestedQuality = quality as string;
        } else {
            const settings = await prisma.userSettings.findUnique({
                where: { userId },
            });
            requestedQuality = settings?.playbackQuality || "medium";
        }
        
        const ext = track.filePath ? path.extname(track.filePath).toLowerCase() : "";
        console.log(`[STREAM] Quality: requested=${quality || 'default'}, using=${requestedQuality}, format=${ext}`);

        // === NATIVE FILE STREAMING ===
        // Check if track has native file path
        if (track.filePath && track.fileModified) {
            try {
                // Initialize streaming service
                const streamingService = new AudioStreamingService(
                    config.music.musicPath,
                    config.music.transcodeCachePath,
                    config.music.transcodeCacheMaxGb
                );

                // Get absolute path to source file
                // Normalize path separators for cross-platform compatibility (Windows -> Linux)
                const normalizedFilePath = track.filePath.replace(/\\/g, '/');
                const absolutePath = path.join(
                    config.music.musicPath,
                    normalizedFilePath
                );

                console.log(
                    `[STREAM] Using native file: ${track.filePath} (${requestedQuality})`
                );

                // Get stream file (either original or transcoded)
                const { filePath, mimeType } =
                    await streamingService.getStreamFilePath(
                        track.id,
                        requestedQuality as any,
                        track.fileModified,
                        absolutePath
                    );

                // Stream file with range support
                console.log(`[STREAM] Sending file: ${filePath}, mimeType: ${mimeType}`);
                
                res.sendFile(filePath, {
                    headers: {
                        "Content-Type": mimeType,
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "public, max-age=31536000",
                        "Access-Control-Allow-Origin":
                            req.headers.origin || "*",
                        "Access-Control-Allow-Credentials": "true",
                        "Cross-Origin-Resource-Policy": "cross-origin",
                    },
                }, (err) => {
                    if (err) {
                        console.error(`[STREAM] sendFile error:`, err);
                    } else {
                        console.log(`[STREAM] File sent successfully: ${path.basename(filePath)}`);
                    }
                });

                return;
            } catch (err: any) {
                // If FFmpeg not found, try original quality instead
                if (
                    err.code === "FFMPEG_NOT_FOUND" &&
                    requestedQuality !== "original"
                ) {
                    console.warn(
                        `[STREAM] FFmpeg not available, falling back to original quality`
                    );
                    const fallbackFilePath = track.filePath.replace(/\\/g, '/');
                    const absolutePath = path.join(
                        config.music.musicPath,
                        fallbackFilePath
                    );

                    const streamingService = new AudioStreamingService(
                        config.music.musicPath,
                        config.music.transcodeCachePath,
                        config.music.transcodeCacheMaxGb
                    );

                    const { filePath, mimeType } =
                        await streamingService.getStreamFilePath(
                            track.id,
                            "original",
                            track.fileModified,
                            absolutePath
                        );

                    res.sendFile(filePath, {
                        headers: {
                            "Content-Type": mimeType,
                            "Accept-Ranges": "bytes",
                            "Cache-Control": "public, max-age=31536000",
                            "Access-Control-Allow-Origin":
                                req.headers.origin || "*",
                            "Access-Control-Allow-Credentials": "true",
                            "Cross-Origin-Resource-Policy": "cross-origin",
                        },
                    });

                    streamingService.destroy();
                    return;
                }

                console.error("[STREAM] Native streaming failed:", err.message);
                return res
                    .status(500)
                    .json({ error: "Failed to stream track" });
            }
        }

        // No file path available
        console.log("[STREAM] Track has no file path - unavailable");
        return res.status(404).json({ error: "Track not available" });
    } catch (error) {
        console.error("Stream track error:", error);
        res.status(500).json({ error: "Failed to stream track" });
    }
});

// GET /library/tracks/:id
router.get("/tracks/:id", async (req, res) => {
    try {
        const track = await prisma.track.findUnique({
            where: { id: req.params.id },
            include: {
                album: {
                    include: {
                        artist: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!track) {
            return res.status(404).json({ error: "Track not found" });
        }

        // Transform to match frontend Track interface: artist at top level
        const formattedTrack = {
            id: track.id,
            title: track.title,
            artist: {
                name: track.album?.artist?.name || "Unknown Artist",
                id: track.album?.artist?.id,
            },
            album: {
                title: track.album?.title || "Unknown Album",
                coverArt: track.album?.coverUrl,
                id: track.album?.id,
            },
            duration: track.duration,
        };

        res.json(formattedTrack);
    } catch (error) {
        console.error("Get track error:", error);
        res.status(500).json({ error: "Failed to fetch track" });
    }
});

// DELETE /library/tracks/:id
router.delete("/tracks/:id", async (req, res) => {
    try {
        const track = await prisma.track.findUnique({
            where: { id: req.params.id },
            include: {
                album: {
                    include: {
                        artist: true,
                    },
                },
            },
        });

        if (!track) {
            return res.status(404).json({ error: "Track not found" });
        }

        // Delete file from filesystem if path is available
        if (track.filePath) {
            try {

                const absolutePath = path.join(
                    config.music.musicPath,
                    track.filePath
                );

                if (fs.existsSync(absolutePath)) {
                    fs.unlinkSync(absolutePath);
                    console.log(`[DELETE] Deleted file: ${absolutePath}`);
                }
            } catch (err) {
                console.warn("[DELETE] Could not delete file:", err);
                // Continue with database deletion even if file deletion fails
            }
        }

        // Delete from database (cascade will handle related records)
        await prisma.track.delete({
            where: { id: track.id },
        });

        console.log(`[DELETE] Deleted track: ${track.title}`);

        res.json({ message: "Track deleted successfully" });
    } catch (error) {
        console.error("Delete track error:", error);
        res.status(500).json({ error: "Failed to delete track" });
    }
});

// DELETE /library/albums/:id
router.delete("/albums/:id", async (req, res) => {
    try {
        const album = await prisma.album.findUnique({
            where: { id: req.params.id },
            include: {
                artist: true,
                tracks: {
                    include: {
                        album: true,
                    },
                },
            },
        });

        if (!album) {
            return res.status(404).json({ error: "Album not found" });
        }


        // Delete all track files
        let deletedFiles = 0;
        for (const track of album.tracks) {
            if (track.filePath) {
                try {
                    const absolutePath = path.join(
                        config.music.musicPath,
                        track.filePath
                    );

                    if (fs.existsSync(absolutePath)) {
                        fs.unlinkSync(absolutePath);
                        deletedFiles++;
                    }
                } catch (err) {
                    console.warn("[DELETE] Could not delete file:", err);
                }
            }
        }

        // Try to delete album folder if empty
        try {
            const artistName = album.artist.name;
            const albumFolder = path.join(
                config.music.musicPath,
                artistName,
                album.title
            );

            if (fs.existsSync(albumFolder)) {
                const files = fs.readdirSync(albumFolder);
                if (files.length === 0) {
                    fs.rmdirSync(albumFolder);
                    console.log(
                        `[DELETE] Deleted empty album folder: ${albumFolder}`
                    );
                }
            }
        } catch (err) {
            console.warn("[DELETE] Could not delete album folder:", err);
        }

        // Delete from database (cascade will delete tracks)
        await prisma.album.delete({
            where: { id: album.id },
        });

        console.log(
            `[DELETE] Deleted album: ${album.title} (${deletedFiles} files)`
        );

        res.json({
            message: "Album deleted successfully",
            deletedFiles,
        });
    } catch (error) {
        console.error("Delete album error:", error);
        res.status(500).json({ error: "Failed to delete album" });
    }
});

// DELETE /library/artists/:id
router.delete("/artists/:id", async (req, res) => {
    try {
        const artist = await prisma.artist.findUnique({
            where: { id: req.params.id },
            include: {
                albums: {
                    include: {
                        tracks: true,
                    },
                },
            },
        });

        if (!artist) {
            return res.status(404).json({ error: "Artist not found" });
        }


        // Delete all track files and collect actual artist folders from file paths
        let deletedFiles = 0;
        const artistFoldersToDelete = new Set<string>();

        for (const album of artist.albums) {
            for (const track of album.tracks) {
                if (track.filePath) {
                    try {
                        const absolutePath = path.join(
                            config.music.musicPath,
                            track.filePath
                        );

                        if (fs.existsSync(absolutePath)) {
                            fs.unlinkSync(absolutePath);
                            deletedFiles++;

                            // Extract actual artist folder from file path
                            // Path format: Soulseek/Artist/Album/Track.mp3 OR Artist/Album/Track.mp3
                            const pathParts = track.filePath.split(path.sep);
                            if (pathParts.length >= 2) {
                                // If first part is "Soulseek", artist folder is Soulseek/Artist
                                // Otherwise, artist folder is just Artist
                                const actualArtistFolder =
                                    pathParts[0].toLowerCase() === "soulseek"
                                        ? path.join(
                                              config.music.musicPath,
                                              pathParts[0],
                                              pathParts[1]
                                          )
                                        : path.join(
                                              config.music.musicPath,
                                              pathParts[0]
                                          );
                                artistFoldersToDelete.add(actualArtistFolder);
                            } else if (pathParts.length === 1) {
                                // Single-level path (rare case)
                                const actualArtistFolder = path.join(
                                    config.music.musicPath,
                                    pathParts[0]
                                );
                                artistFoldersToDelete.add(actualArtistFolder);
                            }
                        }
                    } catch (err) {
                        console.warn("[DELETE] Could not delete file:", err);
                    }
                }
            }
        }

        // Delete artist folders based on actual file paths, not database name
        for (const artistFolder of artistFoldersToDelete) {
            try {
                if (fs.existsSync(artistFolder)) {
                    console.log(`[DELETE] Attempting to delete folder: ${artistFolder}`);
                    
                    // Always try recursive delete with force
                    fs.rmSync(artistFolder, {
                        recursive: true,
                        force: true,
                    });
                    console.log(`[DELETE] Successfully deleted artist folder: ${artistFolder}`);
                }
            } catch (err: any) {
                console.error(`[DELETE] Failed to delete artist folder ${artistFolder}:`, err?.message || err);
                
                // Try alternative: delete contents first, then folder
                try {
                    const files = fs.readdirSync(artistFolder);
                    for (const file of files) {
                        const filePath = path.join(artistFolder, file);
                        try {
                            const stat = fs.statSync(filePath);
                            if (stat.isDirectory()) {
                                fs.rmSync(filePath, { recursive: true, force: true });
                            } else {
                                fs.unlinkSync(filePath);
                            }
                            console.log(`[DELETE] Deleted: ${filePath}`);
                        } catch (fileErr: any) {
                            console.error(`[DELETE] Could not delete ${filePath}:`, fileErr?.message);
                        }
                    }
                    // Try deleting the now-empty folder
                    fs.rmdirSync(artistFolder);
                    console.log(`[DELETE] Deleted artist folder after manual cleanup: ${artistFolder}`);
                } catch (cleanupErr: any) {
                    console.error(`[DELETE] Cleanup also failed for ${artistFolder}:`, cleanupErr?.message);
                }
            }
        }

        // Also try deleting from common music folder paths (in case tracks weren't indexed)
        const commonPaths = [
            path.join(config.music.musicPath, artist.name),
            path.join(config.music.musicPath, "Soulseek", artist.name),
            path.join(config.music.musicPath, "discovery", artist.name),
        ];
        
        for (const commonPath of commonPaths) {
            if (fs.existsSync(commonPath) && !artistFoldersToDelete.has(commonPath)) {
                try {
                    fs.rmSync(commonPath, { recursive: true, force: true });
                    console.log(`[DELETE] Deleted additional artist folder: ${commonPath}`);
                } catch (err: any) {
                    console.error(`[DELETE] Could not delete ${commonPath}:`, err?.message);
                }
            }
        }

        // Delete from Lidarr if connected and artist has MBID
        let lidarrDeleted = false;
        let lidarrError: string | null = null;
        if (artist.mbid && !artist.mbid.startsWith("temp-")) {
            try {
                const { lidarrService } = await import("../services/lidarr");
                const lidarrResult = await lidarrService.deleteArtist(artist.mbid, true);
                if (lidarrResult.success) {
                    console.log(`[DELETE] Lidarr: ${lidarrResult.message}`);
                    lidarrDeleted = true;
                } else {
                    console.warn(`[DELETE] Lidarr deletion note: ${lidarrResult.message}`);
                    lidarrError = lidarrResult.message;
                }
            } catch (err: any) {
                console.warn("[DELETE] Could not delete from Lidarr:", err?.message || err);
                lidarrError = err?.message || "Unknown error";
            }
        }

        // Explicitly delete OwnedAlbum records first (should cascade, but being safe)
        try {
            await prisma.ownedAlbum.deleteMany({
                where: { artistId: artist.id },
            });
        } catch (err) {
            console.warn("[DELETE] Could not delete OwnedAlbum records:", err);
        }

        // Delete from database (cascade will delete albums and tracks)
        console.log(`[DELETE] Deleting artist from database: ${artist.name} (${artist.id})`);
        await prisma.artist.delete({
            where: { id: artist.id },
        });

        console.log(
            `[DELETE] Successfully deleted artist: ${artist.name} (${deletedFiles} files${lidarrDeleted ? ', removed from Lidarr' : ''})`
        );

        res.json({
            message: "Artist deleted successfully",
            deletedFiles,
            lidarrDeleted,
            lidarrError,
        });
    } catch (error: any) {
        console.error("Delete artist error:", error?.message || error);
        console.error("Delete artist stack:", error?.stack);
        res.status(500).json({ 
            error: "Failed to delete artist",
            details: error?.message || "Unknown error"
        });
    }
});

export default router;
