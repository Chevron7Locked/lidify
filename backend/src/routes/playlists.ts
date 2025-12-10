import { Router } from "express";
import { requireAuthOrToken } from "../middleware/auth";
import { prisma } from "../utils/db";
import { z } from "zod";

const router = Router();

router.use(requireAuthOrToken);

const createPlaylistSchema = z.object({
    name: z.string().min(1).max(200),
    isPublic: z.boolean().optional().default(false),
});

const addTrackSchema = z.object({
    trackId: z.string(),
});

// GET /playlists
router.get("/", async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user's hidden playlists
        const hiddenPlaylists = await prisma.hiddenPlaylist.findMany({
            where: { userId },
            select: { playlistId: true },
        });
        const hiddenPlaylistIds = new Set(hiddenPlaylists.map((h) => h.playlistId));

        const playlists = await prisma.playlist.findMany({
            where: {
                OR: [{ userId }, { isPublic: true }],
            },
            orderBy: { createdAt: "desc" },
            include: {
                user: {
                    select: {
                        username: true,
                    },
                },
                items: {
                    include: {
                        track: {
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
                        },
                    },
                    orderBy: { sort: "asc" },
                },
            },
        });

        const playlistsWithCounts = playlists.map((playlist) => ({
            ...playlist,
            trackCount: playlist.items.length,
            isOwner: playlist.userId === userId,
            isHidden: hiddenPlaylistIds.has(playlist.id),
        }));

        // Debug: log shared playlists with user info
        const sharedPlaylists = playlistsWithCounts.filter(p => !p.isOwner);
        if (sharedPlaylists.length > 0) {
            console.log(`[Playlists] Found ${sharedPlaylists.length} shared playlists for user ${userId}:`);
            sharedPlaylists.forEach(p => {
                console.log(`  - "${p.name}" by ${p.user?.username || "UNKNOWN"} (owner: ${p.userId})`);
            });
        }

        res.json(playlistsWithCounts);
    } catch (error) {
        console.error("Get playlists error:", error);
        res.status(500).json({ error: "Failed to get playlists" });
    }
});

// POST /playlists
router.post("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const data = createPlaylistSchema.parse(req.body);

        const playlist = await prisma.playlist.create({
            data: {
                userId,
                name: data.name,
                isPublic: data.isPublic,
            },
        });

        res.json(playlist);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res
                .status(400)
                .json({ error: "Invalid request", details: error.errors });
        }
        console.error("Create playlist error:", error);
        res.status(500).json({ error: "Failed to create playlist" });
    }
});

// GET /playlists/:id
router.get("/:id", async (req, res) => {
    try {
        const userId = req.user.id;

        const playlist = await prisma.playlist.findUnique({
            where: { id: req.params.id },
            include: {
                user: {
                    select: {
                        username: true,
                    },
                },
                items: {
                    include: {
                        track: {
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
                        },
                    },
                    orderBy: { sort: "asc" },
                },
            },
        });

        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        // Check access permissions
        if (!playlist.isPublic && playlist.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        res.json({
            ...playlist,
            isOwner: playlist.userId === userId,
            trackCount: playlist.items.length,
            items: playlist.items.map((item) => ({
                ...item,
                track: {
                    ...item.track,
                    album: {
                        ...item.track.album,
                        coverArt: item.track.album.coverUrl,
                    },
                },
            })),
        });
    } catch (error) {
        console.error("Get playlist error:", error);
        res.status(500).json({ error: "Failed to get playlist" });
    }
});

// PUT /playlists/:id
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const data = createPlaylistSchema.parse(req.body);

        // Check ownership
        const existing = await prisma.playlist.findUnique({
            where: { id: req.params.id },
        });

        if (!existing) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        if (existing.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        const playlist = await prisma.playlist.update({
            where: { id: req.params.id },
            data: {
                name: data.name,
                isPublic: data.isPublic,
            },
        });

        res.json(playlist);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res
                .status(400)
                .json({ error: "Invalid request", details: error.errors });
        }
        console.error("Update playlist error:", error);
        res.status(500).json({ error: "Failed to update playlist" });
    }
});

// POST /playlists/:id/hide - Hide any playlist from your view
router.post("/:id/hide", async (req, res) => {
    try {
        const userId = req.user.id;
        const playlistId = req.params.id;

        // Check playlist exists
        const playlist = await prisma.playlist.findUnique({
            where: { id: playlistId },
        });

        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        // User must own the playlist OR it must be public (shared)
        if (playlist.userId !== userId && !playlist.isPublic) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Create hidden record (upsert to handle re-hiding)
        await prisma.hiddenPlaylist.upsert({
            where: {
                userId_playlistId: { userId, playlistId },
            },
            create: { userId, playlistId },
            update: {},
        });

        res.json({ message: "Playlist hidden", isHidden: true });
    } catch (error) {
        console.error("Hide playlist error:", error);
        res.status(500).json({ error: "Failed to hide playlist" });
    }
});

