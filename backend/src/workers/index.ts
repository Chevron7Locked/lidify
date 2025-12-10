import {
    scanQueue,
    discoverQueue,
    imageQueue,
    validationQueue,
} from "./queues";
import { processScan } from "./processors/scanProcessor";
import { processDiscoverWeekly } from "./processors/discoverProcessor";
import { processImageOptimization } from "./processors/imageProcessor";
import { processValidation } from "./processors/validationProcessor";
import { startEnrichmentWorker, stopEnrichmentWorker } from "./enrichment";
import { downloadQueueManager } from "../services/downloadQueue";
import { prisma } from "../utils/db";
import { startDiscoverWeeklyCron, stopDiscoverWeeklyCron } from "./discoverCron";
import { runDataIntegrityCheck } from "./dataIntegrity";
import { simpleDownloadManager } from "../services/simpleDownloadManager";

// Track intervals and timeouts for cleanup
const intervals: NodeJS.Timeout[] = [];
const timeouts: NodeJS.Timeout[] = [];

// Register processors with named job types
scanQueue.process("scan", processScan);
discoverQueue.process(processDiscoverWeekly);
imageQueue.process(processImageOptimization);
validationQueue.process(processValidation);

// Register download queue callback for unavailable albums
downloadQueueManager.onUnavailableAlbum(async (info) => {
    console.log(
        ` Recording unavailable album: ${info.artistName} - ${info.albumTitle}`
    );

    if (!info.userId) {
        console.log(` No userId provided, skipping database record`);
        return;
    }

    try {
        // Get week start date from discovery album if it exists
        const discoveryAlbum = await prisma.discoveryAlbum.findFirst({
            where: { rgMbid: info.albumMbid },
            orderBy: { downloadedAt: "desc" },
        });

        await prisma.unavailableAlbum.create({
            data: {
                userId: info.userId,
                artistName: info.artistName,
                albumTitle: info.albumTitle,
                albumMbid: info.albumMbid,
                artistMbid: info.artistMbid,
                similarity: info.similarity || 0,
                tier: info.tier || "unknown",
                weekStartDate: discoveryAlbum?.weekStartDate || new Date(),
                attemptNumber: 0,
            },
        });

        console.log(`   Recorded in database`);
    } catch (error: any) {
        // Handle duplicate entries (album already marked as unavailable)
        if (error.code === "P2002") {
            console.log(`     Album already marked as unavailable`);
        } else {
            console.error(
                ` Failed to record unavailable album:`,
                error.message
            );
        }
    }
});

// Start automatic enrichment worker (processes pending artists every 5 seconds)
// Only enriches OWNED artists (those with ownedAlbums) - not on-demand browsing
startEnrichmentWorker().catch((err) => {
    console.error("Failed to start enrichment worker:", err);
});

// Event handlers for scan queue
scanQueue.on("completed", (job, result) => {
    console.log(
        `Scan job ${job.id} completed: +${result.tracksAdded} ~${result.tracksUpdated} -${result.tracksRemoved}`
    );
});

scanQueue.on("failed", (job, err) => {
    console.error(`✗ Scan job ${job.id} failed:`, err.message);
});

scanQueue.on("active", (job) => {
    console.log(` Scan job ${job.id} started`);
});

// Event handlers for discover queue
discoverQueue.on("completed", (job, result) => {
    if (result.success) {
        console.log(
            `Discover job ${job.id} completed: ${result.playlistName} (${result.songCount} songs)`
        );
    } else {
        console.log(`✗ Discover job ${job.id} failed: ${result.error}`);
    }
});

discoverQueue.on("failed", (job, err) => {
    console.error(`✗ Discover job ${job.id} failed:`, err.message);
});

discoverQueue.on("active", (job) => {
    console.log(` Discover job ${job.id} started for user ${job.data.userId}`);
});

// Event handlers for image queue
imageQueue.on("completed", (job, result) => {
    console.log(
        `Image job ${job.id} completed: ${
            result.success ? "success" : result.error
        }`
    );
});

