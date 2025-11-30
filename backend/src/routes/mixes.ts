import { Router } from "express";
import { requireAuthOrToken } from "../middleware/auth";
import { programmaticPlaylistService } from "../services/programmaticPlaylists";
import { prisma } from "../utils/db";
import { redisClient } from "../utils/redis";

const router = Router();

router.use(requireAuthOrToken);

const getRequestUserId = (req: any): string | null => {
    return req.user?.id || req.session?.userId || null;
};

/**
 * @openapi
 * /mixes:
 *   get:
 *     summary: Get all programmatic mixes
 *     description: Returns all auto-generated mixes (era-based, genre-based, top tracks, rediscover, artist similar, random discovery)
 *     tags: [Mixes]
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of programmatic mixes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "era-2000"
 *                   type:
 *                     type: string
 *                     enum: [era, genre, top-tracks, rediscover, artist-similar, random-discovery]
 *                   name:
 *                     type: string
 *                     example: "Your 2000s Mix"
 *                   description:
 *                     type: string
 *                     example: "Music from the 2000s in your library"
 *                   trackIds:
 *                     type: array
 *                     items:
 *                       type: string
 *                   coverUrls:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Album covers for mosaic display (up to 4)
 *                   trackCount:
 *                     type: integer
 *                     example: 42
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", async (req, res) => {
    try {
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        // Check cache first (mixes are expensive to compute)
        const cacheKey = `mixes:${userId}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return res.json(JSON.parse(cached));
        }

        // Generate all mixes
        const mixes = await programmaticPlaylistService.generateAllMixes(
            userId
        );

        // Cache for 1 hour
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(mixes));

        res.json(mixes);
    } catch (error) {
        console.error("Get mixes error:", error);
        res.status(500).json({ error: "Failed to get mixes" });
    }
});

/**
 * @openapi
 * /mixes/{id}:
 *   get:
 *     summary: Get a specific mix with full track details
 *     tags: [Mixes]
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mix ID (e.g., "era-2000", "genre-rock", "top-tracks")
 *     responses:
 *       200:
 *         description: Mix with full track details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 type:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 trackIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                 coverUrls:
 *                   type: array
 *                   items:
 *                     type: string
 *                 trackCount:
 *                   type: integer
 *                 tracks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Track'
 *       404:
 *         description: Mix not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/:id", async (req, res) => {
    try {
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        const mixId = req.params.id;

        // Get all mixes (from cache if available)
        const cacheKey = `mixes:${userId}`;
        let mixes;

        const cached = await redisClient.get(cacheKey);
        if (cached) {
            mixes = JSON.parse(cached);
        } else {
            mixes = await programmaticPlaylistService.generateAllMixes(userId);
            await redisClient.setEx(cacheKey, 3600, JSON.stringify(mixes));
        }

        // Find the specific mix
        const mix = mixes.find((m: any) => m.id === mixId);

        if (!mix) {
            return res.status(404).json({ error: "Mix not found" });
        }

        // Load full track details
        const tracks = await prisma.track.findMany({
            where: {
                id: {
                    in: mix.trackIds,
                },
            },
            include: {
                album: {
                    include: {
                        artist: {
                            select: {
                                id: true,
                                name: true,
                                mbid: true,
                            },
                        },
                    },
                },
            },
        });

        // Preserve mix order
        const orderedTracks = mix.trackIds
            .map((id: string) => tracks.find((t) => t.id === id))
            .filter((t: any) => t !== undefined);

        res.json({
            ...mix,
            tracks: orderedTracks,
        });
    } catch (error) {
        console.error("Get mix error:", error);
        res.status(500).json({ error: "Failed to get mix" });
    }
});

/**
 * @openapi
 * /mixes/refresh:
 *   post:
 *     summary: Force refresh all mixes
 *     description: Clears cache and regenerates all programmatic mixes
 *     tags: [Mixes]
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Mixes refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Mixes refreshed"
 *                 mixes:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/refresh", async (req, res) => {
    try {
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        // Clear cache
        const cacheKey = `mixes:${userId}`;
        await redisClient.del(cacheKey);

        // Regenerate mixes with random selection (not date-based)
        const mixes = await programmaticPlaylistService.generateAllMixes(
            userId,
            true
        );

        // Cache for 1 hour
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(mixes));

        res.json({ message: "Mixes refreshed", mixes });
    } catch (error) {
        console.error("Refresh mixes error:", error);
        res.status(500).json({ error: "Failed to refresh mixes" });
    }
});

/**
 * @openapi
 * /mixes/{id}/save:
 *   post:
 *     summary: Save a mix as a playlist
 *     description: Creates a new playlist with all tracks from the specified mix
 *     tags: [Mixes]
 *     security:
 *       - sessionAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mix ID to save as playlist
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Optional custom name for the playlist (defaults to mix name)
 *     responses:
 *       200:
 *         description: Playlist created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 trackCount:
 *                   type: integer
 *       404:
 *         description: Mix not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/:id/save", async (req, res) => {
    try {
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        const mixId = req.params.id;
        const customName = req.body.name;

        // Get the mix with track details
        const cacheKey = `mixes:${userId}`;
        let mixes;

        const cached = await redisClient.get(cacheKey);
        if (cached) {
            mixes = JSON.parse(cached);
        } else {
            mixes = await programmaticPlaylistService.generateAllMixes(userId);
            await redisClient.setEx(cacheKey, 3600, JSON.stringify(mixes));
        }

        const mix = mixes.find((m: any) => m.id === mixId);

        if (!mix) {
            return res.status(404).json({ error: "Mix not found" });
        }

        const existingPlaylist = await prisma.playlist.findFirst({
            where: {
                userId,
                mixId: mix.id,
            },
            select: {
                id: true,
                name: true,
            },
        });

        if (existingPlaylist) {
            return res.status(409).json({
                error: "Mix already saved as playlist",
                playlistId: existingPlaylist.id,
                name: existingPlaylist.name,
            });
        }

        // Create playlist
        const playlist = await prisma.playlist.create({
            data: {
                userId,
                mixId: mix.id,
                name: customName || mix.name,
                isPublic: false,
            },
        });

        // Add all tracks to the playlist
        const playlistItems = mix.trackIds.map(
            (trackId: string, index: number) => ({
                playlistId: playlist.id,
                trackId,
                sort: index,
            })
        );

        await prisma.playlistItem.createMany({
            data: playlistItems,
        });

        console.log(
            `[MIXES] Saved mix ${mixId} as playlist ${playlist.id} (${mix.trackIds.length} tracks)`
        );

        res.json({
            id: playlist.id,
            name: playlist.name,
            trackCount: mix.trackIds.length,
        });
    } catch (error) {
        console.error("Save mix as playlist error:", error);
        res.status(500).json({ error: "Failed to save mix as playlist" });
    }
});

export default router;
