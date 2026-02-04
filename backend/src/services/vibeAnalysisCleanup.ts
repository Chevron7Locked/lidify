import { prisma } from "../utils/db";
import { logger } from "../utils/logger";
import { enrichmentFailureService } from "./enrichmentFailureService";

const STALE_THRESHOLD_MINUTES = 30; // Longer than audio analysis due to CLAP processing time

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

            // Reset to null (pending state)
            await prisma.track.update({
                where: { id: track.id },
                data: {
                    vibeAnalysisStatus: null,
                    vibeAnalysisStatusUpdatedAt: null,
                },
            });

            logger.debug(
                `[VibeAnalysisCleanup] Reset for retry: ${trackName}`
            );
            resetCount++;
        }

        return { reset: resetCount };
    }
}

export const vibeAnalysisCleanupService = new VibeAnalysisCleanupService();
