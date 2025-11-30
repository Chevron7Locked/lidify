/**
 * Simple Download Manager (Refactored)
 *
 * Stateless download service that uses the database as the single source of truth.
 * Handles album downloads with automatic retry, blocklisting, and completion tracking.
 * No in-memory state - survives server restarts.
 */

import { prisma } from "../utils/db";
import { lidarrService } from "./lidarr";
import { musicBrainzService } from "./musicbrainz";
import { getSystemSettings } from "../utils/systemSettings";
import axios from "axios";
import * as crypto from "crypto";

// Generate a UUID v4 without external dependency
function generateCorrelationId(): string {
    return crypto.randomUUID();
}

class SimpleDownloadManager {
    private readonly DEFAULT_MAX_ATTEMPTS = 3;
    private readonly IMPORT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Get max retry attempts from user's discover config, fallback to default
     */
    private async getMaxAttempts(userId: string): Promise<number> {
        try {
            const config = await prisma.userDiscoverConfig.findUnique({
                where: { userId },
            });
            return config?.maxRetryAttempts || this.DEFAULT_MAX_ATTEMPTS;
        } catch {
            return this.DEFAULT_MAX_ATTEMPTS;
        }
    }

    /**
     * Start a new download
     * Returns the correlation ID for webhook matching
     */
    async startDownload(
        jobId: string,
        artistName: string,
        albumTitle: string,
        albumMbid: string,
        userId: string
    ): Promise<{ success: boolean; correlationId?: string; error?: string }> {
        console.log(`\n Starting download: ${artistName} - ${albumTitle}`);
        console.log(`   Job ID: ${jobId}`);
        console.log(`   Album MBID: ${albumMbid}`);

        // Generate correlation ID for webhook matching
        const correlationId = generateCorrelationId();

        try {
            // Fetch artist MBID from MusicBrainz using the album MBID
            let artistMbid: string | undefined;
            try {
                console.log(`   Fetching artist MBID from MusicBrainz...`);
                const releaseGroup = await musicBrainzService.getReleaseGroup(
                    albumMbid
                );

                if (releaseGroup?.["artist-credit"]?.[0]?.artist?.id) {
                    artistMbid = releaseGroup["artist-credit"][0].artist.id;
                    console.log(`   Found artist MBID: ${artistMbid}`);
                } else {
                    console.warn(
                        `   Could not extract artist MBID from release group`
                    );
                }
            } catch (mbError) {
                console.error(
                    `   Failed to fetch artist MBID from MusicBrainz:`,
                    mbError
                );
            }

            // Add album to Lidarr
            const result = await lidarrService.addAlbum(
                albumMbid,
                artistName,
                albumTitle,
                "/music",
                artistMbid
            );

            if (!result) {
                throw new Error(
                    "Failed to add album to Lidarr - album not found"
                );
            }

            console.log(`   Album queued in Lidarr (ID: ${result.id})`);

            // Lidarr may have matched by name and returned a different MBID
            const actualLidarrMbid = result.foreignAlbumId;
            if (actualLidarrMbid && actualLidarrMbid !== albumMbid) {
                console.log(
                    `   MBID mismatch - original: ${albumMbid}, Lidarr: ${actualLidarrMbid}`
                );
            }

            // Update job with all tracking information
            const now = new Date();
            await prisma.downloadJob.update({
                where: { id: jobId },
                data: {
                    correlationId, // Unique ID for webhook matching
                    status: "processing",
                    startedAt: now, // For timeout tracking (if field exists)
                    lidarrAlbumId: result.id, // Store Lidarr album ID for retry/cleanup
                    attempts: 1,
                    metadata: {
                        albumTitle,
                        artistName,
                        artistMbid,
                        albumMbid, // Original requested MBID
                        lidarrMbid: actualLidarrMbid, // Actual Lidarr MBID (may differ)
                        downloadType: "library",
                        startedAt: now.toISOString(), // Backup in metadata for timeout tracking
                    },
                },
            });

            console.log(
                `   Download started with correlation ID: ${correlationId}`
            );
            return { success: true, correlationId };
        } catch (error: any) {
            console.error(`   Failed to start download:`, error.message);

            // Update job as failed
            await prisma.downloadJob.update({
                where: { id: jobId },
                data: {
                    correlationId,
                    status: "failed",
                    error: error.message || "Failed to add album to Lidarr",
                    completedAt: new Date(),
                },
            });

            return { success: false, error: error.message };
        }
    }

