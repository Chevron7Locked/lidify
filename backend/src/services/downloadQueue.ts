interface DownloadInfo {
    downloadId: string;
    albumTitle: string;
    albumMbid: string;
    artistName: string;
    artistMbid?: string;
    albumId?: number;
    artistId?: number;
    attempts: number;
    startTime: number;
    userId?: string;
    tier?: string;
    similarity?: number;
}

type UnavailableAlbumCallback = (info: {
    albumTitle: string;
    artistName: string;
    albumMbid: string;
    artistMbid?: string;
    userId?: string;
    tier?: string;
    similarity?: number;
}) => Promise<void>;

class DownloadQueueManager {
    private activeDownloads = new Map<string, DownloadInfo>();
    private timeoutTimer: NodeJS.Timeout | null = null;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly TIMEOUT_MINUTES = 10; // Trigger scan after 10 minutes regardless
    private readonly MAX_RETRY_ATTEMPTS = 3; // Max retries before giving up
    private readonly STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes - entries older than this are considered stale
    private unavailableCallbacks: UnavailableAlbumCallback[] = [];

    constructor() {
        // Start periodic cleanup of stale downloads (every 5 minutes)
        this.cleanupInterval = setInterval(() => {
            this.cleanupStaleDownloads();
        }, 5 * 60 * 1000);
    }

    /**
     * Track a new download
     */
    addDownload(
        downloadId: string,
        albumTitle: string,
        albumMbid: string,
        artistName: string,
        albumId?: number,
        artistId?: number,
        options?: {
            artistMbid?: string;
            userId?: string;
            tier?: string;
            similarity?: number;
        }
    ) {
        const info: DownloadInfo = {
            downloadId,
            albumTitle,
            albumMbid,
            artistName,
            artistMbid: options?.artistMbid,
            albumId,
            artistId,
            attempts: 1,
            startTime: Date.now(),
            userId: options?.userId,
            tier: options?.tier,
            similarity: options?.similarity,
        };

        this.activeDownloads.set(downloadId, info);
        console.log(
            `[DOWNLOAD] Started: "${albumTitle}" by ${artistName} (${downloadId})`
        );
        console.log(`   Album MBID: ${albumMbid}`);
        console.log(`   Active downloads: ${this.activeDownloads.size}`);

        // Persist Lidarr download reference to download job for later status updates
        this.linkDownloadJob(downloadId, albumMbid).catch((error) => {
            console.error(` linkDownloadJob error:`, error);
        });

        // Start timeout on first download
        if (this.activeDownloads.size === 1 && !this.timeoutTimer) {
            this.startTimeout();
        }
    }

    /**
     * Register a callback to be notified when an album is unavailable
     */
    onUnavailableAlbum(callback: UnavailableAlbumCallback) {
        this.unavailableCallbacks.push(callback);
    }

    /**
     * Clear all unavailable album callbacks
     */
    clearUnavailableCallbacks() {
        this.unavailableCallbacks = [];
    }

    /**
     * Mark download as complete
     */
    async completeDownload(downloadId: string, albumTitle: string) {
        this.activeDownloads.delete(downloadId);
        console.log(`Download complete: "${albumTitle}" (${downloadId})`);
        console.log(`   Remaining downloads: ${this.activeDownloads.size}`);

        // If no more downloads, trigger refresh immediately
        if (this.activeDownloads.size === 0) {
            console.log(`⏰ All downloads complete! Starting refresh now...`);
            this.clearTimeout();
            this.triggerFullRefresh();
        }
    }

    /**
     * Mark download as failed and optionally retry
     */
    async failDownload(downloadId: string, reason: string) {
        const info = this.activeDownloads.get(downloadId);
        if (!info) {
            console.log(
                `  Download ${downloadId} not tracked, ignoring failure`
            );
            return;
        }

        console.log(` Download failed: "${info.albumTitle}" (${downloadId})`);
        console.log(`   Reason: ${reason}`);
        console.log(`   Attempt ${info.attempts}/${this.MAX_RETRY_ATTEMPTS}`);

        // Check if we should retry
        if (info.attempts < this.MAX_RETRY_ATTEMPTS) {
            info.attempts++;
            console.log(`    Retrying download... (attempt ${info.attempts})`);
            await this.retryDownload(info);
        } else {
            console.log(`   ⛔ Max retry attempts reached, giving up`);
            await this.cleanupFailedAlbum(info);
            this.activeDownloads.delete(downloadId);

            // Check if all downloads are done
            if (this.activeDownloads.size === 0) {
                console.log(
                    `⏰ All downloads finished (some failed). Starting refresh...`
                );
                this.clearTimeout();
                this.triggerFullRefresh();
            }
        }
    }

