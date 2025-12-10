import { prisma } from "../utils/db";
import { getSystemSettings } from "../utils/systemSettings";
import {
    cleanStuckDownloads,
    getRecentCompletedDownloads,
} from "../services/lidarr";
import { scanQueue } from "../workers/queues";
import { simpleDownloadManager } from "../services/simpleDownloadManager";

class QueueCleanerService {
    private isRunning = false;
    private checkInterval = 30000; // 30 seconds when active
    private emptyQueueChecks = 0;
    private maxEmptyChecks = 3; // Stop after 3 consecutive empty checks
    private timeoutId?: NodeJS.Timeout;

    /**
     * Start the polling loop
     * Safe to call multiple times - won't create duplicate loops
     */
    async start() {
        if (this.isRunning) {
            console.log(" Queue cleaner already running");
            return;
        }

        this.isRunning = true;
        this.emptyQueueChecks = 0;
        console.log(" Queue cleaner started (checking every 30s)");

        await this.runCleanup();
    }

    /**
     * Stop the polling loop
     */
    stop() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
        }
        this.isRunning = false;
        console.log(" Queue cleaner stopped (queue empty)");
    }

    /**
     * Main cleanup logic - runs every 30 seconds when active
     */
    private async runCleanup() {
        if (!this.isRunning) return;

        try {
            // Use getSystemSettings() to get decrypted API key
            const settings = await getSystemSettings();

            if (!settings?.lidarrUrl || !settings?.lidarrApiKey) {
                console.log(" Lidarr not configured, stopping queue cleaner");
                this.stop();
                return;
            }

            // PART 0: Check for stale downloads (timed out)
            const staleCount =
                await simpleDownloadManager.markStaleJobsAsFailed();
            if (staleCount > 0) {
                console.log(`⏰ Cleaned up ${staleCount} stale download(s)`);
                this.emptyQueueChecks = 0; // Reset counter
            }

            // PART 0.5: Check for stuck discovery batches (batch-level timeout)
            const { discoverWeeklyService } = await import(
                "../services/discoverWeekly"
            );
            const stuckBatchCount = await discoverWeeklyService.checkStuckBatches();
            if (stuckBatchCount > 0) {
                console.log(`⏰ Force-completed ${stuckBatchCount} stuck discovery batch(es)`);
                this.emptyQueueChecks = 0; // Reset counter
            }

            // PART 1: Check for stuck downloads needing blocklist + retry
            const cleanResult = await cleanStuckDownloads(
                settings.lidarrUrl,
                settings.lidarrApiKey
            );

            if (cleanResult.removed > 0) {
                console.log(
                    `[CLEANUP] Removed ${cleanResult.removed} stuck download(s) - searching for alternatives`
                );
                this.emptyQueueChecks = 0; // Reset counter - queue had activity

                // Update retry count for jobs that might match these titles
                // Note: This is a best-effort match since we only have the title
                for (const title of cleanResult.items) {
                    // Try to extract artist and album from the title
                    // Typical format: "Artist - Album" or "Artist - Album (Year)"
                    const parts = title.split(" - ");
                    if (parts.length >= 2) {
                        const artistName = parts[0].trim();
                        const albumPart = parts.slice(1).join(" - ").trim();
                        // Remove year in parentheses if present
                        const albumTitle = albumPart
                            .replace(/\s*\(\d{4}\)\s*$/, "")
                            .trim();

                        // Find matching processing jobs
                        const matchingJobs = await prisma.downloadJob.findMany({
                            where: {
                                status: "processing",
                                subject: {
                                    contains: albumTitle,
                                    mode: "insensitive",
                                },
                            },
                        });

                        for (const job of matchingJobs) {
                            const metadata = (job.metadata as any) || {};
                            const currentRetryCount = metadata.retryCount || 0;

                            await prisma.downloadJob.update({
                                where: { id: job.id },
                                data: {
                                    metadata: {
                                        ...metadata,
                                        retryCount: currentRetryCount + 1,
                                        lastError:
                                            "Import failed - searching for alternative release",
                                    },
                                },
                            });

                            console.log(
                                `   Updated job ${job.id}: retry ${
                                    currentRetryCount + 1
                                }`
                            );
                        }
                    }
                }
            }

            // PART 2: Check for completed downloads (missing webhooks)
            const completedDownloads = await getRecentCompletedDownloads(
                settings.lidarrUrl,
                settings.lidarrApiKey,
                5 // Only check last 5 minutes since we're running frequently
            );

            let recoveredCount = 0;
            let skippedCount = 0;

            for (const download of completedDownloads) {
                // Skip records without album data (can happen with certain event types)
                if (!download.album?.foreignAlbumId) {
                    skippedCount++;
                    continue;
                }

                const mbid = download.album.foreignAlbumId;

                // Find matching job(s) in database by MBID or downloadId
                const orphanedJobs = await prisma.downloadJob.findMany({
                    where: {
                        status: { in: ["processing", "pending"] },
                        OR: [
                            { targetMbid: mbid },
                            { lidarrRef: download.downloadId },
                        ],
                    },
                });

                if (orphanedJobs.length > 0) {
                    const artistName =
                        download.artist?.name || "Unknown Artist";
                    const albumTitle = download.album?.title || "Unknown Album";
                    console.log(
                        `Recovered orphaned job: ${artistName} - ${albumTitle}`
                    );
                    console.log(`   Download ID: ${download.downloadId}`);
                    this.emptyQueueChecks = 0; // Reset counter - found work to do
                    recoveredCount += orphanedJobs.length;

                    // Mark all matching jobs as complete
                    await prisma.downloadJob.updateMany({
                        where: {
                            id: {
                                in: orphanedJobs.map(
                                    (j: { id: string }) => j.id
                                ),
                            },
                        },
                        data: {
                            status: "completed",
                            completedAt: new Date(),
                        },
                    });

                    // Check batch completion for any Discovery jobs
                    // Use proper checkBatchCompletion() instead of manual logic
                    const discoveryBatchIds = new Set<string>();
                    for (const job of orphanedJobs) {
                        if (job.discoveryBatchId) {
                            discoveryBatchIds.add(job.discoveryBatchId);
                        }
                    }

                    if (discoveryBatchIds.size > 0) {
                        const { discoverWeeklyService } = await import(
                            "../services/discoverWeekly"
                        );
                        for (const batchId of discoveryBatchIds) {
                            console.log(
                                `    Checking Discovery batch completion: ${batchId}`
                            );
                            await discoverWeeklyService.checkBatchCompletion(
                                batchId
                            );
                        }
                    }

                    // Trigger library scan for non-discovery jobs
                    const nonDiscoveryJobs = orphanedJobs.filter(
                        (j: { discoveryBatchId: string | null }) =>
                            !j.discoveryBatchId
                    );
                    if (nonDiscoveryJobs.length > 0) {
                        console.log(
                            `    Triggering library scan for recovered job(s)...`
                        );
                        await scanQueue.add("scan", {
                            type: "full",
                            source: "queue-cleaner-recovery",
                        });
                    }
                }
            }

            if (recoveredCount > 0) {
                console.log(`Recovered ${recoveredCount} orphaned job(s)`);
            }

            // Only log skipped count occasionally to reduce noise
            if (skippedCount > 0 && this.emptyQueueChecks === 0) {
                console.log(
                    `   (Skipped ${skippedCount} incomplete download records)`
                );
            }

            // PART 3: Check if we should stop (no activity)
            const activeJobs = await prisma.downloadJob.count({
                where: {
                    status: { in: ["pending", "processing"] },
                },
            });

            const hadActivity =
                cleanResult.removed > 0 || recoveredCount > 0 || activeJobs > 0;

            if (!hadActivity) {
                this.emptyQueueChecks++;
                console.log(
                    ` Queue empty (${this.emptyQueueChecks}/${this.maxEmptyChecks})`
                );

                if (this.emptyQueueChecks >= this.maxEmptyChecks) {
                    console.log(
                        ` No activity for ${this.maxEmptyChecks} checks - stopping cleaner`
                    );
                    this.stop();
                    return;
                }
            } else {
                this.emptyQueueChecks = 0;
            }

            // Schedule next check
            this.timeoutId = setTimeout(
                () => this.runCleanup(),
                this.checkInterval
            );
        } catch (error) {
            console.error(" Queue cleanup error:", error);
            // Still schedule next check even on error
            this.timeoutId = setTimeout(
                () => this.runCleanup(),
                this.checkInterval
            );
        }
    }

    /**
     * Get current status (for debugging/monitoring)
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            emptyQueueChecks: this.emptyQueueChecks,
            nextCheckIn: this.isRunning
                ? `${this.checkInterval / 1000}s`
                : "stopped",
        };
    }
}

// Export singleton instance
export const queueCleaner = new QueueCleanerService();