    /**
     * Handle download grabbed event (from webhook)
     * Links the Lidarr downloadId to our job
     */
    async onDownloadGrabbed(
        downloadId: string,
        albumMbid: string,
        albumTitle: string,
        artistName: string,
        lidarrAlbumId: number
    ): Promise<{ matched: boolean; jobId?: string }> {
        console.log(`\n📥 Download grabbed: ${artistName} - ${albumTitle}`);
        console.log(`   Download ID: ${downloadId}`);
        console.log(`   Album MBID: ${albumMbid}`);
        console.log(`   Lidarr Album ID: ${lidarrAlbumId}`);

        // Get all processing jobs for matching
        const processingJobs = await prisma.downloadJob.findMany({
            where: {
                status: "processing",
            },
        });

        console.log(
            `   Found ${processingJobs.length} processing job(s) to match against`
        );

        let job: (typeof processingJobs)[0] | undefined;

        // Strategy 1: Match by targetMbid (exact MBID match)
        job = processingJobs.find(
            (j) => j.targetMbid === albumMbid && !j.lidarrRef
        );
        if (job) {
            console.log(`    Matched by targetMbid`);
        }

        // Strategy 2: Match by lidarrMbid in metadata
        if (!job) {
            job = processingJobs.find((j) => {
                const metadata = j.metadata as any;
                return metadata?.lidarrMbid === albumMbid && !j.lidarrRef;
            });
            if (job) {
                console.log(`    Matched by lidarrMbid`);
            }
        }

        // Strategy 3: Match by lidarrAlbumId (stored when download started)
        if (!job && lidarrAlbumId > 0) {
            job = processingJobs.find((j) => {
                const metadata = j.metadata as any;
                // Check both direct field and metadata
                return (
                    (j as any).lidarrAlbumId === lidarrAlbumId ||
                    metadata?.lidarrAlbumId === lidarrAlbumId
                );
            });
            if (job) {
                console.log(`    Matched by lidarrAlbumId`);
            }
        }

        // Strategy 4: Fuzzy match by artist + album title in metadata
        if (!job) {
            const normalizedArtist = artistName?.toLowerCase().trim();
            const normalizedAlbum = albumTitle?.toLowerCase().trim();

            job = processingJobs.find((j) => {
                if (j.lidarrRef) return false; // Already linked
                const metadata = j.metadata as any;
                const candidateArtist = metadata?.artistName
                    ?.toLowerCase()
                    .trim();
                const candidateAlbum = metadata?.albumTitle
                    ?.toLowerCase()
                    .trim();
                return (
                    candidateArtist === normalizedArtist &&
                    candidateAlbum === normalizedAlbum
                );
            });
            if (job) {
                console.log(`    Matched by artist/album title in metadata`);
            }
        }

        // Strategy 5: Match by subject field (contains artist or album)
        if (!job) {
            const normalizedArtist = artistName?.toLowerCase().trim();
            const normalizedAlbum = albumTitle?.toLowerCase().trim();

            job = processingJobs.find((j) => {
                if (j.lidarrRef) return false; // Already linked
                const subject = j.subject?.toLowerCase().trim() || "";
                return (
                    subject.includes(normalizedArtist) ||
                    subject.includes(normalizedAlbum)
                );
            });
            if (job) {
                console.log(`    Matched by subject field`);
            }
        }

        // Strategy 6: For retries - update job that already has a different lidarrRef
        // (happens when Lidarr grabs a new release after blocklisting the old one)
        if (!job && lidarrAlbumId > 0) {
            job = processingJobs.find((j) => {
                const metadata = j.metadata as any;
                return (
                    ((j as any).lidarrAlbumId === lidarrAlbumId ||
                        metadata?.lidarrAlbumId === lidarrAlbumId) &&
                    j.lidarrRef !== null
                ); // Has old lidarrRef
            });
            if (job) {
                console.log(
                    `    Matched retry by lidarrAlbumId (updating lidarrRef)`
                );
            }
        }

        if (!job) {
            // Create a new job for this untracked download so we can retry if it fails
            console.log(
                `   No matching job found - creating tracking job for retry support`
            );

            try {
                // Try to find the user who might have triggered this download
                // (e.g., from a recent artist add request)
                const recentJob = await prisma.downloadJob.findFirst({
                    where: {
                        type: "artist",
                        status: { in: ["pending", "processing", "completed"] },
                        metadata: {
                            path: ["artistName"],
                            string_contains: artistName,
                        },
                    },
                    orderBy: { createdAt: "desc" },
                });

                const userId = recentJob?.userId;

                if (userId) {
                    const newJob = await prisma.downloadJob.create({
                        data: {
                            userId,
                            type: "album",
                            targetMbid: albumMbid,
                            status: "processing",
                            lidarrRef: downloadId,
                            lidarrAlbumId,
                            attempts: 1,
                            metadata: {
                                artistName,
                                albumTitle,
                                downloadId,
                                grabbedAt: new Date().toISOString(),
                                source: "lidarr-auto-grab",
                            },
                        },
                    });
                    console.log(`   Created tracking job: ${newJob.id}`);
                    return { matched: true, jobId: newJob.id };
                } else {
                    console.log(
                        `   Could not determine user, skipping job creation`
                    );
                    return { matched: false };
                }
            } catch (error: any) {
                console.log(
                    `   Failed to create tracking job: ${error.message}`
                );
                return { matched: false };
            }
        }

        // Update job with Lidarr reference
        await prisma.downloadJob.update({
            where: { id: job.id },
            data: {
                lidarrRef: downloadId,
                lidarrAlbumId,
                metadata: {
                    ...((job.metadata as any) || {}),
                    downloadId,
                    grabbedAt: new Date().toISOString(),
                },
            },
        });

        console.log(`   Linked to job: ${job.id}`);
        return { matched: true, jobId: job.id };
    }

