import { Router } from "express";
import { audiobookshelfService } from "../services/audiobookshelf";
import { audiobookCacheService } from "../services/audiobookCache";
import { prisma } from "../utils/db";
import { requireAuthOrToken } from "../middleware/auth";
import { imageLimiter, apiLimiter } from "../middleware/rateLimiter";

const router = Router();

/**
 * GET /audiobooks/continue-listening
 * Get audiobooks the user is currently listening to (for "Continue Listening" section)
 * NOTE: This must come BEFORE the /:id route to avoid matching "continue-listening" as an ID
 */
router.get(
    "/continue-listening",
    requireAuthOrToken,
    apiLimiter,
    async (req, res) => {
        try {
            // Check if Audiobookshelf is enabled
            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();

            if (!settings?.audiobookshelfEnabled) {
                return res.status(200).json([]);
            }

            const recentProgress = await prisma.audiobookProgress.findMany({
                where: {
                    userId: req.user!.id,
                    isFinished: false,
                    currentTime: {
                        gt: 0,
                    },
                },
                orderBy: {
                    lastPlayedAt: "desc",
                },
                take: 10,
            });

            // Transform the cover URLs to use the audiobook__ prefix for the proxy
            const transformed = recentProgress.map((progress: any) => {
                const coverUrl =
                    progress.coverUrl && !progress.coverUrl.startsWith("http")
                        ? `audiobook__${progress.coverUrl}`
                        : progress.coverUrl;

                return {
                    ...progress,
                    coverUrl,
                };
            });

            res.json(transformed);
        } catch (error: any) {
            console.error("Error fetching continue listening:", error);
            res.status(500).json({
                error: "Failed to fetch continue listening",
                message: error.message,
            });
        }
    }
);

/**
 * POST /audiobooks/sync
 * Manually trigger audiobook sync from Audiobookshelf
 * Fetches all audiobooks and caches metadata + cover images locally
 */
router.post("/sync", requireAuthOrToken, apiLimiter, async (req, res) => {
    try {
        const { getSystemSettings } = await import("../utils/systemSettings");
        const settings = await getSystemSettings();

        if (!settings?.audiobookshelfEnabled) {
            return res
                .status(400)
                .json({ error: "Audiobookshelf not enabled" });
        }

        console.log(" Starting manual audiobook sync...");
        const result = await audiobookCacheService.syncAll();

        res.json({
            success: true,
            result,
        });
    } catch (error: any) {
        console.error("Audiobook sync failed:", error);
        res.status(500).json({
            error: "Sync failed",
            message: error.message,
        });
    }
});

/**
 * GET /audiobooks/search
 * Search audiobooks
 */
router.get("/search", requireAuthOrToken, apiLimiter, async (req, res) => {
    try {
        // Check if Audiobookshelf is enabled
        const { getSystemSettings } = await import("../utils/systemSettings");
        const settings = await getSystemSettings();

        if (!settings?.audiobookshelfEnabled) {
            return res.status(200).json([]);
        }

        const { q } = req.query;

        if (!q || typeof q !== "string") {
            return res.status(400).json({ error: "Query parameter required" });
        }

        const results = await audiobookshelfService.searchAudiobooks(q);
        res.json(results);
    } catch (error: any) {
        console.error("Error searching audiobooks:", error);
        res.status(500).json({
            error: "Failed to search audiobooks",
            message: error.message,
        });
    }
});

/**
 * GET /audiobooks
 * Get all audiobooks from cached database (instant, no API calls)
 */
