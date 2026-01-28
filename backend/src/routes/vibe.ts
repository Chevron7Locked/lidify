import { Router } from "express";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger";
import { prisma } from "../utils/db";
import { redisClient } from "../utils/redis";
import { requireAuth } from "../middleware/auth";

const router = Router();

interface SimilarTrackResult {
    id: string;
    title: string;
    duration: number;
    trackNo: number;
    distance: number;
    albumId: string;
    albumTitle: string;
    albumCoverUrl: string | null;
    artistId: string;
    artistName: string;
}

/**
 * GET /api/vibe/similar/:trackId
 * Find tracks similar to a given track using CLAP embeddings
 */
router.get("/similar/:trackId", requireAuth, async (req, res) => {
    try {
        const { trackId } = req.params;
        const limit = Math.min(
            Math.max(1, parseInt(req.query.limit as string) || 20),
            100
        );

        // Fetch source track embedding
        const embeddingResult = await prisma.$queryRaw<
            { embedding: number[] }[]
        >`
            SELECT embedding::float[] as embedding
            FROM track_embeddings
            WHERE track_id = ${trackId}
        `;

        if (!embeddingResult || embeddingResult.length === 0) {
            return res.status(404).json({
                error: "Track not analyzed yet",
                message: "This track has not been processed for vibe similarity",
            });
        }

        const sourceEmbedding = embeddingResult[0].embedding;

        // Query for similar tracks using pgvector cosine distance
        const similarTracks = await prisma.$queryRaw<SimilarTrackResult[]>`
            SELECT
                t.id,
                t.title,
                t.duration,
                t."trackNo",
                te.embedding <=> ${sourceEmbedding}::vector AS distance,
                a.id as "albumId",
                a.title as "albumTitle",
                a."coverUrl" as "albumCoverUrl",
                ar.id as "artistId",
                ar.name as "artistName"
            FROM track_embeddings te
            JOIN "Track" t ON te.track_id = t.id
            JOIN "Album" a ON t."albumId" = a.id
            JOIN "Artist" ar ON a."artistId" = ar.id
            WHERE te.track_id != ${trackId}
            ORDER BY te.embedding <=> ${sourceEmbedding}::vector
            LIMIT ${limit}
        `;

        const tracks = similarTracks.map((row) => ({
            id: row.id,
            title: row.title,
            duration: row.duration,
            trackNo: row.trackNo,
            distance: row.distance,
            album: {
                id: row.albumId,
                title: row.albumTitle,
                coverUrl: row.albumCoverUrl,
            },
            artist: {
                id: row.artistId,
                name: row.artistName,
            },
        }));

        res.json({
            sourceTrackId: trackId,
            tracks,
        });
    } catch (error: any) {
        logger.error("Vibe similar tracks error:", error);
        res.status(500).json({ error: "Failed to find similar tracks" });
    }
});

/**
 * POST /api/vibe/search
 * Search for tracks using natural language text via CLAP text embeddings
 */
router.post("/search", requireAuth, async (req, res) => {
    try {
        const { query, limit: requestedLimit } = req.body;

        if (!query || typeof query !== "string" || query.trim().length < 2) {
            return res.status(400).json({
                error: "Query must be at least 2 characters",
            });
        }

        const limit = Math.min(
            Math.max(1, requestedLimit || 20),
            100
        );

        const requestId = randomUUID();
        const responseChannel = `audio:text:embed:response:${requestId}`;
        const requestChannel = "audio:text:embed";

        // Create a duplicate client for subscribing (redis client cannot subscribe and publish on same connection)
        const subscriber = redisClient.duplicate();
        await subscriber.connect();

        try {
            // Set up response listener with timeout
            const embeddingPromise = new Promise<number[]>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Text embedding request timed out"));
                }, 30000);

                subscriber.subscribe(responseChannel, (message) => {
                    clearTimeout(timeout);
                    try {
                        const data = JSON.parse(message);
                        if (data.error) {
                            reject(new Error(data.error));
                        } else {
                            resolve(data.embedding);
                        }
                    } catch (e) {
                        reject(new Error("Invalid response from analyzer"));
                    }
                });
            });

            // Publish the text embedding request
            await redisClient.publish(
                requestChannel,
                JSON.stringify({ requestId, text: query.trim() })
            );

            // Wait for embedding response
            const textEmbedding = await embeddingPromise;

            // Query for similar tracks using the text embedding
            const similarTracks = await prisma.$queryRaw<SimilarTrackResult[]>`
                SELECT
                    t.id,
                    t.title,
                    t.duration,
                    t."trackNo",
                    te.embedding <=> ${textEmbedding}::vector AS distance,
                    a.id as "albumId",
                    a.title as "albumTitle",
                    a."coverUrl" as "albumCoverUrl",
                    ar.id as "artistId",
                    ar.name as "artistName"
                FROM track_embeddings te
                JOIN "Track" t ON te.track_id = t.id
                JOIN "Album" a ON t."albumId" = a.id
                JOIN "Artist" ar ON a."artistId" = ar.id
                ORDER BY te.embedding <=> ${textEmbedding}::vector
                LIMIT ${limit}
            `;

            const tracks = similarTracks.map((row) => ({
                id: row.id,
                title: row.title,
                duration: row.duration,
                trackNo: row.trackNo,
                distance: row.distance,
                album: {
                    id: row.albumId,
                    title: row.albumTitle,
                    coverUrl: row.albumCoverUrl,
                },
                artist: {
                    id: row.artistId,
                    name: row.artistName,
                },
            }));

            res.json({
                query: query.trim(),
                tracks,
            });
        } finally {
            await subscriber.unsubscribe(responseChannel);
            await subscriber.disconnect();
        }
    } catch (error: any) {
        logger.error("Vibe text search error:", error);
        if (error.message?.includes("timed out")) {
            return res.status(504).json({
                error: "Text embedding service unavailable",
                message: "The CLAP analyzer service did not respond in time",
            });
        }
        res.status(500).json({ error: "Failed to search tracks by vibe" });
    }
});

/**
 * GET /api/vibe/status
 * Get embedding analysis progress statistics
 */
router.get("/status", requireAuth, async (req, res) => {
    try {
        const totalTracks = await prisma.track.count();

        const embeddedTracks = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM track_embeddings
        `;

        const embeddedCount = Number(embeddedTracks[0]?.count || 0);
        const progress = totalTracks > 0
            ? Math.round((embeddedCount / totalTracks) * 100)
            : 0;

        res.json({
            totalTracks,
            embeddedTracks: embeddedCount,
            progress,
            isComplete: embeddedCount >= totalTracks && totalTracks > 0,
        });
    } catch (error: any) {
        logger.error("Vibe status error:", error);
        res.status(500).json({ error: "Failed to get embedding status" });
    }
});

export default router;
