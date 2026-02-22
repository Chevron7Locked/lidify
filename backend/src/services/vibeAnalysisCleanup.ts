import { prisma } from "../utils/db";
import { logger } from "../utils/logger";

const STALE_THRESHOLD_MINUTES = 30; // Longer than audio analysis due to CLAP processing time
export const VIBE_MAX_RETRIES = 3;

class VibeAnalysisCleanupService {
    /**
     * Clean up tracks stuck in "processing" state for vibe embeddings
     * Returns number of tracks reset
     */
    async cleanupStaleProcessing(): Promise<{ reset: number }> {
        const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

        // Find tracks stuck in processing
        const staleTracks = await prisma.track.findMany({
            where: {
                vibeAnalysisStatus: "processing",
                OR: [
                    { vibeAnalysisStatusUpdatedAt: { lt: cutoff } },
                    {
                        vibeAnalysisStatusUpdatedAt: null,
                        updatedAt: { lt: cutoff },
                    },
                ],
            },
            include: {
                album: {
                    include: {
                        artist: { select: { name: true } },
                    },
                },
            },
        });

        if (staleTracks.length === 0) {
            return { reset: 0 };
        }

        logger.debug(
            `[VibeAnalysisCleanup] Found ${staleTracks.length} stale vibe tracks (processing > ${STALE_THRESHOLD_MINUTES} min)`
        );

        let resetCount: number = 0;

        for (const track of staleTracks) {
            const trackName = `${track.album.artist.name} - ${track.title}`;
            const newRetryCount = (track.vibeAnalysisRetryCount ?? 0) + 1;

            if (newRetryCount > VIBE_MAX_RETRIES) {
                await prisma.track.update({
                    where: { id: track.id },
                    data: {
                        vibeAnalysisStatus: "failed",
                        vibeAnalysisError: `Exceeded ${VIBE_MAX_RETRIES} retry attempts`,
                        vibeAnalysisRetryCount: newRetryCount,
                        vibeAnalysisStatusUpdatedAt: new Date(),
                    },
                });
                logger.warn(`[VibeAnalysisCleanup] Permanently failed after ${VIBE_MAX_RETRIES} retries: ${trackName}`);
            } else {
                await prisma.track.update({
                    where: { id: track.id },
                    data: {
                        vibeAnalysisStatus: null,
                        vibeAnalysisRetryCount: newRetryCount,
                        vibeAnalysisStatusUpdatedAt: null,
                    },
                });
                logger.debug(`[VibeAnalysisCleanup] Reset for retry (${newRetryCount}/${VIBE_MAX_RETRIES}): ${trackName}`);
            }
            resetCount++;
        }

        return { reset: resetCount };
    }

    /**
     * Clean up tracks where vibeAnalysisStatus='completed' but no embedding exists
     * This fixes CLAP embedding stalls where tracks appear complete but have no embedding
     */
    async cleanupOrphanedCompleted(options?: {
        dryRun?: boolean;
        batchSize?: number;
        offset?: number;
    }): Promise<{ reset: number; skipped: number; totalOrphaned: number }> {
        const batchSize = options?.batchSize ?? 100;
        const offset = options?.offset ?? 0;
        const dryRun = options?.dryRun ?? false;

        const RECENT_THRESHOLD_MS = 5 * 60 * 1000;
        const recentCutoff = new Date(Date.now() - RECENT_THRESHOLD_MS);

        try {
            const orphanedTracks = await prisma.$queryRaw<{ id: string }[]>`
                SELECT t.id 
                FROM "Track" t
                LEFT JOIN "track_embeddings" te ON t.id = te.track_id
                WHERE t."vibeAnalysisStatus" = 'completed'
                  AND te.track_id IS NULL
                  AND t."vibeAnalysisStatusUpdatedAt" < ${recentCutoff}
                LIMIT ${batchSize} OFFSET ${offset}
            `;

            const totalOrphaned = orphanedTracks.length;

            if (totalOrphaned === 0) {
                return { reset: 0, skipped: 0, totalOrphaned: 0 };
            }

            logger.info(
                `[VibeAnalysisCleanup] Found ${totalOrphaned} orphaned completed tracks (batchSize=${batchSize}, offset=${offset}, dryRun=${dryRun})`
            );

            if (dryRun) {
                return { reset: 0, skipped: totalOrphaned, totalOrphaned };
            }

            let resetCount = 0;

            await prisma.$transaction(async (tx) => {
                const result = await tx.track.updateMany({
                    where: {
                        id: { in: orphanedTracks.map(t => t.id) },
                    },
                    data: {
                        vibeAnalysisStatus: null,
                        vibeAnalysisRetryCount: { increment: 1 },
                        vibeAnalysisStatusUpdatedAt: null,
                        vibeAnalysisError: "Orphaned: completed but no embedding found",
                    },
                });
                resetCount = result.count;
            });

            logger.info(`[VibeAnalysisCleanup] Reset ${resetCount} orphaned completed tracks`);

            return { reset: resetCount, skipped: 0, totalOrphaned };
        } catch (error) {
            logger.error(`[VibeAnalysisCleanup] Error cleaning up orphaned completed: ${error}`);
            return { reset: 0, skipped: 0, totalOrphaned: 0 };
        }
    }
}

export const vibeAnalysisCleanupService = new VibeAnalysisCleanupService();
