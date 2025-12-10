import { Router } from "express";
import { requireAuthOrToken } from "../middleware/auth";
import { prisma } from "../utils/db";
import { config } from "../config";
import { lidarrService } from "../services/lidarr";
import { musicBrainzService } from "../services/musicbrainz";
import { simpleDownloadManager } from "../services/simpleDownloadManager";
import crypto from "crypto";

const router = Router();

router.use(requireAuthOrToken);

// POST /downloads - Create download job
router.post("/", async (req, res) => {
    try {
        const {
            type,
            mbid,
            subject,
            artistName,
            albumTitle,
            downloadType = "library",
        } = req.body;
        const userId = req.user!.id;

        if (!type || !mbid || !subject) {
            return res.status(400).json({
                error: "Missing required fields: type, mbid, subject",
            });
        }

        if (type !== "artist" && type !== "album") {
            return res
                .status(400)
                .json({ error: "Type must be 'artist' or 'album'" });
        }

        if (downloadType !== "library" && downloadType !== "discovery") {
            return res.status(400).json({
                error: "downloadType must be 'library' or 'discovery'",
            });
        }

        // Check if Lidarr is enabled (database or .env)
        const lidarrEnabled = await lidarrService.isEnabled();
        if (!lidarrEnabled) {
            return res.status(400).json({
                error: "Lidarr not configured. Please add albums manually to your library.",
            });
        }

        // Determine root folder path based on download type
        const rootFolderPath =
            downloadType === "discovery" ? "/music/discovery" : "/music";

        if (type === "artist") {
            // For artist downloads, fetch albums and create individual jobs
            const jobs = await processArtistDownload(
                userId,
                mbid,
                subject,
                rootFolderPath,
                downloadType
            );

            return res.json({
                id: jobs[0]?.id || null,
                status: "processing",
                downloadType,
                rootFolderPath,
                message: `Creating download jobs for ${jobs.length} album(s)...`,
                albumCount: jobs.length,
                jobs: jobs.map((j) => ({ id: j.id, subject: j.subject })),
            });
        }

        // Single album download
        const job = await prisma.downloadJob.create({
            data: {
                userId,
                subject,
                type,
                targetMbid: mbid,
                status: "pending",
                metadata: {
                    downloadType,
                    rootFolderPath,
                    artistName,
                    albumTitle,
                },
            },
        });

        console.log(
            `[DOWNLOAD] Triggering Lidarr: ${type} "${subject}" -> ${rootFolderPath}`
        );

        // Process in background
        processDownload(
            job.id,
            type,
            mbid,
            subject,
            rootFolderPath,
            artistName,
            albumTitle
        ).catch((error) => {
            console.error(
                `Download processing failed for job ${job.id}:`,
                error
            );
        });

        res.json({
            id: job.id,
            status: job.status,
            downloadType,
            rootFolderPath,
            message: "Download job created. Processing in background.",
        });
    } catch (error) {
        console.error("Create download job error:", error);
        res.status(500).json({ error: "Failed to create download job" });
    }
});

/**
 * Process artist download by creating individual album jobs
 */