    /**
     * Handle download complete event (from webhook)
     */
    async onDownloadComplete(
        downloadId: string,
        albumMbid?: string,
        artistName?: string,
        albumTitle?: string
    ): Promise<{ jobId?: string; batchId?: string; downloadBatchId?: string }> {
        console.log(`\n Download completed: ${downloadId}`);
        if (albumMbid) console.log(`   Album MBID: ${albumMbid}`);
        if (artistName && albumTitle)
            console.log(`   Album: ${artistName} - ${albumTitle}`);

        // Get all processing jobs for matching
        const processingJobs = await prisma.downloadJob.findMany({
            where: { status: "processing" },
        });

        console.log(
            `   Found ${processingJobs.length} processing job(s) to match against`
        );

        let job: (typeof processingJobs)[0] | undefined;

        // Strategy 1: Find job by lidarrRef (most reliable)
        job = processingJobs.find((j) => j.lidarrRef === downloadId);
        if (job) console.log(`    Matched by lidarrRef`);

        // Strategy 2: Match by previousDownloadIds (for retried downloads)
        if (!job) {
            job = processingJobs.find((j) => {
                const metadata = j.metadata as any;
                const prevIds = metadata?.previousDownloadIds as
                    | string[]
                    | undefined;
                return prevIds?.includes(downloadId);
            });
            if (job) console.log(`    Matched by previousDownloadIds`);
        }

        // Strategy 3: Match by MBID
        if (!job && albumMbid) {
            job = processingJobs.find((j) => j.targetMbid === albumMbid);
            if (job) console.log(`    Matched by albumMbid`);
        }

        // Strategy 4: Match by lidarrMbid in metadata
        if (!job && albumMbid) {
            job = processingJobs.find((j) => {
                const metadata = j.metadata as any;
                return metadata?.lidarrMbid === albumMbid;
            });
            if (job) console.log(`    Matched by lidarrMbid in metadata`);
        }

        // Strategy 5: Match by artist/album name
        if (!job && artistName && albumTitle) {
            const normalizedArtist = artistName.toLowerCase().trim();
            const normalizedAlbum = albumTitle.toLowerCase().trim();

            job = processingJobs.find((j) => {
                const metadata = j.metadata as any;
                const candidateArtist = metadata?.artistName
                    ?.toLowerCase()
                    .trim();
                const candidateAlbum = metadata?.albumTitle
                    ?.toLowerCase()
                    .trim();
                return (
                    candidateArtist === normalizedArtist &&
                    candidateAlbum === normalizedAlbum
                );
            });
            if (job) console.log(`    Matched by artist/album name`);
        }

        // Strategy 6: Match by subject containing artist/album
        if (!job && artistName) {
            const normalizedArtist = artistName.toLowerCase().trim();
            job = processingJobs.find((j) => {
                const subject = j.subject?.toLowerCase().trim() || "";
                return subject.includes(normalizedArtist);
            });
            if (job) console.log(`    Matched by subject field`);
        }

        if (!job) {
            console.log(
                `   No matching job found for downloadId: ${downloadId}`
            );
            return {};
        }

        // Mark job as completed
        await prisma.downloadJob.update({
            where: { id: job.id },
            data: {
                status: "completed",
                completedAt: new Date(),
                metadata: {
                    ...((job.metadata as any) || {}),
                    completedAt: new Date().toISOString(),
                },
            },
        });

        console.log(`   Job ${job.id} marked complete`);

        const metadata = job.metadata as any;
        const downloadBatchId = metadata?.batchId as string | undefined;

        // Check if part of discovery batch
        if (job.discoveryBatchId) {
            console.log(`   Part of Discovery batch: ${job.discoveryBatchId}`);
            // Use dynamic import to avoid circular dependency
            const { discoverWeeklyService } = await import("./discoverWeekly");
            await discoverWeeklyService.checkBatchCompletion(
                job.discoveryBatchId
            );
            return {
                jobId: job.id,
                batchId: job.discoveryBatchId,
                downloadBatchId,
            };
        }

        // Check if part of download batch (artist download)
        if (downloadBatchId) {
            console.log(`   Part of download batch: ${downloadBatchId}`);
        }

        return { jobId: job.id, downloadBatchId };
    }

