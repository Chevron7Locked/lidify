import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../utils/db";
import { z } from "zod";

const router = Router();

router.use(requireAuth);

const settingsSchema = z.object({
    playbackQuality: z.enum(["original", "high", "medium", "low"]).optional(),
    wifiOnly: z.boolean().optional(),
    offlineEnabled: z.boolean().optional(),
    maxCacheSizeMb: z.number().int().min(0).optional(),
});

// GET /settings
router.get("/", async (req, res) => {
    try {
        const userId = req.user!.id;

        let settings = await prisma.userSettings.findUnique({
            where: { userId },
        });

        // Create default settings if they don't exist
        if (!settings) {
            settings = await prisma.userSettings.create({
                data: {
                    userId,
                    playbackQuality: "medium",
                    wifiOnly: false,
                    offlineEnabled: false,
                    maxCacheSizeMb: 5120,
                },
            });
        }

        res.json(settings);
    } catch (error) {
        console.error("Get settings error:", error);
        res.status(500).json({ error: "Failed to get settings" });
    }
});

// POST /settings
router.post("/", async (req, res) => {
    try {
        const userId = req.user!.id;
        const data = settingsSchema.parse(req.body);

        const settings = await prisma.userSettings.upsert({
            where: { userId },
            create: {
                userId,
                ...data,
            },
            update: data,
        });

        res.json(settings);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res
                .status(400)
                .json({ error: "Invalid settings", details: error.errors });
        }
        console.error("Update settings error:", error);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

export default router;