router.get("/", requireAuthOrToken, apiLimiter, async (req, res) => {
    try {
        // Check if Audiobookshelf is enabled first
        const { getSystemSettings } = await import("../utils/systemSettings");
        const settings = await getSystemSettings();

        if (!settings?.audiobookshelfEnabled) {
            return res.status(200).json({
                configured: false,
                enabled: false,
                audiobooks: [],
            });
        }

        // Read from cached database instead of hitting Audiobookshelf API
        const audiobooks = await prisma.audiobook.findMany({
            orderBy: { title: "asc" },
        });

        const audiobookIds = audiobooks.map((book) => book.id);
        const progressEntries =
            audiobookIds.length > 0
                ? await prisma.audiobookProgress.findMany({
                      where: {
                          userId: req.user!.id,
                          audiobookshelfId: { in: audiobookIds },
                      },
                  })
                : [];
        const progressMap = new Map(
            progressEntries.map((entry) => [entry.audiobookshelfId, entry])
        );

        // Get user's progress for each audiobook
        const audiobooksWithProgress = audiobooks.map((book) => {
            const progress = progressMap.get(book.id);

            return {
                id: book.id,
                title: book.title,
                author: book.author || "Unknown Author",
                narrator: book.narrator,
                description: book.description,
                coverUrl: book.localCoverPath
                    ? `/audiobooks/${book.id}/cover` // Serve from local disk
                    : null,
                duration: book.duration || 0,
                libraryId: book.libraryId,
                series: book.series
                    ? {
                          name: book.series,
                          sequence: book.seriesSequence || "1",
                      }
                    : null,
                genres: book.genres || [],
                progress: progress
                    ? {
                          currentTime: progress.currentTime,
                          progress:
                              progress.duration > 0
                                  ? (progress.currentTime / progress.duration) *
                                    100
                                  : 0,
                          isFinished: progress.isFinished,
                          lastPlayedAt: progress.lastPlayedAt,
                      }
                    : null,
            };
        });

        res.json(audiobooksWithProgress);
    } catch (error: any) {
        console.error("Error fetching audiobooks:", error);
        res.status(500).json({
            error: "Failed to fetch audiobooks",
            message: error.message,
        });
    }
});

/**
 * GET /audiobooks/series/:seriesName
 * Get all books in a series (from cached database)
 */
router.get(
    "/series/:seriesName",
    requireAuthOrToken,
    apiLimiter,
    async (req, res) => {
        try {
            // Check if Audiobookshelf is enabled
            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();

            if (!settings?.audiobookshelfEnabled) {
                return res.status(200).json([]);
            }

            const { seriesName } = req.params;
            const decodedSeriesName = decodeURIComponent(seriesName);

            // Read from cached database
            const audiobooks = await prisma.audiobook.findMany({
                where: {
                    series: decodedSeriesName,
                },
                orderBy: {
                    seriesSequence: "asc",
                },
            });

            const seriesIds = audiobooks.map((book) => book.id);
            const seriesProgressEntries =
                seriesIds.length > 0
                    ? await prisma.audiobookProgress.findMany({
                          where: {
                              userId: req.user!.id,
                              audiobookshelfId: { in: seriesIds },
                          },
                      })
                    : [];
            const seriesProgressMap = new Map(
                seriesProgressEntries.map((entry) => [
                    entry.audiobookshelfId,
                    entry,
                ])
            );

            const seriesBooks = audiobooks.map((book) => {
                const progress = seriesProgressMap.get(book.id);

                return {
                    id: book.id,
                    title: book.title,
                    author: book.author || "Unknown Author",
                    narrator: book.narrator,
                    description: book.description,
                    coverUrl: book.localCoverPath
                        ? `/audiobooks/${book.id}/cover`
                        : null,
                    duration: book.duration || 0,
                    libraryId: book.libraryId,
                    series: book.series
                        ? {
                              name: book.series,
                              sequence: book.seriesSequence || "1",
                          }
                        : null,
                    genres: book.genres || [],
                    progress: progress
                        ? {
                              currentTime: progress.currentTime,
                              progress:
                                  progress.duration > 0
                                      ? (progress.currentTime /
                                            progress.duration) *
                                        100
                                      : 0,
                              isFinished: progress.isFinished,
                              lastPlayedAt: progress.lastPlayedAt,
                          }
                        : null,
                };
            });

            res.json(seriesBooks);
        } catch (error: any) {
            console.error("Error fetching series:", error);
            res.status(500).json({
                error: "Failed to fetch series",
                message: error.message,
            });
        }
    }
);