    // Track recently processed failure events to prevent duplicate handling
    private processedFailures = new Map<string, number>();
    private readonly FAILURE_DEDUP_WINDOW_MS = 30000; // 30 seconds

    /**
     * Handle import failure with automatic retry
     */
    async onImportFailed(
        downloadId: string,
        reason: string,
        albumMbid?: string
    ): Promise<{ retried: boolean; failed: boolean; jobId?: string }> {
        console.log(`\n Import failed: ${downloadId}`);
        console.log(`   Reason: ${reason}`);

        // Deduplicate failure events - same downloadId within 30 seconds
        const now = Date.now();
        const lastProcessed = this.processedFailures.get(downloadId);
        if (
            lastProcessed &&
            now - lastProcessed < this.FAILURE_DEDUP_WINDOW_MS
        ) {
            console.log(
                `   Duplicate failure event (within ${
                    this.FAILURE_DEDUP_WINDOW_MS / 1000
                }s), skipping`
            );
            return { retried: false, failed: false };
        }
        this.processedFailures.set(downloadId, now);

        // Clean up old entries periodically
        if (this.processedFailures.size > 100) {
            for (const [id, time] of this.processedFailures) {
                if (now - time > this.FAILURE_DEDUP_WINDOW_MS * 2) {
                    this.processedFailures.delete(id);
                }
            }
        }

        // Find all processing jobs to match against
        const processingJobs = await prisma.downloadJob.findMany({
            where: { status: "processing" },
        });

        let job: (typeof processingJobs)[0] | undefined;

        // Strategy 1: Match by current lidarrRef
        job = processingJobs.find((j) => j.lidarrRef === downloadId);
        if (job) console.log(`    Matched by lidarrRef`);

        // Strategy 2: Match by previousDownloadIds in metadata
        if (!job) {
            job = processingJobs.find((j) => {
                const metadata = j.metadata as any;
                const prevIds = metadata?.previousDownloadIds as
                    | string[]
                    | undefined;
                return prevIds?.includes(downloadId);
            });
            if (job) console.log(`    Matched by previousDownloadIds`);
        }

        // Strategy 3: Match by MBID
        if (!job && albumMbid) {
            job = processingJobs.find((j) => j.targetMbid === albumMbid);
            if (job) console.log(`    Matched by albumMbid`);
        }

        if (!job) {
            console.log(
                `   No matching job found - cleaning up Lidarr queue anyway`
            );
            // Still try to remove from Lidarr queue to prevent it from being stuck
            await this.removeFromLidarrQueue(downloadId);
            return { retried: false, failed: false };
        }

        const maxAttempts = await this.getMaxAttempts(job.userId);
        const currentAttempts = (job as any).attempts || 1;

        console.log(`   Found job: ${job.id}`);
        console.log(`   Attempt ${currentAttempts}/${maxAttempts}`);

        if (currentAttempts >= maxAttempts) {
            // Max attempts reached, fail the job
            await prisma.downloadJob.update({
                where: { id: job.id },
                data: {
                    status: "failed",
                    error: `Import failed after ${maxAttempts} attempts: ${reason}`,
                    completedAt: new Date(),
                },
            });

            console.log(`   Max attempts reached, job failed`);

            // Check batch completion
            if (job.discoveryBatchId) {
                const { discoverWeeklyService } = await import(
                    "./discoverWeekly"
                );
                await discoverWeeklyService.checkBatchCompletion(
                    job.discoveryBatchId
                );
            }

            return { retried: false, failed: true, jobId: job.id };
        }

        // Retry the download
        console.log(`   Retrying download...`);

        // Blocklist the failed release and trigger new search
        if (job.lidarrAlbumId) {
            await this.blocklistAndRetry(downloadId, job.lidarrAlbumId);
        } else {
            // No lidarrAlbumId - try to search by MBID
            console.log(`   No lidarrAlbumId - attempting MBID-based retry`);
            const targetMbid = job.targetMbid || albumMbid;
            if (targetMbid) {
                try {
                    const settings = await getSystemSettings();
                    if (settings?.lidarrUrl && settings?.lidarrApiKey) {
                        // Search for album in Lidarr by MBID
                        const searchResponse = await axios.get(
                            `${settings.lidarrUrl}/api/v1/album?foreignAlbumId=${targetMbid}`,
                            {
                                headers: { "X-Api-Key": settings.lidarrApiKey },
                                timeout: 10000,
                            }
                        );

                        if (searchResponse.data?.length > 0) {
                            const album = searchResponse.data[0];
                            console.log(
                                `   Found album in Lidarr: ${album.title} (ID: ${album.id})`
                            );

                            // Update job with lidarrAlbumId for future retries
                            await prisma.downloadJob.update({
                                where: { id: job.id },
                                data: { lidarrAlbumId: album.id },
                            });

                            // Now blocklist and retry
                            await this.blocklistAndRetry(downloadId, album.id);
                        } else {
                            console.log(
                                `   Could not find album in Lidarr by MBID`
                            );
                        }
                    }
                } catch (error: any) {
                    console.log(`   MBID-based retry failed: ${error.message}`);
                }
            }
        }

        // Update attempt count and track old downloadId for future matching
        const metadata = (job.metadata as any) || {};
        const previousDownloadIds = metadata.previousDownloadIds || [];
        if (downloadId && !previousDownloadIds.includes(downloadId)) {
            previousDownloadIds.push(downloadId);
        }

        await prisma.downloadJob.update({
            where: { id: job.id },
            data: {
                attempts: currentAttempts + 1,
                lidarrRef: null, // Clear ref so we can get a new one
                metadata: {
                    ...metadata,
                    lastError: reason,
                    lastRetryAt: new Date().toISOString(),
                    previousDownloadIds, // Track old IDs for matching stale webhooks
                },
            },
        });

        console.log(
            `   Retry triggered (attempt ${currentAttempts + 1}/${maxAttempts})`
        );
        return { retried: true, failed: false, jobId: job.id };
    }