async function processArtistDownload(
    userId: string,
    artistMbid: string,
    artistName: string,
    rootFolderPath: string,
    downloadType: string
): Promise<{ id: string; subject: string }[]> {
    console.log(`\n Processing artist download: ${artistName}`);
    console.log(`   Artist MBID: ${artistMbid}`);

    // Generate a batch ID to group all album downloads
    const batchId = crypto.randomUUID();
    console.log(`   Batch ID: ${batchId}`);

    try {
        // First, add the artist to Lidarr (this monitors all albums)
        const lidarrArtist = await lidarrService.addArtist(
            artistMbid,
            artistName,
            rootFolderPath
        );

        if (!lidarrArtist) {
            console.log(`   Failed to add artist to Lidarr`);
            throw new Error("Failed to add artist to Lidarr");
        }

        console.log(`   Artist added to Lidarr (ID: ${lidarrArtist.id})`);

        // Fetch albums from MusicBrainz
        const releaseGroups = await musicBrainzService.getReleaseGroups(
            artistMbid,
            ["album", "ep"],
            100
        );

        console.log(
            `   Found ${releaseGroups.length} albums/EPs from MusicBrainz`
        );

        if (releaseGroups.length === 0) {
            console.log(`   No albums found for artist`);
            return [];
        }

        // Create individual album jobs
        const jobs: { id: string; subject: string }[] = [];

        for (const rg of releaseGroups) {
            const albumMbid = rg.id;
            const albumTitle = rg.title;
            const albumSubject = `${artistName} - ${albumTitle}`;

            // Check if we already have this album downloaded
            const existingAlbum = await prisma.album.findFirst({
                where: { rgMbid: albumMbid },
            });

            if (existingAlbum) {
                console.log(`   Skipping "${albumTitle}" - already in library`);
                continue;
            }

            // Check if there's already a pending/processing job for this album
            const existingJob = await prisma.downloadJob.findFirst({
                where: {
                    targetMbid: albumMbid,
                    status: { in: ["pending", "processing"] },
                },
            });

            if (existingJob) {
                console.log(
                    `   Skipping "${albumTitle}" - already in download queue`
                );
                continue;
            }

            // Create download job for this album
            const now = new Date();
            const job = await prisma.downloadJob.create({
                data: {
                    userId,
                    subject: albumSubject,
                    type: "album",
                    targetMbid: albumMbid,
                    status: "pending",
                    metadata: {
                        downloadType,
                        rootFolderPath,
                        artistName,
                        artistMbid,
                        albumTitle,
                        batchId, // Link all albums in this artist download
                        batchArtist: artistName,
                        createdAt: now.toISOString(), // Track when job was created for timeout
                    },
                },
            });

            jobs.push({ id: job.id, subject: albumSubject });
            console.log(`   [JOB] Created job for: ${albumSubject}`);

            // Start the download in background
            processDownload(
                job.id,
                "album",
                albumMbid,
                albumSubject,
                rootFolderPath,
                artistName,
                albumTitle
            ).catch((error) => {
                console.error(`Download failed for ${albumSubject}:`, error);
            });
        }

        console.log(`   Created ${jobs.length} album download jobs`);
        return jobs;
    } catch (error: any) {
        console.error(`   Failed to process artist download:`, error.message);
        throw error;
    }
}

// Background download processor
async function processDownload(
    jobId: string,
    type: string,
    mbid: string,
    subject: string,
    rootFolderPath: string,
    artistName?: string,
    albumTitle?: string
) {
    const job = await prisma.downloadJob.findUnique({ where: { id: jobId } });
    if (!job) {
        console.error(`Job ${jobId} not found`);
        return;
    }

    if (type === "album") {
        // For albums, use the simple download manager
        let parsedArtist = artistName;
        let parsedAlbum = albumTitle;

        if (!parsedArtist || !parsedAlbum) {
            const parts = subject.split(" - ");
            if (parts.length >= 2) {
                parsedArtist = parts[0].trim();
                parsedAlbum = parts.slice(1).join(" - ").trim();
            } else {
                parsedArtist = subject;
                parsedAlbum = subject;
            }
        }

        console.log(`Parsed: Artist="${parsedArtist}", Album="${parsedAlbum}"`);

        // Use simple download manager for album downloads
        const result = await simpleDownloadManager.startDownload(
            jobId,
            parsedArtist,
            parsedAlbum,
            mbid,
            job.userId
        );

        if (!result.success) {
            console.error(`Failed to start download: ${result.error}`);
        }
    }
}

// DELETE /downloads/clear-all - Clear all download jobs for the current user
// IMPORTANT: Must be BEFORE /:id route to avoid catching "clear-all" as an ID
router.delete("/clear-all", async (req, res) => {
    try {
        const userId = req.user!.id;
        const { status } = req.query;

        const where: any = { userId };
        if (status) {
            where.status = status as string;
        }

        const result = await prisma.downloadJob.deleteMany({ where });

        console.log(
            ` Cleared ${result.count} download jobs for user ${userId}`
        );
        res.json({ success: true, deleted: result.count });
    } catch (error) {
        console.error("Clear downloads error:", error);
        res.status(500).json({ error: "Failed to clear downloads" });
    }
});

// POST /downloads/clear-lidarr-queue - Clear stuck/failed items from Lidarr's queue
router.post("/clear-lidarr-queue", async (req, res) => {
    try {
        const result = await simpleDownloadManager.clearLidarrQueue();
        res.json({
            success: true,
            removed: result.removed,
            errors: result.errors,
        });
    } catch (error: any) {
        console.error("Clear Lidarr queue error:", error);
        res.status(500).json({ error: "Failed to clear Lidarr queue" });
    }
});

// GET /downloads/failed - List failed/unavailable albums for the current user
// IMPORTANT: Must be BEFORE /:id route to avoid catching "failed" as an ID
router.get("/failed", async (req, res) => {
    try {
        const userId = req.user!.id;

        const failedAlbums = await prisma.unavailableAlbum.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });

        res.json(failedAlbums);
    } catch (error) {
        console.error("List failed albums error:", error);
        res.status(500).json({ error: "Failed to list failed albums" });
    }
});