/**
 * OPTIONS /audiobooks/:id/cover
 * Handle CORS preflight request for cover images
 */
router.options("/:id/cover", (req, res) => {
    const origin = req.headers.origin || "http://localhost:3030";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
    res.status(204).end();
});

/**
 * GET /audiobooks/:id/cover
 * Serve cached cover image from local disk (instant, no proxying)
 * NO RATE LIMITING - These are static files served from disk with aggressive caching
 */
router.get("/:id/cover", async (req, res) => {
    try {
        const { id } = req.params;

        const audiobook = await prisma.audiobook.findUnique({
            where: { id },
            select: { localCoverPath: true },
        });

        if (!audiobook?.localCoverPath) {
            return res.status(404).json({ error: "Cover not found" });
        }

        // Serve image from local disk with aggressive caching and CORS headers
        // Use specific origin instead of * to support credentials mode
        const origin = req.headers.origin || "http://localhost:3030";
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.sendFile(audiobook.localCoverPath);
    } catch (error: any) {
        console.error("Error serving cover:", error);
        res.status(500).json({
            error: "Failed to serve cover",
            message: error.message,
        });
    }
});

/**
 * GET /audiobooks/:id
 * Get a specific audiobook with full details (from cache, fallback to API)
 */
router.get("/:id", requireAuthOrToken, apiLimiter, async (req, res) => {
    try {
        // Check if Audiobookshelf is enabled
        const { getSystemSettings } = await import("../utils/systemSettings");
        const settings = await getSystemSettings();

        if (!settings?.audiobookshelfEnabled) {
            return res.status(200).json({ configured: false, enabled: false });
        }

        const { id } = req.params;

        // Try to get from cache first
        let audiobook = await prisma.audiobook.findUnique({
            where: { id },
        });

        // If not cached or stale, fetch from API and cache it
        if (
            !audiobook ||
            audiobook.lastSyncedAt <
                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ) {
            console.log(`📚 Audiobook ${id} not cached or stale, fetching...`);
            audiobook = await audiobookCacheService.getAudiobook(id);
        }

        // Get chapters and audio files from API (these change less frequently)
        let absBook;
        try {
            absBook = await audiobookshelfService.getAudiobook(id);
        } catch (apiError: any) {
            console.warn(
                `  Failed to fetch live data from Audiobookshelf for ${id}, using cached data only:`,
                apiError.message
            );
            // Continue with cached data only if API call fails
            absBook = { media: { chapters: [], audioFiles: [] } };
        }

        // Get user's progress
        const progress = await prisma.audiobookProgress.findUnique({
            where: {
                userId_audiobookshelfId: {
                    userId: req.user!.id,
                    audiobookshelfId: id,
                },
            },
        });

        const response = {
            id: audiobook.id,
            title: audiobook.title,
            author: audiobook.author || "Unknown Author",
            narrator: audiobook.narrator,
            description: audiobook.description,
            coverUrl: audiobook.localCoverPath
                ? `/audiobooks/${audiobook.id}/cover`
                : null,
            duration: audiobook.duration || 0,
            chapters: absBook.media?.chapters || [],
            audioFiles: absBook.media?.audioFiles || [],
            libraryId: audiobook.libraryId,
            progress: progress
                ? {
                      currentTime: progress.currentTime,
                      progress:
                          progress.duration > 0
                              ? (progress.currentTime / progress.duration) * 100
                              : 0,
                      isFinished: progress.isFinished,
                      lastPlayedAt: progress.lastPlayedAt,
                  }
                : null,
        };

        res.json(response);
    } catch (error: any) {
        console.error("Error fetching audiobook__", error);
        res.status(500).json({
            error: "Failed to fetch audiobook",
            message: error.message,
        });
    }
});

/**
 * GET /audiobooks/:id/stream
 * Proxy the audiobook stream with authentication
 */
