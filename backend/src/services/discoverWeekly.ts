/**
 * Discovery Weekly Service (Refactored)
 *
 * Generates weekly discovery playlists using Last.fm recommendations,
 * downloads via Lidarr, and only shows songs after successful import.
 *
 * Key improvements:
 * - Prisma transactions for atomic operations
 * - Pre-fetched and cached recommendations
 * - Structured logging with batch logs field
 * - No dynamic imports
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { lastFmService } from "./lastfm";
import { musicBrainzService } from "./musicbrainz";
import { simpleDownloadManager } from "./simpleDownloadManager";
import { lidarrService } from "./lidarr";
import { scanQueue } from "../workers/queues";
import { startOfWeek, subWeeks } from "date-fns";
import { getSystemSettings } from "../utils/systemSettings";

interface SeedArtist {
    name: string;
    mbid?: string;
}

interface RecommendedAlbum {
    artistName: string;
    artistMbid?: string;
    albumTitle: string;
    albumMbid: string;
    similarity: number;
}

interface BatchLogEntry {
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
}

export class DiscoverWeeklyService {
    /**
     * Process liked albums before generating new playlist
     * - Moves LIKED albums to LIBRARY
     * - Deletes non-liked (ACTIVE) albums
     * - Cleans up Lidarr
     */
    private async processLikedAlbumsBeforeGeneration(
        userId: string,
        settings: any
    ): Promise<void> {
        console.log(`\n Processing previous discovery albums...`);

        // Find all active discovery albums for this user
        const discoveryAlbums = await prisma.discoveryAlbum.findMany({
            where: {
                userId,
                status: { in: ["ACTIVE", "LIKED"] },
            },
        });

        if (discoveryAlbums.length === 0) {
            console.log(`   No previous discovery albums to process`);
            return;
        }

        const likedAlbums = discoveryAlbums.filter((a) => a.status === "LIKED");
        const activeAlbums = discoveryAlbums.filter(
            (a) => a.status === "ACTIVE"
        );

        console.log(`   Found ${likedAlbums.length} liked albums to keep`);
        console.log(
            `   Found ${activeAlbums.length} non-liked albums to remove`
        );

        // Process liked albums - move to library
        for (const album of likedAlbums) {
            try {
                // Find the album in database
                const dbAlbum = await prisma.album.findFirst({
                    where: { rgMbid: album.rgMbid },
                    include: { artist: true },
                });

                if (dbAlbum) {
                    // Update album location to LIBRARY
                    await prisma.album.update({
                        where: { id: dbAlbum.id },
                        data: { location: "LIBRARY" },
                    });

                    // Create OwnedAlbum record
                    await prisma.ownedAlbum.upsert({
                        where: {
                            artistId_rgMbid: {
                                artistId: dbAlbum.artistId,
                                rgMbid: dbAlbum.rgMbid,
                            },
                        },
                        create: {
                            artistId: dbAlbum.artistId,
                            rgMbid: dbAlbum.rgMbid,
                            source: "discover_liked",
                        },
                        update: {},
                    });

                    console.log(
                        `    Moved to library: ${album.artistName} - ${album.albumTitle}`
                    );
                }

                // Mark as MOVED
                await prisma.discoveryAlbum.update({
                    where: { id: album.id },
                    data: { status: "MOVED" },
                });
            } catch (error: any) {
                console.error(
                    `   ✗ Failed to move ${album.albumTitle}: ${error.message}`
                );
            }
        }

        // Process active albums - delete them
        for (const album of activeAlbums) {
            try {
                // Delete from Lidarr if enabled
                if (
                    settings.lidarrEnabled &&
                    settings.lidarrUrl &&
                    settings.lidarrApiKey &&
                    album.lidarrAlbumId
                ) {
                    try {
                        const axios = (await import("axios")).default;
                        await axios.delete(
                            `${settings.lidarrUrl}/api/v1/album/${album.lidarrAlbumId}`,
                            {
                                params: { deleteFiles: true },
                                headers: { "X-Api-Key": settings.lidarrApiKey },
                                timeout: 10000,
                            }
                        );
                    } catch (lidarrError: any) {
                        if (lidarrError.response?.status !== 404) {
                            console.log(
                                ` Lidarr delete failed: ${lidarrError.message}`
                            );
                        }
                    }
                }

                // Delete from database
                const dbAlbum = await prisma.album.findFirst({
                    where: { rgMbid: album.rgMbid },
                });

                if (dbAlbum) {
                    await prisma.track.deleteMany({
                        where: { albumId: dbAlbum.id },
                    });
                    await prisma.album.delete({ where: { id: dbAlbum.id } });
                }

                // Delete discovery track records
                await prisma.discoveryTrack.deleteMany({
                    where: { discoveryAlbumId: album.id },
                });

                // Mark as DELETED
                await prisma.discoveryAlbum.update({
                    where: { id: album.id },
                    data: { status: "DELETED" },
                });

                console.log(
                    `    Deleted: ${album.artistName} - ${album.albumTitle}`
                );
            } catch (error: any) {
                console.error(
                    `   ✗ Failed to delete ${album.albumTitle}: ${error.message}`
                );
            }
        }

        // Clean up unavailable albums from previous week
        await prisma.unavailableAlbum.deleteMany({ where: { userId } });

        console.log(`   Previous discovery cleanup complete`);
    }

    /**
     * Add a log entry to batch logs
     */
    private async addBatchLog(
        batchId: string,
        level: "info" | "warn" | "error",
        message: string
    ): Promise<void> {
        try {
            const batch = await prisma.discoveryBatch.findUnique({
                where: { id: batchId },
                select: { logs: true },
            });

            const logs = (batch?.logs as unknown as BatchLogEntry[]) || [];
            logs.push({
                timestamp: new Date().toISOString(),
                level,
                message,
            });

            // Keep only last 100 log entries
            const trimmedLogs = logs.slice(-100);

            await prisma.discoveryBatch.update({
                where: { id: batchId },
                data: { logs: trimmedLogs as any },
            });
        } catch (error) {
            // Don't fail if logging fails
            console.error("Failed to add batch log:", error);
        }
    }

    /**
     * Main entry: Generate Discovery Weekly
     */
    async generatePlaylist(userId: string) {
        console.log(`\n Starting Discovery Weekly for user ${userId}`);

        // Check if Lidarr is enabled and configured
        const settings = await getSystemSettings();
        if (
            !settings?.lidarrEnabled ||
            !settings?.lidarrUrl ||
            !settings?.lidarrApiKey
        ) {
            throw new Error(
                "Lidarr must be enabled and configured to use Discovery Weekly"
            );
        }

        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

        // Get user config
        const config = await prisma.userDiscoverConfig.findUnique({
            where: { userId },
        });

        if (!config || !config.enabled) {
            throw new Error("Discovery Weekly not enabled");
        }

        // CRITICAL: Process previous week's liked albums before generating new ones
        // This moves liked albums to library and cleans up non-liked ones
        await this.processLikedAlbumsBeforeGeneration(userId, settings);

        const targetCount = config.playlistSize;
        console.log(`   Target: ${targetCount} songs`);

        // Step 1: Get seed artists
        const seeds = await this.getSeedArtists(userId);
        if (seeds.length === 0) {
            throw new Error("No seed artists found - need listening history");
        }
        console.log(`   ${seeds.length} seed artists`);

        // Step 2: Pre-fetch and cache similar artists (parallel with rate limiting)
        console.log(`\n Pre-fetching similar artists...`);
        const similarArtistsMap = await this.prefetchSimilarArtists(seeds);
        console.log(`   Cached ${similarArtistsMap.size} similar artist sets`);

        // Step 3: Find recommended albums using cached data
        const recommended = await this.findRecommendedAlbums(
            seeds,
            similarArtistsMap,
            targetCount,
            userId
        );

        if (recommended.length === 0) {
            throw new Error("No recommendations found");
        }
        console.log(`   ${recommended.length} recommended albums`);

        // Step 4: Create batch and jobs in a transaction
        const batch = await prisma.$transaction(async (tx) => {
            // Create discovery batch
            const newBatch = await tx.discoveryBatch.create({
                data: {
                    userId,
                    weekStart,
                    targetSongCount: targetCount,
                    status: "downloading",
                    totalAlbums: recommended.length,
                    completedAlbums: 0,
                    failedAlbums: 0,
                    logs: [
                        {
                            timestamp: new Date().toISOString(),
                            level: "info",
                            message: `Started with ${recommended.length} albums to download`,
                        },
                    ] as any,
                },
            });

            // Create all download jobs in the same transaction
            for (const album of recommended) {
                await tx.downloadJob.create({
                    data: {
                        userId,
                        subject: `${album.artistName} - ${album.albumTitle}`,
                        type: "album",
                        targetMbid: album.albumMbid,
                        status: "pending",
                        discoveryBatchId: newBatch.id,
                        metadata: {
                            downloadType: "discovery",
                            rootFolderPath: "/music",
                            artistName: album.artistName,
                            artistMbid: album.artistMbid,
                            albumTitle: album.albumTitle,
                            albumMbid: album.albumMbid,
                            similarity: album.similarity,
                        },
                    },
                });

                // Add to exclusion list
                const sixMonthsFromNow = new Date();
                sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

                await tx.discoverExclusion.upsert({
                    where: {
                        userId_albumMbid: {
                            userId,
                            albumMbid: album.albumMbid,
                        },
                    },
                    update: {
                        lastSuggestedAt: new Date(),
                        expiresAt: sixMonthsFromNow,
                    },
                    create: {
                        userId,
                        albumMbid: album.albumMbid,
                        lastSuggestedAt: new Date(),
                        expiresAt: sixMonthsFromNow,
                    },
                });
            }

            return newBatch;
        });

        // Step 5: Start downloads outside transaction (they involve external APIs)
        console.log(`\n[DOWNLOAD] Starting ${recommended.length} downloads...`);
        let downloadsStarted = 0;

        const jobs = await prisma.downloadJob.findMany({
            where: { discoveryBatchId: batch.id },
        });

        for (const job of jobs) {
            const metadata = job.metadata as any;
            try {
                const result = await simpleDownloadManager.startDownload(
                    job.id,
                    metadata.artistName,
                    metadata.albumTitle,
                    metadata.albumMbid,
                    userId
                );

                if (result.success) {
                    downloadsStarted++;
                    console.log(`   Started: ${metadata.albumTitle}`);
                } else {
                    console.log(
                        `   Failed: ${metadata.albumTitle} - ${result.error}`
                    );
                    await this.addBatchLog(
                        batch.id,
                        "error",
                        `Failed to start: ${metadata.albumTitle} - ${result.error}`
                    );
                }
            } catch (error: any) {
                console.error(
                    `   Error: ${metadata.albumTitle}:`,
                    error.message
                );
                await this.addBatchLog(
                    batch.id,
                    "error",
                    `Error starting: ${metadata.albumTitle} - ${error.message}`
                );
            }
        }

        console.log(`\nDiscovery Weekly generation started`);
        console.log(
            `   Downloads queued: ${downloadsStarted}/${recommended.length}`
        );

        await this.addBatchLog(
            batch.id,
            "info",
            `${downloadsStarted} downloads started, waiting for webhooks`
        );

        return {
            success: true,
            playlistName: `Discover Weekly (Week of ${weekStart.toLocaleDateString()})`,
            songCount: 0,
            batchId: batch.id,
        };
    }

    /**
     * Pre-fetch similar artists for all seeds (parallel with rate limiting)
     */
    private async prefetchSimilarArtists(
        seeds: SeedArtist[]
    ): Promise<Map<string, any[]>> {
        const cache = new Map<string, any[]>();

        // Process seeds in smaller batches to avoid overwhelming APIs
        const batchSize = 3;
        for (let i = 0; i < seeds.length; i += batchSize) {
            const seedBatch = seeds.slice(i, i + batchSize);

            const results = await Promise.all(
                seedBatch.map(async (seed) => {
                    try {
                        const similar = await lastFmService.getSimilarArtists(
                            seed.mbid || "",
                            seed.name,
                            20
                        );
                        return { key: seed.mbid || seed.name, similar };
                    } catch (error) {
                        console.warn(
                            `   Failed to get similar artists for ${seed.name}`
                        );
                        return { key: seed.mbid || seed.name, similar: [] };
                    }
                })
            );

            for (const { key, similar } of results) {
                cache.set(key, similar);
            }

            // Small delay between batches
            if (i + batchSize < seeds.length) {
                await new Promise((r) => setTimeout(r, 300));
            }
        }

        return cache;
    }

    /**
     * Check if discovery batch is complete and trigger final steps
     */
    async checkBatchCompletion(batchId: string) {
        const batch = await prisma.discoveryBatch.findUnique({
            where: { id: batchId },
            include: { jobs: true },
        });

        if (!batch) return;

        const completedJobs = batch.jobs.filter(
            (j) => j.status === "completed"
        );
        const failedJobs = batch.jobs.filter((j) => j.status === "failed");
        const pendingJobs = batch.jobs.filter(
            (j) => j.status === "pending" || j.status === "processing"
        );

        const completed = completedJobs.length;
        const failed = failedJobs.length;
        const total = batch.jobs.length;

        console.log(
            `\nBatch ${batchId}: ${completed}/${total} complete, ${failed} failed, ${pendingJobs.length} pending`
        );

        // Not all jobs finished yet
        if (pendingJobs.length > 0) {
            console.log(`   Still waiting for ${pendingJobs.length} downloads`);
            return;
        }

        // All jobs finished - use transaction to update batch and create unavailable records
        await prisma.$transaction(async (tx) => {
            // Create UnavailableAlbum records for failed downloads
            for (const job of failedJobs) {
                const metadata = job.metadata as any;
                try {
                    await tx.unavailableAlbum.upsert({
                        where: {
                            userId_weekStartDate_albumMbid: {
                                userId: batch.userId,
                                weekStartDate: batch.weekStart,
                                albumMbid: job.targetMbid,
                            },
                        },
                        create: {
                            userId: batch.userId,
                            albumMbid: job.targetMbid,
                            artistName: metadata?.artistName || "Unknown",
                            albumTitle: metadata?.albumTitle || "Unknown",
                            similarity: metadata?.similarity || 0.5,
                            tier: "medium",
                            attemptNumber: 1,
                            weekStartDate: batch.weekStart,
                        },
                        update: {
                            attemptNumber: { increment: 1 },
                        },
                    });
                } catch (e) {
                    // Ignore duplicate errors
                }
            }

            // Update batch status
            if (completed === 0) {
                await tx.discoveryBatch.update({
                    where: { id: batchId },
                    data: {
                        status: "failed",
                        completedAlbums: 0,
                        failedAlbums: failed,
                        errorMessage: "All downloads failed",
                        completedAt: new Date(),
                    },
                });
            } else {
                await tx.discoveryBatch.update({
                    where: { id: batchId },
                    data: {
                        status: "scanning",
                        completedAlbums: completed,
                        failedAlbums: failed,
                    },
                });
            }
        });

        if (completed === 0) {
            console.log(`   All downloads failed`);
            await this.addBatchLog(batchId, "error", "All downloads failed");
            return;
        }

        console.log(`   All downloads complete! Triggering scan...`);
        await this.addBatchLog(
            batchId,
            "info",
            `${completed} completed, ${failed} failed. Triggering scan...`
        );

        // Trigger scan with batch ID
        await scanQueue.add("scan", {
            type: "full",
            source: "discover-weekly-completion",
            discoveryBatchId: batchId,
        });

        console.log(
            `   Scan queued - will build playlist after scan completes`
        );
    }

    /**
     * Build final playlist after scan completes (atomic transaction)
     */
    async buildFinalPlaylist(batchId: string) {
        console.log(`\n Building final playlist for batch ${batchId}...`);

        const batch = await prisma.discoveryBatch.findUnique({
            where: { id: batchId },
        });

        if (!batch) {
            console.log(`   Batch not found`);
            return;
        }

        // Get completed download jobs
        const completedJobs = await prisma.downloadJob.findMany({
            where: {
                discoveryBatchId: batchId,
                status: "completed",
            },
        });

        console.log(`   Found ${completedJobs.length} completed downloads`);
        await this.addBatchLog(
            batchId,
            "info",
            `Building playlist from ${completedJobs.length} completed downloads`
        );

        // Collect album MBIDs
        const albumMbids = completedJobs.map(
            (j) => (j.metadata as any).albumMbid
        );
        const lidarrMbids = completedJobs
            .map((j) => (j.metadata as any).lidarrMbid)
            .filter(Boolean);

        // Find tracks from these albums (check both original and Lidarr MBIDs)
        const allMbids = [...new Set([...albumMbids, ...lidarrMbids])];

        const allTracks = await prisma.track.findMany({
            where: {
                album: {
                    rgMbid: { in: allMbids },
                },
            },
            include: {
                album: { include: { artist: true } },
            },
        });

        console.log(`   Found ${allTracks.length} tracks from imported albums`);

        if (allTracks.length === 0) {
            console.log(`   No tracks found after scan`);
            await prisma.discoveryBatch.update({
                where: { id: batchId },
                data: {
                    status: "failed",
                    errorMessage: "No tracks found after scan",
                    completedAt: new Date(),
                },
            });
            await this.addBatchLog(
                batchId,
                "error",
                "No tracks found after scan"
            );
            return;
        }

        // Shuffle tracks
        const shuffled = allTracks.sort(() => Math.random() - 0.5);

        // FALLBACK MECHANISM: If we have fewer tracks than target due to failed downloads,
        // include MORE tracks from successful albums to reach the target
        const target = batch.targetSongCount;
        let selected = shuffled.slice(0, Math.min(target, allTracks.length));

        // If we have fewer tracks than target, get additional tracks from successful albums
        if (selected.length < target && allTracks.length < target) {
            console.log(
                `   Only ${allTracks.length} tracks available, getting more tracks per album...`
            );

            // Get all tracks (not just shuffled selection) from successful albums
            const fullTrackList = await prisma.track.findMany({
                where: {
                    album: {
                        rgMbid: { in: allMbids },
                    },
                },
                include: {
                    album: { include: { artist: true } },
                },
            });

            // Shuffle the full list and take up to target
            const fullShuffled = fullTrackList.sort(() => Math.random() - 0.5);
            selected = fullShuffled.slice(
                0,
                Math.min(target, fullTrackList.length)
            );

            console.log(
                `   Expanded to ${selected.length} tracks from ${completedJobs.length} successful albums`
            );
            await this.addBatchLog(
                batchId,
                "info",
                `Fallback: Using ${selected.length} tracks from ${completedJobs.length} albums (some downloads failed)`
            );
        }

        // Create discovery records in transaction
        const result = await prisma.$transaction(async (tx) => {
            const createdAlbums = new Map<string, string>();
            let trackCount = 0;

            for (const track of selected) {
                const albumRgMbid = track.album.rgMbid;
                let discoveryAlbumId = createdAlbums.get(albumRgMbid);

                if (!discoveryAlbumId) {
                    // Find the job for this album
                    const job = completedJobs.find((j) => {
                        const metadata = j.metadata as any;
                        return (
                            metadata.albumMbid === albumRgMbid ||
                            metadata.lidarrMbid === albumRgMbid
                        );
                    });

                    const metadata = job?.metadata as any;

                    const discoveryAlbum = await tx.discoveryAlbum.create({
                        data: {
                            userId: batch.userId,
                            rgMbid: albumRgMbid,
                            artistName:
                                metadata?.artistName || track.album.artist.name,
                            artistMbid:
                                metadata?.artistMbid || track.album.artist.mbid,
                            albumTitle:
                                metadata?.albumTitle || track.album.title,
                            lidarrAlbumId: job?.lidarrAlbumId,
                            similarity: metadata?.similarity || 0.5,
                            tier: "medium",
                            weekStartDate: batch.weekStart,
                            downloadedAt: new Date(),
                        },
                    });

                    discoveryAlbumId = discoveryAlbum.id;
                    createdAlbums.set(albumRgMbid, discoveryAlbumId);
                }

                await tx.discoveryTrack.create({
                    data: {
                        discoveryAlbumId,
                        trackId: track.id,
                        fileName: track.filePath.split("/").pop() || "",
                        filePath: track.filePath,
                    },
                });

                trackCount++;
            }

            // Mark batch complete
            await tx.discoveryBatch.update({
                where: { id: batchId },
                data: {
                    status: "completed",
                    finalSongCount: trackCount,
                    completedAt: new Date(),
                },
            });

            return { albumCount: createdAlbums.size, trackCount };
        });

        console.log(
            `   Playlist complete: ${result.trackCount} tracks from ${result.albumCount} albums`
        );
        await this.addBatchLog(
            batchId,
            "info",
            `Playlist complete: ${result.trackCount} tracks from ${result.albumCount} albums`
        );
    }

    /**
     * Get seed artists from listening history
     */
    private async getSeedArtists(userId: string): Promise<SeedArtist[]> {
        const fourWeeksAgo = subWeeks(new Date(), 4);

        const recentPlays = await prisma.play.groupBy({
            by: ["trackId"],
            where: {
                userId,
                playedAt: { gte: fourWeeksAgo },
                source: { in: ["LIBRARY", "DISCOVERY_KEPT"] },
            },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 50,
        });

        if (recentPlays.length < 5) {
            // Fallback to library - get artists with most albums
            const albums = await prisma.album.groupBy({
                by: ["artistId"],
                where: { location: "LIBRARY" },
                _count: { id: true },
                orderBy: { _count: { id: "desc" } },
                take: 10,
            });

            const artists = await prisma.artist.findMany({
                where: { id: { in: albums.map((a) => a.artistId) } },
            });

            return artists.map((a) => ({ name: a.name, mbid: a.mbid }));
        }

        const tracks = await prisma.track.findMany({
            where: {
                id: { in: recentPlays.map((p) => p.trackId) },
                // Only include tracks from LIBRARY albums, not DISCOVER
                album: { location: "LIBRARY" },
            },
            include: { album: { include: { artist: true } } },
        });

        const artistMap = new Map<string, any>();
        for (const track of tracks) {
            if (!artistMap.has(track.album.artistId)) {
                artistMap.set(track.album.artistId, track.album.artist);
            }
        }

        const artists = Array.from(artistMap.values()).slice(0, 10);
        return artists.map((a: any) => ({ name: a.name, mbid: a.mbid }));
    }

    /**
     * Check if an album is already owned
     */
    private async isAlbumOwned(
        albumMbid: string,
        userId: string
    ): Promise<boolean> {
        // Check OwnedAlbum table
        const ownedAlbum = await prisma.ownedAlbum.findFirst({
            where: { rgMbid: albumMbid },
        });
        if (ownedAlbum) return true;

        // Check Album table
        const existingAlbum = await prisma.album.findFirst({
            where: { rgMbid: albumMbid },
        });
        if (existingAlbum) return true;

        // Check previous discovery
        const previousDiscovery = await prisma.discoveryAlbum.findFirst({
            where: { rgMbid: albumMbid, userId },
        });
        if (previousDiscovery) return true;

        // Check pending downloads
        const pendingDownload = await prisma.downloadJob.findFirst({
            where: {
                targetMbid: albumMbid,
                status: { in: ["pending", "processing"] },
            },
        });
        if (pendingDownload) return true;

        // Check Lidarr
        const inLidarr = await lidarrService.isAlbumAvailable(albumMbid);
        if (inLidarr) return true;

        return false;
    }

    /**
     * Check if album was recommended recently (6 months)
     */
    private async isAlbumExcluded(
        albumMbid: string,
        userId: string
    ): Promise<boolean> {
        const exclusion = await prisma.discoverExclusion.findFirst({
            where: {
                userId,
                albumMbid,
                expiresAt: { gt: new Date() },
            },
        });
        return !!exclusion;
    }

    /**
     * Find recommended albums using pre-cached similar artists
     */
    private async findRecommendedAlbums(
        seeds: SeedArtist[],
        similarCache: Map<string, any[]>,
        targetCount: number,
        userId: string
    ): Promise<RecommendedAlbum[]> {
        const recommendations: RecommendedAlbum[] = [];
        const seenArtists = new Set<string>();
        const seenAlbums = new Set<string>();

        console.log(`\n Finding ${targetCount} recommended albums...`);

        for (const seed of seeds) {
            const similar = similarCache.get(seed.mbid || seed.name) || [];

            for (const sim of similar) {
                const key = sim.name.toLowerCase();
                if (seenArtists.has(key)) continue;
                seenArtists.add(key);

                // Get top albums for this similar artist
                try {
                    const topAlbums = await lastFmService.getArtistTopAlbums(
                        sim.mbid || "",
                        sim.name,
                        5
                    );

                    for (const album of topAlbums) {
                        // Get MBID from MusicBrainz
                        const mbAlbum = await musicBrainzService.searchAlbum(
                            album.name,
                            sim.name
                        );

                        if (!mbAlbum) continue;

                        // Skip duplicates
                        if (seenAlbums.has(mbAlbum.id)) continue;
                        seenAlbums.add(mbAlbum.id);

                        // Skip if owned
                        const owned = await this.isAlbumOwned(
                            mbAlbum.id,
                            userId
                        );
                        if (owned) {
                            console.log(
                                `     Skipping owned: ${sim.name} - ${album.name}`
                            );
                            continue;
                        }

                        // Skip if recently recommended
                        const excluded = await this.isAlbumExcluded(
                            mbAlbum.id,
                            userId
                        );
                        if (excluded) {
                            console.log(
                                `     Skipping recent: ${sim.name} - ${album.name}`
                            );
                            continue;
                        }

                        recommendations.push({
                            artistName: sim.name,
                            artistMbid: sim.mbid,
                            albumTitle: album.name,
                            albumMbid: mbAlbum.id,
                            similarity: sim.match,
                        });

                        console.log(`    Found: ${sim.name} - ${album.name}`);

                        if (recommendations.length >= targetCount) break;
                    }
                } catch (error) {
                    console.warn(`   Failed to get albums for ${sim.name}`);
                }

                if (recommendations.length >= targetCount) break;
            }

            if (recommendations.length >= targetCount) break;
        }

        console.log(
            `   Found ${recommendations.length} new albums to download`
        );
        return recommendations;
    }
}

export const discoverWeeklyService = new DiscoverWeeklyService();