    // Shorter timeout for "no sources" - if Lidarr hasn't grabbed anything
    private readonly NO_SOURCE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

    /**
     * Mark stale jobs as failed (called by cleanup job)
     * - Jobs with no lidarrRef (never grabbed) timeout after 2 minutes = "no sources found"
     * - Jobs with lidarrRef (grabbed but not imported) timeout after 5 minutes = "import failed"
     */
    async markStaleJobsAsFailed(): Promise<number> {
        const noSourceCutoff = new Date(Date.now() - this.NO_SOURCE_TIMEOUT_MS);
        const importCutoff = new Date(Date.now() - this.IMPORT_TIMEOUT_MS);

        // Find all processing jobs
        const processingJobs = await prisma.downloadJob.findMany({
            where: { status: "processing" },
        });

        if (processingJobs.length === 0) {
            return 0;
        }

        const staleJobs: typeof processingJobs = [];

        for (const job of processingJobs) {
            const metadata = job.metadata as any;
            const startedAt = metadata?.startedAt
                ? new Date(metadata.startedAt)
                : job.createdAt;

            // Jobs without lidarrRef = Lidarr never grabbed = no sources found
            if (!job.lidarrRef) {
                if (startedAt < noSourceCutoff) {
                    staleJobs.push(job);
                }
            } else {
                // Jobs with lidarrRef = grabbed but not imported
                if (startedAt < importCutoff) {
                    staleJobs.push(job);
                }
            }
        }

        if (staleJobs.length === 0) {
            return 0;
        }

        console.log(`\n⏰ Found ${staleJobs.length} stale download jobs`);

        // Track unique batch IDs to check
        const batchIds = new Set<string>();
        const downloadBatchIds = new Set<string>();

        for (const job of staleJobs) {
            const hasLidarrRef = !!job.lidarrRef;
            const errorMessage = hasLidarrRef
                ? `Import failed - download stuck for ${
                      this.IMPORT_TIMEOUT_MS / 60000
                  } minutes`
                : `No sources found - no indexer results`;

            console.log(
                `   Timing out: ${job.subject} (${
                    hasLidarrRef ? "stuck import" : "no sources"
                })`
            );

            await prisma.downloadJob.update({
                where: { id: job.id },
                data: {
                    status: "failed",
                    error: errorMessage,
                    completedAt: new Date(),
                },
            });

            // Clean up from Lidarr queue if possible
            const lidarrAlbumId = (job as any).lidarrAlbumId;
            if (lidarrAlbumId && job.lidarrRef) {
                await this.blocklistAndRetry(job.lidarrRef, lidarrAlbumId);
            }

            if (job.discoveryBatchId) {
                batchIds.add(job.discoveryBatchId);
            }

            // Track download batch IDs for artist downloads
            const metadata = job.metadata as any;
            if (metadata?.batchId) {
                downloadBatchIds.add(metadata.batchId);
            }
        }

        // Check discovery batch completion for affected batches
        if (batchIds.size > 0) {
            const { discoverWeeklyService } = await import("./discoverWeekly");
            for (const batchId of batchIds) {
                console.log(
                    `   Checking discovery batch completion: ${batchId}`
                );
                await discoverWeeklyService.checkBatchCompletion(batchId);
            }
        }

        return staleJobs.length;
    }