// DELETE /downloads/failed/:id - Dismiss a failed album notification
router.delete("/failed/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        // Verify ownership before deleting
        const failedAlbum = await prisma.unavailableAlbum.findFirst({
            where: { id, userId },
        });

        if (!failedAlbum) {
            return res.status(404).json({ error: "Failed album not found" });
        }

        await prisma.unavailableAlbum.delete({
            where: { id },
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Delete failed album error:", error);
        res.status(500).json({ error: "Failed to delete failed album" });
    }
});

// GET /downloads/:id - Get download job status
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        const job = await prisma.downloadJob.findFirst({
            where: {
                id,
                userId,
            },
        });

        if (!job) {
            return res.status(404).json({ error: "Download job not found" });
        }

        res.json(job);
    } catch (error) {
        console.error("Get download job error:", error);
        res.status(500).json({ error: "Failed to get download job" });
    }
});

// PATCH /downloads/:id - Update download job (e.g., mark as complete)
router.patch("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;
        const { status } = req.body;

        const job = await prisma.downloadJob.findFirst({
            where: {
                id,
                userId,
            },
        });

        if (!job) {
            return res.status(404).json({ error: "Download job not found" });
        }

        const updated = await prisma.downloadJob.update({
            where: { id },
            data: {
                status: status || "completed",
                completedAt: status === "completed" ? new Date() : undefined,
            },
        });

        res.json(updated);
    } catch (error) {
        console.error("Update download job error:", error);
        res.status(500).json({ error: "Failed to update download job" });
    }
});

// DELETE /downloads/:id - Delete download job
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        // Use deleteMany to handle race conditions gracefully
        // This won't throw an error if the record was already deleted
        const result = await prisma.downloadJob.deleteMany({
            where: {
                id,
                userId,
            },
        });

        // Return success even if nothing was deleted (idempotent delete)
        res.json({ success: true, deleted: result.count > 0 });
    } catch (error: any) {
        console.error("Delete download job error:", error);
        console.error("Error details:", error.message, error.stack);
        res.status(500).json({
            error: "Failed to delete download job",
            details: error.message,
        });
    }
});

// GET /downloads - List user's download jobs
router.get("/", async (req, res) => {
    try {
        const userId = req.user!.id;
        const { status, limit = "50", includeDiscovery = "false" } = req.query;

        const where: any = { userId };
        if (status) {
            where.status = status as string;
        }

        const jobs = await prisma.downloadJob.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: parseInt(limit as string, 10),
        });

        // Filter out discovery downloads unless explicitly requested
        // Discovery downloads are automated and shouldn't show in the UI popover
        const filteredJobs =
            includeDiscovery === "true"
                ? jobs
                : jobs.filter((job) => {
                      const metadata = job.metadata as any;
                      return metadata?.downloadType !== "discovery";
                  });

        res.json(filteredJobs);
    } catch (error) {
        console.error("List download jobs error:", error);
        res.status(500).json({ error: "Failed to list download jobs" });
    }
});

// POST /downloads/keep-track - Keep a discovery track (move to permanent library)
router.post("/keep-track", async (req, res) => {
    try {
        const { discoveryTrackId } = req.body;
        const userId = req.user!.id;

        if (!discoveryTrackId) {
            return res.status(400).json({ error: "Missing discoveryTrackId" });
        }

        const discoveryTrack = await prisma.discoveryTrack.findUnique({
            where: { id: discoveryTrackId },
            include: {
                discoveryAlbum: true,
            },
        });

        if (!discoveryTrack) {
            return res.status(404).json({ error: "Discovery track not found" });
        }

        // Mark as kept
        await prisma.discoveryTrack.update({
            where: { id: discoveryTrackId },
            data: { userKept: true },
        });

        // If Lidarr enabled, create job to download full album to permanent library
        const lidarrEnabled = await lidarrService.isEnabled();
        if (lidarrEnabled) {
            const job = await prisma.downloadJob.create({
                data: {
                    userId,
                    subject: `${discoveryTrack.discoveryAlbum.albumTitle} by ${discoveryTrack.discoveryAlbum.artistName}`,
                    type: "album",
                    targetMbid: discoveryTrack.discoveryAlbum.rgMbid,
                    status: "pending",
                },
            });

            return res.json({
                success: true,
                message:
                    "Track marked as kept. Full album will be downloaded to permanent library.",
                downloadJobId: job.id,
            });
        }

        res.json({
            success: true,
            message:
                "Track marked as kept. Please add the full album manually to your /music folder.",
        });
    } catch (error) {
        console.error("Keep track error:", error);
        res.status(500).json({ error: "Failed to keep track" });
    }
});

export default router;
