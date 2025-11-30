import { Job } from "bull";
import { MusicScannerService } from "../../services/musicScanner";
import { config } from "../../config";
import * as path from "path";

export interface ScanJobData {
    userId: string;
    musicPath?: string; // Optional: use custom path or default from config
    albumMbid?: string; // Optional: if scan triggered by download completion
    artistMbid?: string; // Optional: if scan triggered by download completion
    source?: string; // Optional: source of scan (e.g., "lidarr-webhook", "discover-weekly-completion")
    downloadId?: string; // Optional: Lidarr download ID for precise job linking
    discoveryBatchId?: string; // Optional: Discovery Weekly batch ID
}

export interface ScanJobResult {
    tracksAdded: number;
    tracksUpdated: number;
    tracksRemoved: number;
    errors: Array<{ file: string; error: string }>;
    duration: number;
}

export async function processScan(
    job: Job<ScanJobData>
): Promise<ScanJobResult> {
    const {
        userId,
        musicPath,
        albumMbid,
        artistMbid,
        source,
        downloadId,
        discoveryBatchId,
    } = job.data;

    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`[ScanJob ${job.id}] Starting library scan for user ${userId}`);
    if (source) {
        console.log(`[ScanJob ${job.id}] Scan source: ${source}`);
    }
    if (albumMbid) {
        console.log(`[ScanJob ${job.id}] Album MBID: ${albumMbid}`);
    }
    if (artistMbid) {
        console.log(`[ScanJob ${job.id}] Artist MBID: ${artistMbid}`);
    }
    console.log(`═══════════════════════════════════════════════`);

    // Report progress
    await job.progress(0);

    // Prepare cover cache path (store alongside transcode cache)
    const coverCachePath = path.join(
        config.music.transcodeCachePath,
        "../covers"
    );

    // Create scanner with progress callback and cover cache path
    const scanner = new MusicScannerService((progress) => {
        // Calculate percentage (filesScanned / filesTotal * 100)
        const percent = Math.floor(
            (progress.filesScanned / progress.filesTotal) * 100
        );
        job.progress(percent).catch((err) =>
            console.error(`Failed to update job progress:`, err)
        );
    }, coverCachePath);

    // Use provided music path or fall back to config
    const scanPath = musicPath || config.music.musicPath;

    console.log(`[ScanJob ${job.id}] Scanning path: ${scanPath}`);

    try {
        const result = await scanner.scanLibrary(scanPath);

        await job.progress(100);

        console.log(
            `[ScanJob ${job.id}] Scan complete: +${result.tracksAdded} ~${result.tracksUpdated} -${result.tracksRemoved}`
        );

        // If this scan was triggered by a download completion, mark download jobs as completed
        if (
            source === "lidarr-webhook" &&
            (albumMbid || artistMbid || downloadId)
        ) {
            console.log(
                `[ScanJob ${job.id}] Marking download jobs as completed after successful scan`
            );
            const { prisma } = await import("../../utils/db");

            if (artistMbid) {
                await prisma.downloadJob.updateMany({
                    where: {
                        targetMbid: artistMbid,
                        type: "artist",
                        status: { in: ["pending", "processing"] },
                    },
                    data: {
                        status: "completed",
                        completedAt: new Date(),
                    },
                });
                console.log(
                    `[ScanJob ${job.id}] Marked artist download as completed: ${artistMbid}`
                );

                // Trigger enrichment for the newly imported artist
                try {
                    const artist = await prisma.artist.findUnique({
                        where: { mbid: artistMbid },
                    });
                    if (artist && artist.enrichmentStatus === "pending") {
                        console.log(
                            `[ScanJob ${job.id}] Triggering enrichment for artist: ${artist.name}`
                        );
                        const { enrichSimilarArtist } = await import(
                            "../artistEnrichment"
                        );
                        // Run enrichment in background (don't await)
                        enrichSimilarArtist(artist).catch((err) => {
                            console.error(
                                `[ScanJob ${job.id}]  Enrichment failed for ${artist.name}:`,
                                err
                            );
                        });
                    }
                } catch (error) {
                    console.error(
                        `[ScanJob ${job.id}]   Failed to trigger enrichment:`,
                        error
                    );
                }
            }

            if (albumMbid) {
                const updatedByMbid = await prisma.downloadJob.updateMany({
                    where: {
                        targetMbid: albumMbid,
                        type: "album",
                        status: { in: ["pending", "processing"] },
                    },
                    data: {
                        status: "completed",
                        completedAt: new Date(),
                    },
                });

                if (updatedByMbid.count > 0) {
                    console.log(
                        `[ScanJob ${job.id}] Marked ${updatedByMbid.count} album download(s) as completed by MBID: ${albumMbid}`
                    );
                } else {
                    // Fallback: Try to find the album by artist+title and match download jobs
                    console.log(
                        `[ScanJob ${job.id}] No downloads matched by MBID, trying artist+title match...`
                    );

                    const album = await prisma.album.findFirst({
                        where: { rgMbid: albumMbid },
                        include: { artist: true },
                    });

                    if (album) {
                        const updatedByName =
                            await prisma.downloadJob.updateMany({
                                where: {
                                    type: "album",
                                    status: { in: ["pending", "processing"] },
                                    metadata: {
                                        path: ["albumTitle"],
                                        equals: album.title,
                                    },
                                },
                                data: {
                                    status: "completed",
                                    completedAt: new Date(),
                                },
                            });

                        if (updatedByName.count > 0) {
                            console.log(
                                `[ScanJob ${job.id}] Marked ${updatedByName.count} album download(s) as completed by title match: ${album.artist.name} - ${album.title}`
                            );
                        } else {
                            console.log(
                                `[ScanJob ${job.id}]   No pending downloads found for: ${album.artist.name} - ${album.title}`
                            );
                        }
                    }
                }

                // Trigger enrichment for the artist of the newly imported album
                try {
                    const album = await prisma.album.findFirst({
                        where: { rgMbid: albumMbid },
                        include: { artist: true },
                    });
                    if (
                        album?.artist &&
                        album.artist.enrichmentStatus === "pending"
                    ) {
                        console.log(
                            `[ScanJob ${job.id}] Triggering enrichment for artist: ${album.artist.name}`
                        );
                        const { enrichSimilarArtist } = await import(
                            "../artistEnrichment"
                        );
                        // Run enrichment in background (don't await)
                        enrichSimilarArtist(album.artist).catch((err) => {
                            console.error(
                                `[ScanJob ${job.id}]  Enrichment failed for ${album.artist.name}:`,
                                err
                            );
                        });
                    }
                } catch (error) {
                    console.error(
                        `[ScanJob ${job.id}]   Failed to trigger enrichment:`,
                        error
                    );
                }
            }

            if (downloadId) {
                const updated = await prisma.downloadJob.updateMany({
                    where: {
                        lidarrRef: downloadId,
                        status: { in: ["pending", "processing"] },
                    },
                    data: {
                        status: "completed",
                        completedAt: new Date(),
                    },
                });
                if (updated.count > 0) {
                    console.log(
                        `[ScanJob ${job.id}] Linked Lidarr download ${downloadId} to ${updated.count} job(s)`
                    );
                } else {
                    console.log(
                        `[ScanJob ${job.id}]   No download jobs found for Lidarr ID ${downloadId}`
                    );
                }
            }
        }

        // If this scan was for Discovery Weekly, build the final playlist
        if (source === "discover-weekly-completion" && discoveryBatchId) {
            console.log(
                `[ScanJob ${job.id}]  Building Discovery Weekly playlist for batch ${discoveryBatchId}...`
            );
            try {
                const { discoverWeeklyService } = await import(
                    "../../services/discoverWeekly"
                );
                await discoverWeeklyService.buildFinalPlaylist(
                    discoveryBatchId
                );
                console.log(
                    `[ScanJob ${job.id}] Discovery Weekly playlist complete!`
                );
            } catch (error: any) {
                console.error(
                    `[ScanJob ${job.id}]  Failed to build Discovery playlist:`,
                    error.message
                );
            }
        }

        return result;
    } catch (error: any) {
        console.error(`[ScanJob ${job.id}] Scan failed:`, error);
        throw error;
    }
}