    /**
     * Retry a failed download by triggering Lidarr album search
     */
    private async retryDownload(info: DownloadInfo) {
        try {
            if (!info.albumId) {
                console.log(` No album ID, cannot retry`);
                return;
            }

            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();

            if (
                !settings.lidarrEnabled ||
                !settings.lidarrUrl ||
                !settings.lidarrApiKey
            ) {
                console.log(` Lidarr not configured`);
                return;
            }

            const axios = (await import("axios")).default;

            // Trigger new album search
            await axios.post(
                `${settings.lidarrUrl}/api/v1/command`,
                {
                    name: "AlbumSearch",
                    albumIds: [info.albumId],
                },
                {
                    headers: { "X-Api-Key": settings.lidarrApiKey },
                    timeout: 10000,
                }
            );

            console.log(`   Retry search triggered in Lidarr`);
        } catch (error: any) {
            console.log(` Failed to retry: ${error.message}`);
        }
    }

    /**
     * Clean up failed album from Lidarr and Discovery database
     */
    private async cleanupFailedAlbum(info: DownloadInfo) {
        try {
            console.log(`    Cleaning up failed album: ${info.albumTitle}`);

            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();

            if (
                !settings.lidarrEnabled ||
                !settings.lidarrUrl ||
                !settings.lidarrApiKey
            ) {
                return;
            }

            const axios = (await import("axios")).default;

            // Delete album from Lidarr
            if (info.albumId) {
                try {
                    await axios.delete(
                        `${settings.lidarrUrl}/api/v1/album/${info.albumId}`,
                        {
                            headers: { "X-Api-Key": settings.lidarrApiKey },
                            timeout: 10000,
                        }
                    );
                    console.log(`   Removed album from Lidarr`);
                } catch (error: any) {
                    console.log(` Failed to remove album: ${error.message}`);
                }
            }

            // Check if artist has any other albums
            if (info.artistId) {
                try {
                    const artistResponse = await axios.get(
                        `${settings.lidarrUrl}/api/v1/artist/${info.artistId}`,
                        {
                            headers: { "X-Api-Key": settings.lidarrApiKey },
                            timeout: 10000,
                        }
                    );

                    const artist = artistResponse.data;
                    const monitoredAlbums =
                        artist.albums?.filter((a: any) => a.monitored) || [];

                    // If no other monitored albums, remove artist
                    if (monitoredAlbums.length === 0) {
                        await axios.delete(
                            `${settings.lidarrUrl}/api/v1/artist/${info.artistId}`,
                            {
                                params: { deleteFiles: false },
                                headers: { "X-Api-Key": settings.lidarrApiKey },
                                timeout: 10000,
                            }
                        );
                        console.log(
                            `   Removed artist from Lidarr (no other albums)`
                        );
                    }
                } catch (error: any) {
                    console.log(
                        ` Failed to check/remove artist: ${error.message}`
                    );
                }
            }

            // Mark as failed in Discovery database
            const { prisma } = await import("../utils/db");
            await prisma.discoveryAlbum.updateMany({
                where: { albumTitle: info.albumTitle },
                data: { status: "FAILED" },
            });
            console.log(`   Marked as failed in database`);

            // Notify callbacks about unavailable album
            console.log(
                `   [NOTIFY] Notifying ${this.unavailableCallbacks.length} callbacks about unavailable album`
            );
            for (const callback of this.unavailableCallbacks) {
                try {
                    await callback({
                        albumTitle: info.albumTitle,
                        artistName: info.artistName,
                        albumMbid: info.albumMbid,
                        artistMbid: info.artistMbid,
                        userId: info.userId,
                        tier: info.tier,
                        similarity: info.similarity,
                    });
                } catch (error: any) {
                    console.log(` Callback error: ${error.message}`);
                }
            }
        } catch (error: any) {
            console.log(` Cleanup error: ${error.message}`);
        }
    }