// DELETE /playlists/:id/hide - Unhide a shared playlist
router.delete("/:id/hide", async (req, res) => {
    try {
        const userId = req.user.id;
        const playlistId = req.params.id;

        // Delete hidden record if exists
        await prisma.hiddenPlaylist.deleteMany({
            where: { userId, playlistId },
        });

        res.json({ message: "Playlist unhidden", isHidden: false });
    } catch (error) {
        console.error("Unhide playlist error:", error);
        res.status(500).json({ error: "Failed to unhide playlist" });
    }
});

// DELETE /playlists/:id
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;

        // Check ownership
        const existing = await prisma.playlist.findUnique({
            where: { id: req.params.id },
        });

        if (!existing) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        if (existing.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        await prisma.playlist.delete({
            where: { id: req.params.id },
        });

        res.json({ message: "Playlist deleted" });
    } catch (error) {
        console.error("Delete playlist error:", error);
        res.status(500).json({ error: "Failed to delete playlist" });
    }
});

// POST /playlists/:id/items
router.post("/:id/items", async (req, res) => {
    try {
        const userId = req.user.id;
        const parsedBody = addTrackSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res
                .status(400)
                .json({
                    error: "Invalid request",
                    details: parsedBody.error.errors,
                });
        }
        const { trackId } = parsedBody.data;

        // Check ownership
        const playlist = await prisma.playlist.findUnique({
            where: { id: req.params.id },
            include: {
                items: {
                    orderBy: { sort: "desc" },
                    take: 1,
                },
            },
        });

        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        if (playlist.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Check if track exists
        const track = await prisma.track.findUnique({
            where: { id: trackId },
        });

        if (!track) {
            return res.status(404).json({ error: "Track not found" });
        }

        // Check if track already in playlist
        const existing = await prisma.playlistItem.findUnique({
            where: {
                playlistId_trackId: {
                    playlistId: req.params.id,
                    trackId,
                },
            },
        });

        if (existing) {
            return res.status(200).json({
                message: "Track already in playlist",
                duplicated: true,
                item: existing,
            });
        }

        // Get next sort position
        const maxSort = playlist.items[0]?.sort || 0;

        const item = await prisma.playlistItem.create({
            data: {
                playlistId: req.params.id,
                trackId,
                sort: maxSort + 1,
            },
            include: {
                track: {
                    include: {
                        album: {
                            include: {
                                artist: true,
                            },
                        },
                    },
                },
            },
        });

        res.json(item);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res
                .status(400)
                .json({ error: "Invalid request", details: error.errors });
        }
        console.error("Add track to playlist error:", error);
        res.status(500).json({ error: "Failed to add track to playlist" });
    }
});

// DELETE /playlists/:id/items/:trackId
router.delete("/:id/items/:trackId", async (req, res) => {
    try {
        const userId = req.user.id;

        // Check ownership
        const playlist = await prisma.playlist.findUnique({
            where: { id: req.params.id },
        });

        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        if (playlist.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        await prisma.playlistItem.delete({
            where: {
                playlistId_trackId: {
                    playlistId: req.params.id,
                    trackId: req.params.trackId,
                },
            },
        });

        res.json({ message: "Track removed from playlist" });
    } catch (error) {
        console.error("Remove track from playlist error:", error);
        res.status(500).json({ error: "Failed to remove track from playlist" });
    }
});

// PUT /playlists/:id/items/reorder
router.put("/:id/items/reorder", async (req, res) => {
    try {
        const userId = req.user.id;
        const { trackIds } = req.body; // Array of track IDs in new order

        if (!Array.isArray(trackIds)) {
            return res.status(400).json({ error: "trackIds must be an array" });
        }

        // Check ownership
        const playlist = await prisma.playlist.findUnique({
            where: { id: req.params.id },
        });

        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        if (playlist.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Update sort order for each track
        const updates = trackIds.map((trackId, index) =>
            prisma.playlistItem.update({
                where: {
                    playlistId_trackId: {
                        playlistId: req.params.id,
                        trackId,
                    },
                },
                data: { sort: index },
            })
        );

        await prisma.$transaction(updates);

        res.json({ message: "Playlist reordered" });
    } catch (error) {
        console.error("Reorder playlist error:", error);
        res.status(500).json({ error: "Failed to reorder playlist" });
    }
});

export default router;