router.get("/:id/stream", requireAuthOrToken, apiLimiter, async (req, res) => {
    try {
        console.log(`[Audiobook Stream] Request for audiobook: ${req.params.id}`);
        console.log(`[Audiobook Stream] User: ${req.user?.id || 'unknown'}`);
        
        // Check if Audiobookshelf is enabled
        const { getSystemSettings } = await import("../utils/systemSettings");
        const settings = await getSystemSettings();

        if (!settings?.audiobookshelfEnabled) {
            console.log("[Audiobook Stream] Audiobookshelf not enabled");
            return res
                .status(503)
                .json({ error: "Audiobookshelf is not configured" });
        }

        const { id } = req.params;
        const rangeHeader = req.headers.range as string | undefined;
        
        console.log(`[Audiobook Stream] Fetching stream for ${id}, range: ${rangeHeader || 'none'}`);

        const { stream, headers, status } =
            await audiobookshelfService.streamAudiobook(id, rangeHeader);

        console.log(`[Audiobook Stream] Got stream, status: ${status}, content-type: ${headers["content-type"]}`);

        const responseStatus = status || (rangeHeader ? 206 : 200);
        res.status(responseStatus);

        // Set content type - ensure it's audio
        const contentType = headers["content-type"] || "audio/mpeg";
        res.setHeader("Content-Type", contentType);
        
        // Set other headers
        if (headers["content-length"]) {
            res.setHeader("Content-Length", headers["content-length"]);
        }
        if (headers["accept-ranges"]) {
            res.setHeader("Accept-Ranges", headers["accept-ranges"]);
        } else {
            res.setHeader("Accept-Ranges", "bytes");
        }
        if (headers["content-range"]) {
            res.setHeader("Content-Range", headers["content-range"]);
        }

        res.setHeader("Cache-Control", "public, max-age=0");

        stream.pipe(res);

        stream.on("error", (error: any) => {
            console.error("[Audiobook Stream] Stream error:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: "Failed to stream audiobook",
                    message: error.message,
                });
            } else {
                res.end();
            }
        });
    } catch (error: any) {
        console.error("[Audiobook Stream] Error:", error.message);
        res.status(500).json({
            error: "Failed to stream audiobook",
            message: error.message,
        });
    }
});

/**
 * POST /audiobooks/:id/progress
 * Update playback progress for an audiobook
 */