    /**
     * Start timeout to trigger scan after X minutes even if downloads are still pending
     */
    private startTimeout() {
        const timeoutMs = this.TIMEOUT_MINUTES * 60 * 1000;
        console.log(
            `[TIMER] Starting ${this.TIMEOUT_MINUTES}-minute timeout for automatic scan`
        );

        this.timeoutTimer = setTimeout(() => {
            if (this.activeDownloads.size > 0) {
                console.log(
                    `\n  Timeout reached! ${this.activeDownloads.size} downloads still pending.`
                );
                console.log(`   These downloads never completed:`);

                // Mark each pending download as failed to trigger callbacks
                for (const [downloadId, info] of this.activeDownloads) {
                    console.log(
                        `     - ${info.albumTitle} by ${info.artistName}`
                    );
                    // This will trigger the unavailable album callback
                    this.failDownload(
                        downloadId,
                        "Download timeout - never completed"
                    ).catch((err) => {
                        console.error(
                            `Error failing download ${downloadId}:`,
                            err
                        );
                    });
                }

                console.log(
                    `   Triggering scan anyway to process completed downloads...\n`
                );
            } else {
                this.triggerFullRefresh();
            }
        }, timeoutMs);
    }

    /**
     * Clear the timeout timer
     */
    private clearTimeout() {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
    }

    /**
     * Trigger full library refresh (Lidarr cleanup → Lidify sync)
     */
    private async triggerFullRefresh() {
        try {
            console.log("\n Starting full library refresh...\n");

            // Step 1: Clear failed imports from Lidarr
            console.log("[1/2] Checking for failed imports in Lidarr...");
            await this.clearFailedLidarrImports();

            // Step 2: Trigger Lidify library sync
            console.log("[2/2] Triggering Lidify library sync...");
            const lidifySuccess = await this.triggerLidifySync();

            if (!lidifySuccess) {
                console.error(" Lidify sync failed");
                return;
            }

            console.log("Lidify sync started");
            console.log(
                "\n[SUCCESS] Full library refresh complete! New music should appear shortly.\n"
            );
        } catch (error) {
            console.error(" Library refresh error:", error);
        }
    }

    /**
     * Clear failed imports from Lidarr queue
     */
    private async clearFailedLidarrImports(): Promise<void> {
        try {
            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();

            if (!settings.lidarrEnabled || !settings.lidarrUrl) {
                console.log(" Lidarr not configured, skipping");
                return;
            }

            const axios = (await import("axios")).default;

            // Get Lidarr API key
            const apiKey = settings.lidarrApiKey;
            if (!apiKey) {
                console.log(" Lidarr API key not found, skipping");
                return;
            }

            // Get queue
            const response = await axios.get(
                `${settings.lidarrUrl}/api/v1/queue`,
                {
                    headers: { "X-Api-Key": apiKey },
                    timeout: 10000,
                }
            );

            const queue = response.data.records || [];

            // Find failed imports
            const failed = queue.filter(
                (item: any) =>
                    item.trackedDownloadStatus === "warning" ||
                    item.trackedDownloadStatus === "error" ||
                    item.status === "warning" ||
                    item.status === "failed"
            );

            if (failed.length === 0) {
                console.log("   No failed imports found");
                return;
            }

            console.log(` Found ${failed.length} failed import(s)`);

            for (const item of failed) {
                const artistName =
                    item.artist?.artistName || item.artist?.name || "Unknown";
                const albumTitle =
                    item.album?.title || item.album?.name || "Unknown Album";

                console.log(`       ${artistName} - ${albumTitle}`);

                try {
                    // Remove from queue, blocklist, and trigger search
                    await axios.delete(
                        `${settings.lidarrUrl}/api/v1/queue/${item.id}`,
                        {
                            params: {
                                removeFromClient: true,
                                blocklist: true,
                            },
                            headers: { "X-Api-Key": apiKey },
                            timeout: 10000,
                        }
                    );

                    // Trigger new search if album ID is available
                    if (item.album?.id) {
                        await axios.post(
                            `${settings.lidarrUrl}/api/v1/command`,
                            {
                                name: "AlbumSearch",
                                albumIds: [item.album.id],
                            },
                            {
                                headers: { "X-Api-Key": apiKey },
                                timeout: 10000,
                            }
                        );
                        console.log(
                            `         → Blocklisted and searching for alternative`
                        );
                    } else {
                        console.log(
                            `         → Blocklisted (no album ID for re-search)`
                        );
                    }
                } catch (error: any) {
                    console.log(`       Failed to process: ${error.message}`);
                }
            }

            console.log(`   Cleared ${failed.length} failed import(s)`);
        } catch (error: any) {
            console.log(` Failed to check Lidarr queue: ${error.message}`);
        }
    }

