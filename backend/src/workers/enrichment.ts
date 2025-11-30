import { prisma } from "../utils/db";
import { enrichSimilarArtist } from "./artistEnrichment";

let isEnriching = false;
let enrichmentInterval: NodeJS.Timeout | null = null;

/**
 * Background worker that continuously enriches pending artists
 * Processes 50 artists concurrently, runs every 5 seconds
 */
export async function startEnrichmentWorker() {
    console.log("Starting enrichment worker...");
    console.log("   - Concurrent artists: 50");
    console.log("   - Check interval: 5 seconds");

    // Run immediately on start
    await enrichNextBatch();

    // Then run every 5 seconds
    enrichmentInterval = setInterval(async () => {
        await enrichNextBatch();
    }, 5 * 1000); // 5 seconds
}

/**
 * Stop the enrichment worker
 */
export function stopEnrichmentWorker() {
    if (enrichmentInterval) {
        clearInterval(enrichmentInterval);
        enrichmentInterval = null;
        console.log(" Enrichment worker stopped");
    }
}

/**
 * Process the next batch of pending artists (50 concurrent)
 */
async function enrichNextBatch() {
    // Skip if already enriching
    if (isEnriching) {
        return;
    }

    try {
        isEnriching = true;

        // Find the next 50 pending or failed artists that have owned albums
        const artists = await prisma.artist.findMany({
            where: {
                OR: [
                    { enrichmentStatus: "pending" },
                    { enrichmentStatus: "failed" },
                ],
                // Only enrich artists that have owned albums
                ownedAlbums: {
                    some: {},
                },
            },
            orderBy: { name: "asc" },
            take: 50,
        });

        if (artists.length === 0) {
            // No more owned artists to enrich
            return;
        }

        console.log(
            `\n[Enrichment Worker] Processing batch of ${artists.length} owned artists...`
        );

        // Enrich all artists concurrently
        await Promise.allSettled(
            artists.map(async (artist) => {
                try {
                    console.log(`   → Starting: ${artist.name}`);
                    await enrichSimilarArtist(artist);
                    console.log(`   Completed: ${artist.name}`);
                } catch (error) {
                    console.error(`    Failed: ${artist.name}`, error);
                }
            })
        );

        // Log progress
        const progress = await getEnrichmentProgress();
        console.log(
            `\n[Enrichment Progress] ${progress.completed}/${progress.total} (${progress.progress}%)`
        );
        console.log(
            `   Pending: ${progress.pending} | Failed: ${progress.failed}\n`
        );
    } catch (error) {
        console.error(` [Enrichment Worker] Batch error:`, error);
    } finally {
        isEnriching = false;
    }
}

/**
 * Get enrichment progress statistics
 */
export async function getEnrichmentProgress() {
    const statusCounts = await prisma.artist.groupBy({
        by: ["enrichmentStatus"],
        _count: true,
    });

    const total = statusCounts.reduce((sum, s) => sum + s._count, 0);
    const completed =
        statusCounts.find((s) => s.enrichmentStatus === "completed")?._count ||
        0;
    const failed =
        statusCounts.find((s) => s.enrichmentStatus === "failed")?._count || 0;
    const enriching =
        statusCounts.find((s) => s.enrichmentStatus === "enriching")?._count ||
        0;
    const pending =
        statusCounts.find((s) => s.enrichmentStatus === "pending")?._count || 0;

    const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;

    return {
        total,
        completed,
        failed,
        enriching,
        pending,
        progress: Math.round(progress * 10) / 10,
        isComplete: pending === 0 && enriching === 0,
    };
}