router.post(
    "/:id/progress",
    requireAuthOrToken,
    apiLimiter,
    async (req, res) => {
        try {
            // Check if Audiobookshelf is enabled
            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();

            if (!settings?.audiobookshelfEnabled) {
                return res.status(200).json({
                    success: false,
                    message: "Audiobookshelf is not configured",
                });
            }

            const { id } = req.params;
            const {
                currentTime: rawCurrentTime,
                duration: rawDuration,
                isFinished,
            } = req.body;

            const currentTime =
                typeof rawCurrentTime === "number" &&
                Number.isFinite(rawCurrentTime)
                    ? Math.max(0, rawCurrentTime)
                    : 0;
            const durationValue =
                typeof rawDuration === "number" && Number.isFinite(rawDuration)
                    ? Math.max(rawDuration, 0)
                    : 0;

            console.log(`\n [AUDIOBOOK PROGRESS] Received update:`);
            console.log(`   User: ${req.user!.username}`);
            console.log(`   Audiobook ID: ${id}`);
            console.log(
                `   Current Time: ${currentTime}s (${Math.floor(
                    currentTime / 60
                )} mins)`
            );
            console.log(
                `   Duration: ${durationValue}s (${Math.floor(
                    durationValue / 60
                )} mins)`
            );
            if (durationValue > 0) {
                console.log(
                    `   Progress: ${(
                        (currentTime / durationValue) *
                        100
                    ).toFixed(1)}%`
                );
            } else {
                console.log("   Progress: duration unknown");
            }
            console.log(`   Finished: ${!!isFinished}`);

            // Pull cached metadata to avoid hitting Audiobookshelf for every update
            const [cachedAudiobook, existingProgress] = await Promise.all([
                prisma.audiobook.findUnique({
                    where: { id },
                    select: {
                        title: true,
                        author: true,
                        coverUrl: true,
                        duration: true,
                        libraryId: true,
                        localCoverPath: true,
                    },
                }),
                prisma.audiobookProgress.findUnique({
                    where: {
                        userId_audiobookshelfId: {
                            userId: req.user!.id,
                            audiobookshelfId: id,
                        },
                    },
                }),
            ]);

            const fallbackDuration =
                durationValue ||
                cachedAudiobook?.duration ||
                existingProgress?.duration ||
                0;

            const metadataTitle =
                cachedAudiobook?.title ||
                existingProgress?.title ||
                "Unknown Title";
            const metadataAuthor =
                cachedAudiobook?.author ||
                existingProgress?.author ||
                "Unknown Author";
            const metadataCover =
                cachedAudiobook?.coverUrl || existingProgress?.coverUrl || null;

            // Update progress in our database
            const progress = await prisma.audiobookProgress.upsert({
                where: {
                    userId_audiobookshelfId: {
                        userId: req.user!.id,
                        audiobookshelfId: id,
                    },
                },
                create: {
                    userId: req.user!.id,
                    audiobookshelfId: id,
                    title: metadataTitle,
                    author: metadataAuthor,
                    coverUrl: metadataCover,
                    currentTime,
                    duration: fallbackDuration,
                    isFinished: !!isFinished,
                    lastPlayedAt: new Date(),
                },
                update: {
                    title: metadataTitle,
                    author: metadataAuthor,
                    coverUrl: metadataCover,
                    currentTime,
                    duration: fallbackDuration,
                    isFinished: !!isFinished,
                    lastPlayedAt: new Date(),
                },
            });

            console.log(`   Progress saved to database`);

            // Also update progress in Audiobookshelf
            try {
                await audiobookshelfService.updateProgress(
                    id,
                    currentTime,
                    fallbackDuration,
                    isFinished
                );
                console.log(`   Progress synced to Audiobookshelf`);
            } catch (error) {
                console.error(
                    "Failed to sync progress to Audiobookshelf:",
                    error
                );
                // Continue anyway - local progress is saved
            }

            res.json({
                success: true,
                progress: {
                    currentTime: progress.currentTime,
                    progress:
                        progress.duration > 0
                            ? (progress.currentTime / progress.duration) * 100
                            : 0,
                    isFinished: progress.isFinished,
                },
            });
        } catch (error: any) {
            console.error("Error updating progress:", error);
            res.status(500).json({
                error: "Failed to update progress",
                message: error.message,
            });
        }
    }
);

/**
 * DELETE /audiobooks/:id/progress
 * Remove/reset progress for an audiobook
 */
router.delete(
    "/:id/progress",
    requireAuthOrToken,
    apiLimiter,
    async (req, res) => {
        try {
            // Check if Audiobookshelf is enabled
            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();

            if (!settings?.audiobookshelfEnabled) {
                return res.status(200).json({
                    success: false,
                    message: "Audiobookshelf is not configured",
                });
            }

            const { id } = req.params;

            console.log(`\n[AUDIOBOOK PROGRESS] Removing progress:`);
            console.log(`   User: ${req.user!.username}`);
            console.log(`   Audiobook ID: ${id}`);

            // Delete progress from our database
            await prisma.audiobookProgress.deleteMany({
                where: {
                    userId: req.user!.id,
                    audiobookshelfId: id,
                },
            });

            console.log(`   Progress removed from database`);

            // Also remove progress from Audiobookshelf
            try {
                await audiobookshelfService.updateProgress(id, 0, 0, false);
                console.log(`   Progress reset in Audiobookshelf`);
            } catch (error) {
                console.error(
                    "Failed to reset progress in Audiobookshelf:",
                    error
                );
                // Continue anyway - local progress is deleted
            }

            res.json({
                success: true,
                message: "Progress removed",
            });
        } catch (error: any) {
            console.error("Error removing progress:", error);
            res.status(500).json({
                error: "Failed to remove progress",
                message: error.message,
            });
        }
    }
);

export default router;