    /**
     * Trigger Lidify library sync
     */
    private async triggerLidifySync(): Promise<boolean> {
        try {
            const { scanQueue } = await import("../workers/queues");
            const { prisma } = await import("../utils/db");

            console.log("   Starting library scan...");

            // Get first user for scanning
            const firstUser = await prisma.user.findFirst();
            if (!firstUser) {
                console.error(` No users found in database, cannot scan`);
                return false;
            }

            // Trigger scan via queue
            await scanQueue.add("scan", {
                userId: firstUser.id,
                source: "download-queue",
            });

            console.log("Library scan queued");
            return true;
        } catch (error: any) {
            console.error("Lidify sync trigger error:", error.message);
            return false;
        }
    }

    /**
     * Get current queue status
     */
    getStatus() {
        return {
            activeDownloads: this.activeDownloads.size,
            downloads: Array.from(this.activeDownloads.values()),
            timeoutActive: this.timeoutTimer !== null,
        };
    }

    /**
     * Get the active downloads map (for checking if a download is being tracked)
     */
    getActiveDownloads() {
        return this.activeDownloads;
    }

    /**
     * Manually trigger a full refresh (for testing or manual triggers)
     */
    async manualRefresh() {
        console.log("\n Manual refresh triggered...\n");
        await this.triggerFullRefresh();
    }

    /**
     * Clean up stale downloads that have been active for too long
     * This prevents the activeDownloads Map from growing unbounded
     */
    cleanupStaleDownloads(): number {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [downloadId, info] of this.activeDownloads) {
            const age = now - info.startTime;
            if (age > this.STALE_TIMEOUT_MS) {
                console.log(
                    `[CLEANUP] Cleaning up stale download: "${
                        info.albumTitle
                    }" (${downloadId}) - age: ${Math.round(
                        age / 60000
                    )} minutes`
                );
                this.activeDownloads.delete(downloadId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(
                `[CLEANUP] Cleaned up ${cleanedCount} stale download(s)`
            );
        }

        return cleanedCount;
    }

    /**
     * Shutdown the download queue manager (cleanup resources)
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clearTimeout();
        this.activeDownloads.clear();
        console.log("Download queue manager shutdown");
    }

    /**
     * Link Lidarr download IDs to download jobs (so we can mark them completed later)
     */
    private async linkDownloadJob(downloadId: string, albumMbid: string) {
        console.log(
            `   [LINK] Attempting to link download job for MBID: ${albumMbid}`
        );
        try {
            const { prisma } = await import("../utils/db");

            // Debug: Check if job exists
            const existingJobs = await prisma.downloadJob.findMany({
                where: { targetMbid: albumMbid },
                select: {
                    id: true,
                    status: true,
                    lidarrRef: true,
                    targetMbid: true,
                },
            });
            console.log(
                `   [LINK] Found ${existingJobs.length} job(s) with this MBID:`,
                JSON.stringify(existingJobs, null, 2)
            );

            const result = await prisma.downloadJob.updateMany({
                where: {
                    targetMbid: albumMbid,
                    status: { in: ["pending", "processing"] },
                    OR: [{ lidarrRef: null }, { lidarrRef: "" }],
                },
                data: {
                    lidarrRef: downloadId,
                    status: "processing",
                },
            });

            if (result.count === 0) {
                console.log(
                    `     No matching download jobs found to link with Lidarr ID ${downloadId}`
                );
                console.log(
                    ` This means either: no job exists, job already has lidarrRef, or status is not pending/processing`
                );
            } else {
                console.log(
                    `   Linked Lidarr download ${downloadId} to ${result.count} download job(s)`
                );
            }
        } catch (error: any) {
            console.error(
                ` Failed to persist Lidarr download link:`,
                error.message
            );
            console.error(`   Error details:`, error);
        }
    }
}

// Singleton instance
export const downloadQueueManager = new DownloadQueueManager();