    /**
     * Blocklist a failed release and trigger new search
     */
    private async blocklistAndRetry(downloadId: string, lidarrAlbumId: number) {
        try {
            const settings = await getSystemSettings();
            if (!settings?.lidarrUrl || !settings?.lidarrApiKey) return;

            // Get queue to find the specific release
            try {
                const queueResponse = await axios.get(
                    `${settings.lidarrUrl}/api/v1/queue`,
                    {
                        headers: { "X-Api-Key": settings.lidarrApiKey },
                        timeout: 10000,
                    }
                );

                const queueItem = queueResponse.data.records?.find(
                    (item: any) => item.downloadId === downloadId
                );

                if (queueItem) {
                    // Remove from queue with blocklist=true
                    await axios.delete(
                        `${settings.lidarrUrl}/api/v1/queue/${queueItem.id}?removeFromClient=true&blocklist=true`,
                        {
                            headers: { "X-Api-Key": settings.lidarrApiKey },
                            timeout: 10000,
                        }
                    );
                    console.log(`   Blocklisted failed release`);
                }
            } catch (queueError: any) {
                // Queue item may have already been removed
                console.log(`   Queue cleanup: ${queueError.message}`);
            }

            // Trigger new album search
            await axios.post(
                `${settings.lidarrUrl}/api/v1/command`,
                {
                    name: "AlbumSearch",
                    albumIds: [lidarrAlbumId],
                },
                {
                    headers: { "X-Api-Key": settings.lidarrApiKey },
                    timeout: 10000,
                }
            );
            console.log(`   Triggered new search`);
        } catch (error: any) {
            console.error(`   Blocklist/retry failed:`, error.message);
        }
    }

    /**
     * Remove a failed download from Lidarr's queue (without retrying)
     * Used when we don't have a tracking job but still need to clean up
     */
    private async removeFromLidarrQueue(downloadId: string) {
        try {
            const settings = await getSystemSettings();
            if (!settings?.lidarrUrl || !settings?.lidarrApiKey) return;

            const queueResponse = await axios.get(
                `${settings.lidarrUrl}/api/v1/queue`,
                {
                    headers: { "X-Api-Key": settings.lidarrApiKey },
                    timeout: 10000,
                }
            );

            const queueItem = queueResponse.data.records?.find(
                (item: any) => item.downloadId === downloadId
            );

            if (queueItem) {
                // Remove from queue with blocklist=true to prevent re-download of same release
                await axios.delete(
                    `${settings.lidarrUrl}/api/v1/queue/${queueItem.id}?removeFromClient=true&blocklist=true`,
                    {
                        headers: { "X-Api-Key": settings.lidarrApiKey },
                        timeout: 10000,
                    }
                );
                console.log(`   Removed from Lidarr queue and blocklisted`);
            } else {
                console.log(
                    `   Item not found in Lidarr queue (may already be removed)`
                );
            }
        } catch (error: any) {
            console.error(
                `   Failed to remove from Lidarr queue:`,
                error.message
            );
        }
    }

