/**
 * Lidarr Webhook Handler (Refactored)
 *
 * Handles Lidarr webhooks for download tracking and Discovery Weekly integration.
 * Uses the stateless simpleDownloadManager for all operations.
 */

import { Router } from "express";
import { prisma } from "../utils/db";
import { scanQueue } from "../workers/queues";
import { discoverWeeklyService } from "../services/discoverWeekly";
import { simpleDownloadManager } from "../services/simpleDownloadManager";
import { queueCleaner } from "../jobs/queueCleaner";
import { getSystemSettings } from "../utils/systemSettings";

const router = Router();

// POST /webhooks/lidarr - Handle Lidarr webhooks
router.post("/lidarr", async (req, res) => {
    try {
        // Check if Lidarr is enabled before processing any webhooks
        const settings = await getSystemSettings();
        if (
            !settings?.lidarrEnabled ||
            !settings?.lidarrUrl ||
            !settings?.lidarrApiKey
        ) {
            console.log(
                `\n📥 Lidarr webhook received but Lidarr is disabled. Ignoring.`
            );
            return res.status(202).json({
                success: true,
                ignored: true,
                reason: "lidarr-disabled",
            });
        }

        const eventType = req.body.eventType;
        console.log(`\n📥 Lidarr webhook: ${eventType}`);

        // Log payload in debug mode only (avoid verbose logs in production)
        if (process.env.DEBUG_WEBHOOKS === "true") {
            console.log(`   Payload:`, JSON.stringify(req.body, null, 2));
        }

        switch (eventType) {
            case "Grab":
                await handleGrab(req.body);
                break;

            case "Download":
            case "AlbumDownload":
            case "TrackRetag":
            case "Rename":
                await handleDownload(req.body);
                break;

            case "ImportFailure":
            case "DownloadFailed":
            case "DownloadFailure":
                await handleImportFailure(req.body);
                break;

            case "Health":
            case "HealthIssue":
            case "HealthRestored":
                // Ignore health events
                break;

            case "Test":
                console.log("   Lidarr test webhook received");
                break;

            default:
                console.log(`   Unhandled event: ${eventType}`);
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error("Webhook error:", error.message);
        res.status(500).json({ error: "Webhook processing failed" });
    }
});

/**
 * Handle Grab event (download started by Lidarr)
 */
async function handleGrab(payload: any) {
    const downloadId = payload.downloadId;
    const albumMbid =
        payload.albums?.[0]?.foreignAlbumId || payload.albums?.[0]?.mbId;
    const albumTitle = payload.albums?.[0]?.title;
    const artistName = payload.artist?.name;
    const lidarrAlbumId = payload.albums?.[0]?.id;

    console.log(`   Album: ${artistName} - ${albumTitle}`);
    console.log(`   Download ID: ${downloadId}`);
    console.log(`   MBID: ${albumMbid}`);

    if (!downloadId) {
        console.log(`   Missing downloadId, skipping`);
        return;
    }

    // Use the download manager's multi-strategy matching
    const result = await simpleDownloadManager.onDownloadGrabbed(
        downloadId,
        albumMbid || "",
        albumTitle || "",
        artistName || "",
        lidarrAlbumId || 0
    );

    if (result.matched) {
        // Start queue cleaner to monitor this download
        queueCleaner.start();
    }
}

/**
 * Handle Download event (download complete + imported)
 */
async function handleDownload(payload: any) {
    const downloadId = payload.downloadId;
    const albumTitle = payload.album?.title || payload.albums?.[0]?.title;
    const artistName = payload.artist?.name;
    const albumMbid =
        payload.album?.foreignAlbumId || payload.albums?.[0]?.foreignAlbumId;

    console.log(`   Album: ${artistName} - ${albumTitle}`);
    console.log(`   Download ID: ${downloadId}`);
    console.log(`   Album MBID: ${albumMbid}`);

    if (!downloadId) {
        console.log(`   Missing downloadId, skipping`);
        return;
    }

    // Handle completion through download manager
    const result = await simpleDownloadManager.onDownloadComplete(
        downloadId,
        albumMbid,
        artistName,
        albumTitle
    );

    if (result.jobId) {
        // Check if this is part of a download batch (artist download)
        if (result.downloadBatchId) {
            // Check if all jobs in the batch are complete
            const batchComplete = await checkDownloadBatchComplete(
                result.downloadBatchId
            );
            if (batchComplete) {
                console.log(
                    `   All albums in batch complete, triggering library scan...`
                );
                await scanQueue.add("scan", {
                    type: "full",
                    source: "lidarr-import-batch",
                });
            } else {
                console.log(`   Batch not complete, skipping scan`);
            }
        } else if (!result.batchId) {
            // Single album download (not part of discovery batch)
            console.log(`   Triggering library scan...`);
            await scanQueue.add("scan", {
                type: "full",
                source: "lidarr-import",
            });
        }
        // If part of discovery batch, the download manager already called checkBatchCompletion
    } else {
        // No job found - this might be an external download not initiated by us
        // Still trigger a scan to pick up the new music
        console.log(`   No matching job, triggering scan anyway...`);
        await scanQueue.add("scan", {
            type: "full",
            source: "lidarr-import-external",
        });
    }
}

/**
 * Check if all jobs in a download batch are complete
 */
async function checkDownloadBatchComplete(batchId: string): Promise<boolean> {
    const pendingJobs = await prisma.downloadJob.count({
        where: {
            metadata: {
                path: ["batchId"],
                equals: batchId,
            },
            status: { in: ["pending", "processing"] },
        },
    });

    console.log(
        `   Batch ${batchId}: ${pendingJobs} pending/processing jobs remaining`
    );
    return pendingJobs === 0;
}

/**
 * Handle import failure with automatic retry
 */
async function handleImportFailure(payload: any) {
    const downloadId = payload.downloadId;
    const albumMbid =
        payload.album?.foreignAlbumId || payload.albums?.[0]?.foreignAlbumId;
    const albumTitle = payload.album?.title || payload.release?.title;
    const reason = payload.message || "Import failed";

    console.log(`   Album: ${albumTitle}`);
    console.log(`   Download ID: ${downloadId}`);
    console.log(`   Reason: ${reason}`);

    if (!downloadId) {
        console.log(`   Missing downloadId, skipping`);
        return;
    }

    // Handle failure through download manager (handles retry logic)
    await simpleDownloadManager.onImportFailed(downloadId, reason, albumMbid);
}

export default router;
