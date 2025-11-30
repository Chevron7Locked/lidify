import express from "express";
import { prisma } from "../utils/db";
import { requireAuth } from "../middleware/auth";

const router = express.Router();

// Get current playback state for the authenticated user
router.get("/", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;

        const playbackState = await prisma.playbackState.findUnique({
            where: { userId },
        });

        if (!playbackState) {
            return res.json(null);
        }

        res.json(playbackState);
    } catch (error) {
        console.error("Get playback state error:", error);
        res.status(500).json({ error: "Failed to get playback state" });
    }
});

// Update current playback state for the authenticated user
router.post("/", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const {
            playbackType,
            trackId,
            audiobookId,
            podcastId,
            queue,
            currentIndex,
            isShuffle,
        } = req.body;

        console.log(`[PlaybackState] Saving for user ${userId}:`, {
            playbackType,
            trackId,
            audiobookId,
            podcastId,
            queueLength: queue?.length || 0,
        });

        const playbackState = await prisma.playbackState.upsert({
            where: { userId },
            update: {
                playbackType,
                trackId: trackId || null,
                audiobookId: audiobookId || null,
                podcastId: podcastId || null,
                queue: queue || null,
                currentIndex: currentIndex || 0,
                isShuffle: isShuffle || false,
            },
            create: {
                userId,
                playbackType,
                trackId: trackId || null,
                audiobookId: audiobookId || null,
                podcastId: podcastId || null,
                queue: queue || null,
                currentIndex: currentIndex || 0,
                isShuffle: isShuffle || false,
            },
        });

        res.json(playbackState);
    } catch (error) {
        console.error("Update playback state error:", error);
        res.status(500).json({ error: "Failed to update playback state" });
    }
});

// Clear playback state (when user stops playback completely)
router.delete("/", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;

        await prisma.playbackState.delete({
            where: { userId },
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Delete playback state error:", error);
        res.status(500).json({ error: "Failed to delete playback state" });
    }
});

export default router;