    /**
     * Clear all failed/stuck items from Lidarr's download queue
     * and trigger new searches for the albums
     */
    async clearLidarrQueue(): Promise<{ removed: number; errors: string[] }> {
        const errors: string[] = [];
        let removed = 0;
        const albumIdsToSearch: number[] = [];

        try {
            const settings = await getSystemSettings();
            if (!settings?.lidarrUrl || !settings?.lidarrApiKey) {
                return { removed: 0, errors: ["Lidarr not configured"] };
            }

            console.log(`\nClearing Lidarr download queue...`);

            const queueResponse = await axios.get(
                `${settings.lidarrUrl}/api/v1/queue`,
                {
                    headers: { "X-Api-Key": settings.lidarrApiKey },
                    timeout: 10000,
                }
            );

            const records = queueResponse.data.records || [];

            if (records.length === 0) {
                return { removed: 0, errors: [] };
            }

            console.log(`   Found ${records.length} items in queue`);

            // Filter for failed/warning status items
            const failedItems = records.filter(
                (item: any) =>
                    item.status === "warning" ||
                    item.status === "failed" ||
                    item.trackedDownloadStatus === "warning" ||
                    item.trackedDownloadStatus === "error" ||
                    item.trackedDownloadState === "importPending" ||
                    item.trackedDownloadState === "importFailed" ||
                    (item.statusMessages && item.statusMessages.length > 0)
            );

            if (failedItems.length === 0) {
                return { removed: 0, errors: [] };
            }

            console.log(`   ${failedItems.length} items have errors/warnings`);

            for (const item of failedItems) {
                try {
                    // Collect album IDs for re-search
                    if (item.albumId) {
                        albumIdsToSearch.push(item.albumId);
                    }

                    // Remove from queue with blocklist
                    await axios.delete(
                        `${settings.lidarrUrl}/api/v1/queue/${item.id}?removeFromClient=true&blocklist=true&skipRedownload=false`,
                        {
                            headers: { "X-Api-Key": settings.lidarrApiKey },
                            timeout: 10000,
                        }
                    );
                    console.log(
                        `    Removed: ${
                            item.title || item.album?.title || "Unknown"
                        }`
                    );
                    removed++;
                } catch (error: any) {
                    const msg = `Failed to remove ${item.id}: ${error.message}`;
                    console.log(`   ✗ ${msg}`);
                    errors.push(msg);
                }
            }

            // Explicitly trigger album searches for removed items
            if (albumIdsToSearch.length > 0) {
                try {
                    console.log(
                        `    Triggering search for ${albumIdsToSearch.length} album(s)...`
                    );
                    await axios.post(
                        `${settings.lidarrUrl}/api/v1/command`,
                        {
                            name: "AlbumSearch",
                            albumIds: albumIdsToSearch,
                        },
                        {
                            headers: { "X-Api-Key": settings.lidarrApiKey },
                            timeout: 10000,
                        }
                    );
                    console.log(
                        `    Search triggered for alternative releases`
                    );
                } catch (searchError: any) {
                    console.log(
                        ` Failed to trigger search: ${searchError.message}`
                    );
                }
            }

            console.log(`   Removed ${removed} items from queue`);
            return { removed, errors };
        } catch (error: any) {
            console.error(`   Queue cleanup failed:`, error.message);
            return { removed, errors: [error.message] };
        }
    }

    /**
     * Get statistics about current downloads
     */
    async getStats(): Promise<{
        pending: number;
        processing: number;
        completed: number;
        failed: number;
    }> {
        const [pending, processing, completed, failed] = await Promise.all([
            prisma.downloadJob.count({ where: { status: "pending" } }),
            prisma.downloadJob.count({ where: { status: "processing" } }),
            prisma.downloadJob.count({ where: { status: "completed" } }),
            prisma.downloadJob.count({ where: { status: "failed" } }),
        ]);

        return { pending, processing, completed, failed };
    }
}

// Singleton instance
export const simpleDownloadManager = new SimpleDownloadManager();