imageQueue.on("failed", (job, err) => {
    console.error(`✗ Image job ${job.id} failed:`, err.message);
});

// Event handlers for validation queue
validationQueue.on("completed", (job, result) => {
    console.log(
        `Validation job ${job.id} completed: ${result.tracksChecked} checked, ${result.tracksRemoved} removed`
    );
});

validationQueue.on("failed", (job, err) => {
    console.error(`✗ Validation job ${job.id} failed:`, err.message);
});

validationQueue.on("active", (job) => {
    console.log(` Validation job ${job.id} started`);
});

console.log("Worker processors registered and event handlers attached");

// Start Discovery Weekly cron scheduler (Sundays at 8 PM)
startDiscoverWeeklyCron();

// Run data integrity check on startup and then every 24 hours
timeouts.push(
setTimeout(() => {
    runDataIntegrityCheck().catch((err) => {
        console.error("Data integrity check failed:", err);
    });
    }, 10000) // Run 10 seconds after startup
);

intervals.push(
setInterval(() => {
    runDataIntegrityCheck().catch((err) => {
        console.error("Data integrity check failed:", err);
    });
    }, 24 * 60 * 60 * 1000) // Run every 24 hours
);

console.log("Data integrity check scheduled (every 24 hours)");

// Run stale download cleanup every 2 minutes
// This catches downloads that timed out even if the queue cleaner isn't running
intervals.push(
setInterval(async () => {
    try {
        const staleCount = await simpleDownloadManager.markStaleJobsAsFailed();
        if (staleCount > 0) {
            console.log(
                `⏰ Periodic cleanup: marked ${staleCount} stale download(s) as failed`
            );
        }
    } catch (err) {
        console.error("Stale download cleanup failed:", err);
    }
    }, 2 * 60 * 1000) // Every 2 minutes
);

console.log("Stale download cleanup scheduled (every 2 minutes)");

// Run Lidarr queue cleanup every 5 minutes
// This catches stuck/failed imports even if webhooks fail
intervals.push(
setInterval(async () => {
    try {
        const result = await simpleDownloadManager.clearLidarrQueue();
        if (result.removed > 0) {
            console.log(
                `Periodic Lidarr cleanup: removed ${result.removed} stuck download(s)`
            );
        }
    } catch (err) {
        console.error("Lidarr queue cleanup failed:", err);
    }
    }, 5 * 60 * 1000) // Every 5 minutes
);

console.log("Lidarr queue cleanup scheduled (every 5 minutes)");

// Run initial Lidarr cleanup 30 seconds after startup (to catch any stuck items)
timeouts.push(
setTimeout(async () => {
    try {
        console.log("Running initial Lidarr queue cleanup...");
        const result = await simpleDownloadManager.clearLidarrQueue();
        if (result.removed > 0) {
            console.log(
                `Initial cleanup: removed ${result.removed} stuck download(s)`
            );
        } else {
            console.log("Initial cleanup: queue is clean");
        }
    } catch (err) {
        console.error("Initial Lidarr cleanup failed:", err);
    }
    }, 30 * 1000) // 30 seconds after startup
);

/**
 * Gracefully shutdown all workers and cleanup resources
 */
export async function shutdownWorkers(): Promise<void> {
    console.log("Shutting down workers...");

    // Stop enrichment worker
    stopEnrichmentWorker();

    // Stop discover weekly cron
    stopDiscoverWeeklyCron();

    // Shutdown download queue manager
    downloadQueueManager.shutdown();

    // Clear all intervals
    for (const interval of intervals) {
        clearInterval(interval);
    }
    intervals.length = 0;

    // Clear all timeouts
    for (const timeout of timeouts) {
        clearTimeout(timeout);
    }
    timeouts.length = 0;

    // Close all queues gracefully
    await Promise.all([
        scanQueue.close(),
        discoverQueue.close(),
        imageQueue.close(),
        validationQueue.close(),
    ]);

    console.log("Workers shutdown complete");
}

// Export queues for use in other modules
export { scanQueue, discoverQueue, imageQueue, validationQueue };
