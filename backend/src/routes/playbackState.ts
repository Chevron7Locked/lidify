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

        // Validate required field
        if (!playbackType) {
            return res.status(400).json({ error: "playbackType is required" });
        }

        // Limit queue size to prevent database issues with large JSON
        const safeQueue = Array.isArray(queue) ? queue.slice(0, 100) : null;
        const safeCurrentIndex = Math.min(currentIndex || 0, safeQueue?.length || 0);

        console.log(`[PlaybackState] Saving for user ${userId}:`, {
            playbackType,
            trackId,
            audiobookId,
            podcastId,
            queueLength: safeQueue?.length || 0,
        });

        const playbackState = await prisma.playbackState.upsert({
            where: { userId },
            update: {
                playbackType,
                trackId: trackId || null,
                audiobookId: audiobookId || null,
                podcastId: podcastId || null,
                queue: safeQueue,
                currentIndex: safeCurrentIndex,
                isShuffle: isShuffle || false,
            },
            create: {
                userId,
                playbackType,
                trackId: trackId || null,
                audiobookId: audiobookId || null,
                podcastId: podcastId || null,
                queue: safeQueue,
                currentIndex: safeCurrentIndex,
                isShuffle: isShuffle || false,
            },
        });

        res.json(playbackState);
    } catch (error: any) {
        console.error("Update playback state error:", error?.message || error);
        console.error("Stack:", error?.stack);
        res.status(500).json({ error: "Internal server error" });
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
