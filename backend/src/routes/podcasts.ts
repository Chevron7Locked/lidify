import { Router } from "express";
import { requireAuth, requireAuthOrToken } from "../middleware/auth";
import { prisma } from "../utils/db";
import { rssParserService } from "../services/rss-parser";
import { podcastCacheService } from "../services/podcastCache";
import axios from "axios";
import fs from "fs";

const router = Router();

/**
 * POST /podcasts/sync-covers
 * Manually trigger podcast cover caching
 * Downloads and caches all podcast/episode covers locally
 */
router.post("/sync-covers", requireAuth, async (req, res) => {
    try {
        console.log(" Starting podcast cover sync...");

        const podcastResult = await podcastCacheService.syncAllCovers();
        const episodeResult = await podcastCacheService.syncEpisodeCovers();

        res.json({
            success: true,
            podcasts: podcastResult,
            episodes: episodeResult,
        });
    } catch (error: any) {
        console.error("Podcast cover sync failed:", error);
        res.status(500).json({
            error: "Sync failed",
            message: error.message,
        });
    }
});

router.use(requireAuthOrToken);

/**
 * GET /podcasts
 * Get all podcasts the user is subscribed to
 */
router.get("/", async (req, res) => {
    try {
        const subscriptions = await prisma.podcastSubscription.findMany({
            where: { userId: req.user!.id },
            include: {
                podcast: {
                    include: {
                        episodes: {
                            orderBy: { publishedAt: "desc" },
                            take: 5, // Get latest 5 episodes per podcast
                            include: {
                                progress: {
                                    where: { userId: req.user!.id },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { subscribedAt: "desc" },
        });

        const podcasts = subscriptions.map((sub) => {
            const podcast = sub.podcast;
            return {
                id: podcast.id,
                title: podcast.title,
                author: podcast.author,
                description: podcast.description,
                coverUrl: podcast.localCoverPath
                    ? `/podcasts/${podcast.id}/cover`
                    : podcast.imageUrl, // Fallback to original URL if not cached
                episodeCount: podcast.episodeCount,
                autoDownloadEpisodes: false, // Per-podcast auto-download not yet implemented
                episodes: podcast.episodes.map((ep) => ({
                    id: ep.id,
                    title: ep.title,
                    description: ep.description,
                    duration: ep.duration,
                    publishedAt: ep.publishedAt,
                    coverUrl: ep.localCoverPath
                        ? `/podcasts/episodes/${ep.id}/cover`
                        : ep.imageUrl, // Fallback to original URL
                    progress: ep.progress[0]
                        ? {
                              currentTime: ep.progress[0].currentTime,
                              progress:
                                  ep.progress[0].duration > 0
                                      ? (ep.progress[0].currentTime /
                                            ep.progress[0].duration) *
                                        100
                                      : 0,
                              isFinished: ep.progress[0].isFinished,
                              lastPlayedAt: ep.progress[0].lastPlayedAt,
                          }
                        : null,
                })),
            };
        });

        res.json(podcasts);
    } catch (error: any) {
        console.error("Error fetching podcasts:", error);
        res.status(500).json({
            error: "Failed to fetch podcasts",
            message: error.message,
        });
    }
});

/**
 * GET /podcasts/discover/top
 * Get top podcasts - just search iTunes like the search bar does
 */
router.get("/discover/top", requireAuthOrToken, async (req, res) => {
    try {
        const { limit = "20" } = req.query;
        const podcastLimit = Math.min(parseInt(limit as string, 10), 50);

        console.log(`\n[TOP PODCASTS] Request (limit: ${podcastLimit})`);

        // Simple iTunes search - same as the working search bar!
        const itunesResponse = await axios.get(
            "https://itunes.apple.com/search",
            {
                params: {
                    term: "podcast",
                    media: "podcast",
                    entity: "podcast",
                    limit: podcastLimit,
                },
                timeout: 5000,
            }
        );

        const podcasts = itunesResponse.data.results.map((podcast: any) => ({
            id: podcast.collectionId.toString(),
            title: podcast.collectionName,
            author: podcast.artistName,
            coverUrl: podcast.artworkUrl600 || podcast.artworkUrl100,
            feedUrl: podcast.feedUrl,
            genres: podcast.genres || [],
            episodeCount: podcast.trackCount || 0,
            itunesId: podcast.collectionId,
            isExternal: true,
        }));

        console.log(`   Found ${podcasts.length} podcasts`);
        res.json(podcasts);
    } catch (error: any) {
        console.error("Error fetching top podcasts:", error);
        res.status(500).json({
            error: "Failed to fetch top podcasts",
            message: error.message,
        });
    }
});

/**
 * GET /podcasts/discover/genres
 * Get podcasts by specific genres/topics - using simple iTunes search like the search bar
 */
router.get("/discover/genres", async (req, res) => {
    try {
        const { genres } = req.query; // Comma-separated genre IDs

        console.log(`\n[GENRE PODCASTS] Request (genres: ${genres})`);

        if (!genres || typeof genres !== "string") {
            return res.status(400).json({
                error: "genres parameter required (comma-separated genre IDs)",
            });
        }

        const genreIds = genres.split(",").map((id) => parseInt(id.trim(), 10));

        // Map genre IDs to search terms - same approach as the working search!
        const genreSearchTerms: { [key: number]: string } = {
            1303: "comedy podcast", // Comedy
            1324: "society culture podcast", // Society & Culture
            1489: "news podcast", // News
            1488: "true crime podcast", // True Crime
            1321: "business podcast", // Business
            1545: "sports podcast", // Sports
            1502: "gaming hobbies podcast", // Leisure (Gaming & Hobbies)
        };

        // Fetch podcasts for each genre using simple iTunes search
        const results: any = {};
        for (const genreId of genreIds) {
            const searchTerm = genreSearchTerms[genreId] || "podcast";
            console.log(`    Searching for "${searchTerm}"...`);

            try {
                // Simple iTunes search - same as the working search bar!
                const itunesResponse = await axios.get(
                    "https://itunes.apple.com/search",
                    {
                        params: {
                            term: searchTerm,
                            media: "podcast",
                            entity: "podcast",
                            limit: 10,
                        },
                        timeout: 5000,
                    }
                );

                const podcasts = itunesResponse.data.results.map(
                    (podcast: any) => ({
                        id: podcast.collectionId.toString(),
                        title: podcast.collectionName,
                        author: podcast.artistName,
                        coverUrl:
                            podcast.artworkUrl600 || podcast.artworkUrl100,
                        feedUrl: podcast.feedUrl,
                        genres: podcast.genres || [],
                        episodeCount: podcast.trackCount || 0,
                        itunesId: podcast.collectionId,
                        isExternal: true,
                    })
                );

                results[genreId] = podcasts;
                console.log(`      Found ${podcasts.length} podcasts`);
            } catch (error: any) {
                console.error(
                    `       Error searching for ${searchTerm}:`,
                    error.message
                );
                results[genreId] = [];
            }
        }

        console.log(`   Fetched podcasts for ${genreIds.length} genres`);
        res.json(results);
    } catch (error: any) {
        console.error("Error fetching genre podcasts:", error);
        res.status(500).json({
            error: "Failed to fetch genre podcasts",
            message: error.message,
        });
    }
});

/**
 * GET /podcasts/discover/genre/:genreId
 * Get paginated podcasts for a specific genre with offset support
 */
router.get("/discover/genre/:genreId", async (req, res) => {
    try {
        const { genreId } = req.params;
        const { limit = "20", offset = "0" } = req.query;

        const podcastLimit = Math.min(parseInt(limit as string, 10), 50);
        const podcastOffset = parseInt(offset as string, 10);

        console.log(
            `\n[GENRE PAGINATED] Request (genre: ${genreId}, limit: ${podcastLimit}, offset: ${podcastOffset})`
        );

        // Map genre IDs to search terms
        const genreSearchTerms: { [key: string]: string } = {
            "1303": "comedy podcast",
            "1324": "society culture podcast",
            "1489": "news podcast",
            "1488": "true crime podcast",
            "1321": "business podcast",
            "1545": "sports podcast",
            "1502": "gaming hobbies podcast",
        };

        const searchTerm = genreSearchTerms[genreId] || "podcast";
        console.log(
            `    Searching for "${searchTerm}" (offset: ${podcastOffset})...`
        );

        // iTunes API doesn't support offset directly, so we request more and slice
        // This is a limitation but works for reasonable pagination
        const totalToFetch = podcastOffset + podcastLimit;

        const itunesResponse = await axios.get(
            "https://itunes.apple.com/search",
            {
                params: {
                    term: searchTerm,
                    media: "podcast",
                    entity: "podcast",
                    limit: Math.min(totalToFetch, 200), // iTunes max is 200
                },
                timeout: 5000,
            }
        );

        const allPodcasts = itunesResponse.data.results.map((podcast: any) => ({
            id: podcast.collectionId.toString(),
            title: podcast.collectionName,
            author: podcast.artistName,
            coverUrl: podcast.artworkUrl600 || podcast.artworkUrl100,
            feedUrl: podcast.feedUrl,
            genres: podcast.genres || [],
            episodeCount: podcast.trackCount || 0,
            itunesId: podcast.collectionId,
            isExternal: true,
        }));

        // Slice for pagination
        const podcasts = allPodcasts.slice(
            podcastOffset,
            podcastOffset + podcastLimit
        );

        console.log(
            `   Found ${podcasts.length} podcasts (total available: ${allPodcasts.length})`
        );
        res.json(podcasts);
    } catch (error: any) {
        console.error("Error fetching paginated genre podcasts:", error);
        res.status(500).json({
            error: "Failed to fetch podcasts",
            message: error.message,
        });
    }
});

/**
 * GET /podcasts/preview/:itunesId
 * Preview a podcast by iTunes ID (for discovery, before subscribing)
 * Returns basic podcast info without requiring a subscription
 */
router.get("/preview/:itunesId", async (req, res) => {
    try {
        const { itunesId } = req.params;

        console.log(`\n [PODCAST PREVIEW] iTunes ID: ${itunesId}`);

        // Try to fetch from iTunes API
        const itunesResponse = await axios.get(
            "https://itunes.apple.com/lookup",
            {
                params: {
                    id: itunesId,
                    entity: "podcast",
                },
                timeout: 5000,
            }
        );

        if (
            !itunesResponse.data.results ||
            itunesResponse.data.results.length === 0
        ) {
            return res.status(404).json({ error: "Podcast not found" });
        }

        const podcastData = itunesResponse.data.results[0];

        // Check if user is already subscribed
        const existingPodcast = await prisma.podcast.findFirst({
            where: {
                OR: [{ id: itunesId }, { feedUrl: podcastData.feedUrl }],
            },
        });

        let isSubscribed = false;
        if (existingPodcast) {
            const subscription = await prisma.podcastSubscription.findUnique({
                where: {
                    userId_podcastId: {
                        userId: req.user!.id,
                        podcastId: existingPodcast.id,
                    },
                },
            });
            isSubscribed = !!subscription;
        }

        // Fetch description and episodes from RSS feed (iTunes API doesn't provide them)
        let description = "";
        let previewEpisodes: any[] = [];
        if (podcastData.feedUrl) {
            try {
                const feedData = await rssParserService.parseFeed(
                    podcastData.feedUrl
                );
                description =
                    feedData.description || feedData.itunes?.summary || "";

                // Get first 3 episodes for preview
                previewEpisodes = (feedData.episodes || [])
                    .slice(0, 3)
                    .map((episode: any) => ({
                        title: episode.title,
                        publishedAt: episode.publishedAt,
                        duration: episode.duration || 0,
                    }));

                console.log(
                    ` [PODCAST PREVIEW] Fetched description (${description.length} chars) and ${previewEpisodes.length} preview episodes`
                );
            } catch (error) {
                console.warn(
                    `  Failed to fetch RSS feed for preview:`,
                    error
                );
                // Continue without description and episodes
            }
        }

        res.json({
            itunesId: podcastData.collectionId.toString(),
            title: podcastData.collectionName,
            author: podcastData.artistName,
            description: description,
            coverUrl: podcastData.artworkUrl600 || podcastData.artworkUrl100,
            feedUrl: podcastData.feedUrl,
            genres: podcastData.genres || [],
            episodeCount: podcastData.trackCount || 0,
            previewEpisodes: previewEpisodes,
            isSubscribed,
            subscribedPodcastId: isSubscribed ? existingPodcast!.id : null,
        });
    } catch (error: any) {
        console.error("Error previewing podcast:", error);
        res.status(500).json({
            error: "Failed to preview podcast",
            message: error.message,
        });
    }
});

/**
 * GET /podcasts/:id
 * Get a specific podcast with full details and episodes
 * Requires user to be subscribed
 */
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user is subscribed
        const subscription = await prisma.podcastSubscription.findUnique({
            where: {
                userId_podcastId: {
                    userId: req.user!.id,
                    podcastId: id,
                },
            },
        });

        if (!subscription) {
            return res
                .status(404)
                .json({ error: "Podcast not found or not subscribed" });
        }

        const podcast = await prisma.podcast.findUnique({
            where: { id },
            include: {
                episodes: {
                    orderBy: { publishedAt: "desc" },
                    include: {
                        progress: {
                            where: { userId: req.user!.id },
                        },
                        downloads: {
                            where: { userId: req.user!.id },
                        },
                    },
                },
            },
        });

        if (!podcast) {
            return res.status(404).json({ error: "Podcast not found" });
        }

        const episodesWithProgress = podcast.episodes.map((episode) => ({
            id: episode.id,
            title: episode.title,
            description: episode.description,
            duration: episode.duration,
            publishedAt: episode.publishedAt,
            episodeNumber: episode.episodeNumber,
            season: episode.season,
            imageUrl: episode.imageUrl,
            isDownloaded: episode.downloads.length > 0,
            progress: episode.progress[0]
                ? {
                      currentTime: episode.progress[0].currentTime,
                      progress:
                          episode.progress[0].duration > 0
                              ? (episode.progress[0].currentTime /
                                    episode.progress[0].duration) *
                                100
                              : 0,
                      isFinished: episode.progress[0].isFinished,
                      lastPlayedAt: episode.progress[0].lastPlayedAt,
                  }
                : null,
        }));

        res.json({
            id: podcast.id,
            title: podcast.title,
            author: podcast.author,
            description: podcast.description,
            coverUrl: podcast.imageUrl,
            feedUrl: podcast.feedUrl,
            genres: [], // Podcast genres not yet stored in database
            autoDownloadEpisodes: false,
            episodes: episodesWithProgress,
            isSubscribed: true,
        });
    } catch (error: any) {
        console.error("Error fetching podcast:", error);
        res.status(500).json({
            error: "Failed to fetch podcast",
            message: error.message,
        });
    }
});

/**
 * POST /podcasts/subscribe
 * Subscribe to a podcast by RSS feed URL or iTunes ID
 */
router.post("/subscribe", async (req, res) => {
    try {
        const { feedUrl, itunesId } = req.body;

        if (!feedUrl && !itunesId) {
            return res
                .status(400)
                .json({ error: "feedUrl or itunesId is required" });
        }

        console.log(
            `\n [PODCAST] Subscribe request from ${req.user!.username}`
        );
        console.log(`   Feed URL: ${feedUrl || "N/A"}`);
        console.log(`   iTunes ID: ${itunesId || "N/A"}`);

        let finalFeedUrl = feedUrl;

        // If only iTunes ID provided, fetch feed URL from iTunes API
        if (!finalFeedUrl && itunesId) {
            console.log(`    Looking up feed URL from iTunes...`);
            const itunesResponse = await axios.get(
                "https://itunes.apple.com/lookup",
                {
                    params: { id: itunesId, entity: "podcast" },
                }
            );

            if (
                itunesResponse.data.resultCount === 0 ||
                !itunesResponse.data.results[0].feedUrl
            ) {
                return res
                    .status(404)
                    .json({ error: "Podcast not found in iTunes" });
            }

            finalFeedUrl = itunesResponse.data.results[0].feedUrl;
            console.log(`   Found feed URL: ${finalFeedUrl}`);
        }

        // Check if podcast already exists in database
        let podcast = await prisma.podcast.findUnique({
            where: { feedUrl: finalFeedUrl },
        });

        if (podcast) {
            console.log(`   Podcast exists in database: ${podcast.title}`);

            // Check if user is already subscribed
            const existingSubscription =
                await prisma.podcastSubscription.findUnique({
                    where: {
                        userId_podcastId: {
                            userId: req.user!.id,
                            podcastId: podcast.id,
                        },
                    },
                });

            if (existingSubscription) {
                console.log(`     User already subscribed`);
                return res.json({
                    success: true,
                    podcast: {
                        id: podcast.id,
                        title: podcast.title,
                    },
                    message: "Already subscribed",
                });
            }

            // Subscribe user to existing podcast
            await prisma.podcastSubscription.create({
                data: {
                    userId: req.user!.id,
                    podcastId: podcast.id,
                },
            });

            console.log(`   User subscribed to existing podcast`);
            return res.json({
                success: true,
                podcast: {
                    id: podcast.id,
                    title: podcast.title,
                },
                message: "Subscribed successfully",
            });
        }

        // Parse RSS feed to get podcast and episodes
        console.log(`   📥 Parsing RSS feed...`);
        const { podcast: podcastData, episodes } =
            await rssParserService.parseFeed(finalFeedUrl);

        // Create podcast in database
        console.log(`    Saving podcast to database...`);
        const finalItunesId = itunesId || podcastData.itunesId;
        console.log(`   iTunes ID to save: ${finalItunesId || "NONE"}`);

        podcast = await prisma.podcast.create({
            data: {
                feedUrl: finalFeedUrl,
                title: podcastData.title,
                author: podcastData.author,
                description: podcastData.description,
                imageUrl: podcastData.imageUrl,
                itunesId: finalItunesId,
                language: podcastData.language,
                explicit: podcastData.explicit || false,
                episodeCount: episodes.length,
            },
        });

        console.log(`   Podcast created: ${podcast.id}`);
        console.log(`   iTunes ID saved: ${podcast.itunesId || "NONE"}`);

        // Save episodes
        console.log(`    Saving ${episodes.length} episodes...`);
        await prisma.podcastEpisode.createMany({
            data: episodes.map((ep) => ({
                podcastId: podcast!.id,
                guid: ep.guid,
                title: ep.title,
                description: ep.description,
                audioUrl: ep.audioUrl,
                duration: ep.duration,
                publishedAt: ep.publishedAt,
                episodeNumber: ep.episodeNumber,
                season: ep.season,
                imageUrl: ep.imageUrl,
                fileSize: ep.fileSize,
                mimeType: ep.mimeType,
            })),
            skipDuplicates: true,
        });

        console.log(`   Episodes saved`);

        // Subscribe user
        await prisma.podcastSubscription.create({
            data: {
                userId: req.user!.id,
                podcastId: podcast.id,
            },
        });

        console.log(`   User subscribed successfully`);

        res.json({
            success: true,
            podcast: {
                id: podcast.id,
                title: podcast.title,
            },
            message: "Subscribed successfully",
        });
    } catch (error: any) {
        console.error("Error subscribing to podcast:", error);
        res.status(500).json({
            error: "Failed to subscribe to podcast",
            message: error.message,
        });
    }
});

/**
 * DELETE /podcasts/:id/unsubscribe
 * Unsubscribe from a podcast
 */
router.delete("/:id/unsubscribe", async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`\n[PODCAST] Unsubscribe request`);
        console.log(`   User: ${req.user!.username}`);
        console.log(`   Podcast ID: ${id}`);

        // Delete subscription
        const deleted = await prisma.podcastSubscription.deleteMany({
            where: {
                userId: req.user!.id,
                podcastId: id,
            },
        });

        if (deleted.count === 0) {
            return res
                .status(404)
                .json({ error: "Not subscribed to this podcast" });
        }

        // Also delete user's progress for this podcast
        await prisma.podcastProgress.deleteMany({
            where: {
                userId: req.user!.id,
                episode: {
                    podcastId: id,
                },
            },
        });

        // Also delete any downloaded episodes
        await prisma.podcastDownload.deleteMany({
            where: {
                userId: req.user!.id,
                episode: {
                    podcastId: id,
                },
            },
        });

        console.log(`   Unsubscribed successfully`);

        res.json({
            success: true,
            message: "Unsubscribed successfully",
        });
    } catch (error: any) {
        console.error("Error unsubscribing from podcast:", error);
        res.status(500).json({
            error: "Failed to unsubscribe",
            message: error.message,
        });
    }
});

/**
 * GET /podcasts/:id/refresh
 * Manually refresh podcast feed to check for new episodes
 */
router.get("/:id/refresh", async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`\n [PODCAST] Refresh request`);
        console.log(`   Podcast ID: ${id}`);

        const podcast = await prisma.podcast.findUnique({
            where: { id },
        });

        if (!podcast) {
            return res.status(404).json({ error: "Podcast not found" });
        }

        // Parse RSS feed
        console.log(`   📥 Parsing RSS feed...`);
        const { podcast: podcastData, episodes } =
            await rssParserService.parseFeed(podcast.feedUrl);

        // Update podcast metadata
        await prisma.podcast.update({
            where: { id },
            data: {
                title: podcastData.title,
                author: podcastData.author,
                description: podcastData.description,
                imageUrl: podcastData.imageUrl,
                language: podcastData.language,
                explicit: podcastData.explicit || false,
                episodeCount: episodes.length,
                lastRefreshed: new Date(),
            },
        });

        // Add new episodes (skip duplicates)
        let newEpisodesCount = 0;
        for (const ep of episodes) {
            const existing = await prisma.podcastEpisode.findUnique({
                where: {
                    podcastId_guid: {
                        podcastId: id,
                        guid: ep.guid,
                    },
                },
            });

            if (!existing) {
                await prisma.podcastEpisode.create({
                    data: {
                        podcastId: id,
                        guid: ep.guid,
                        title: ep.title,
                        description: ep.description,
                        audioUrl: ep.audioUrl,
                        duration: ep.duration,
                        publishedAt: ep.publishedAt,
                        episodeNumber: ep.episodeNumber,
                        season: ep.season,
                        imageUrl: ep.imageUrl,
                        fileSize: ep.fileSize,
                        mimeType: ep.mimeType,
                    },
                });
                newEpisodesCount++;
            }
        }

        console.log(
            `   Refresh complete. ${newEpisodesCount} new episodes added.`
        );

        res.json({
            success: true,
            newEpisodesCount,
            totalEpisodes: episodes.length,
            message: `Found ${newEpisodesCount} new episodes`,
        });
    } catch (error: any) {
        console.error("Error refreshing podcast:", error);
        res.status(500).json({
            error: "Failed to refresh podcast",
            message: error.message,
        });
    }
});

/**
 * GET /podcasts/:podcastId/episodes/:episodeId/stream
 * Stream a podcast episode (from RSS URL or local download)
 */
router.get("/:podcastId/episodes/:episodeId/stream", async (req, res) => {
    try {
        const { podcastId, episodeId } = req.params;

        console.log(`\n [PODCAST STREAM] Request:`);
        console.log(`   Podcast ID: ${podcastId}`);
        console.log(`   Episode ID: ${episodeId}`);

        const episode = await prisma.podcastEpisode.findUnique({
            where: { id: episodeId },
            include: {
                downloads: {
                    where: { userId: req.user!.id },
                },
            },
        });

        if (!episode) {
            return res.status(404).json({ error: "Episode not found" });
        }

        // Check if episode is downloaded locally
        const range = req.headers.range;

        if (episode.downloads.length > 0) {
            const download = episode.downloads[0];
            if (download?.localPath) {
                console.log(
                    `   Streaming from local download: ${download.localPath}`
                );
                try {
                    const stats = await fs.promises.stat(download.localPath);
                    const fileSize = stats.size;
                    if (fileSize === 0) {
                        throw new Error("Local download is empty");
                    }

                    if (range) {
                        const [startStr, endStr] = range
                            .replace(/bytes=/, "")
                            .split("-");
                        const start = parseInt(startStr, 10);
                        const end = endStr
                            ? parseInt(endStr, 10)
                            : fileSize - 1;
                        const chunkSize = end - start + 1;

                        res.writeHead(206, {
                            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                            "Accept-Ranges": "bytes",
                            "Content-Length": chunkSize,
                            "Content-Type": episode.mimeType || "audio/mpeg",
                            "Cache-Control": "public, max-age=3600",
                            "Access-Control-Allow-Origin":
                                req.headers.origin || "*",
                            "Access-Control-Allow-Credentials": "true",
                        });

                        const fileStream = fs.createReadStream(
                            download.localPath,
                            {
                                start,
                                end,
                            }
                        );
                        fileStream.pipe(res);
                        fileStream.on("error", (err) => {
                            console.error("    Local stream error:", err);
                            if (!res.headersSent) {
                                res.status(500).json({
                                    error: "Failed to stream episode",
                                });
                            } else {
                                res.end();
                            }
                        });
                        return;
                    }

                    res.writeHead(200, {
                        "Content-Type": episode.mimeType || "audio/mpeg",
                        "Content-Length": fileSize,
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "public, max-age=3600",
                        "Access-Control-Allow-Origin":
                            req.headers.origin || "*",
                        "Access-Control-Allow-Credentials": "true",
                    });

                    const fileStream = fs.createReadStream(download.localPath);
                    fileStream.pipe(res);
                    fileStream.on("error", (err) => {
                        console.error("    Local stream error:", err);
                        if (!res.headersSent) {
                            res.status(500).json({
                                error: "Failed to stream episode",
                            });
                        } else {
                            res.end();
                        }
                    });
                    return;
                } catch (err: any) {
                    console.error(
                        "    Failed to stream local download, falling back to RSS:",
                        err.message
                    );
                }
            }
        }

        // Stream from RSS URL
        console.log(`   Streaming from RSS: ${episode.audioUrl}`);

        // Get file size first for proper range handling
        let fileSize = episode.fileSize;
        if (!fileSize) {
            try {
                const headResponse = await axios.head(episode.audioUrl);
                fileSize = parseInt(
                    headResponse.headers["content-length"] || "0"
                );
                if (Number.isFinite(fileSize) && fileSize > 0) {
                    await prisma.podcastEpisode.update({
                        where: { id: episode.id },
                        data: { fileSize },
                    });
                }
            } catch (err) {
                console.warn("    Could not get file size via HEAD request");
            }
        }

        if (range && fileSize) {
            // Parse range header (format: bytes=start-end)
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            console.log(
                `    Range request: bytes=${start}-${end}/${fileSize}`
            );

            // Send 206 Partial Content with proper range
            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunkSize,
                "Content-Type": episode.mimeType || "audio/mpeg",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": req.headers.origin || "*",
                "Access-Control-Allow-Credentials": "true",
            });

            // Fetch the specific byte range
            const response = await axios.get(episode.audioUrl, {
                headers: { Range: `bytes=${start}-${end}` },
                responseType: "stream",
                validateStatus: (status) => status === 206 || status === 200,
            });

            response.data.pipe(res);
        } else {
            // No range request - stream entire file
            console.log(`    Streaming full file`);

            const response = await axios.get(episode.audioUrl, {
                responseType: "stream",
            });

            const contentLength = response.headers["content-length"];

            res.writeHead(200, {
                "Content-Type": episode.mimeType || "audio/mpeg",
                "Accept-Ranges": "bytes",
                ...(contentLength && { "Content-Length": contentLength }),
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": req.headers.origin || "*",
                "Access-Control-Allow-Credentials": "true",
            });

            response.data.pipe(res);
        }
    } catch (error: any) {
        console.error("\n [PODCAST STREAM] Error:", error.message);
        if (!res.headersSent) {
            res.status(500).json({
                error: "Failed to stream episode",
                message: error.message,
            });
        }
    }
});

/**
 * POST /podcasts/:podcastId/episodes/:episodeId/progress
 * Update playback progress for a podcast episode
 */
router.post("/:podcastId/episodes/:episodeId/progress", async (req, res) => {
    try {
        const { podcastId, episodeId } = req.params;
        const { currentTime, duration, isFinished } = req.body;

        console.log(`\n [PODCAST PROGRESS] Update:`);
        console.log(`   User: ${req.user!.username}`);
        console.log(`   Episode ID: ${episodeId}`);
        console.log(`   Current Time: ${currentTime}s`);
        console.log(`   Duration: ${duration}s`);
        console.log(`   Finished: ${isFinished}`);

        const progress = await prisma.podcastProgress.upsert({
            where: {
                userId_episodeId: {
                    userId: req.user!.id,
                    episodeId: episodeId,
                },
            },
            create: {
                userId: req.user!.id,
                episodeId: episodeId,
                currentTime,
                duration,
                isFinished: isFinished || false,
            },
            update: {
                currentTime,
                duration,
                isFinished: isFinished || false,
                lastPlayedAt: new Date(),
            },
        });

        console.log(`   Progress saved`);

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
});

/**
 * DELETE /podcasts/:podcastId/episodes/:episodeId/progress
 * Remove/reset progress for a podcast episode
 */
router.delete("/:podcastId/episodes/:episodeId/progress", async (req, res) => {
    try {
        const { episodeId } = req.params;

        console.log(`\n[PODCAST PROGRESS] Delete:`);
        console.log(`   User: ${req.user!.username}`);
        console.log(`   Episode ID: ${episodeId}`);

        await prisma.podcastProgress.deleteMany({
            where: {
                userId: req.user!.id,
                episodeId: episodeId,
            },
        });

        console.log(`   Progress removed`);

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
});

/**
 * GET /podcasts/:id/similar
 * Get similar podcasts using iTunes Search API (free, no auth required)
 */
router.get("/:id/similar", async (req, res) => {
    try {
        const { id } = req.params;

        const podcast = await prisma.podcast.findUnique({
            where: { id },
        });

        if (!podcast) {
            return res.status(404).json({ error: "Podcast not found" });
        }

        console.log(`\n [SIMILAR PODCASTS] Request for: ${podcast.title}`);

        try {
            // Check cache first
            const cachedRecommendations =
                await prisma.podcastRecommendation.findMany({
                    where: {
                        podcastId: id,
                        expiresAt: { gt: new Date() },
                    },
                    orderBy: { score: "desc" },
                    take: 10,
                });

            if (cachedRecommendations.length > 0) {
                console.log(
                    `   Using ${cachedRecommendations.length} cached recommendations`
                );
                return res.json(
                    cachedRecommendations.map((rec) => ({
                        id: rec.recommendedId,
                        title: rec.title,
                        author: rec.author,
                        description: rec.description,
                        coverUrl: rec.coverUrl,
                        episodeCount: rec.episodeCount,
                        feedUrl: rec.feedUrl,
                        itunesId: rec.itunesId,
                        isExternal: true,
                        score: rec.score,
                    }))
                );
            }

            // Fetch from iTunes Search API
            console.log(`    Fetching from iTunes Search API...`);
            const { itunesService } = await import("../services/itunes");
            const recommendations = await itunesService.getSimilarPodcasts(
                podcast.title,
                podcast.description || undefined,
                podcast.author
            );

            console.log(`   Found ${recommendations.length} similar podcasts`);

            if (recommendations.length > 0) {
                // Cache recommendations
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30); // 30 days cache

                await prisma.podcastRecommendation.deleteMany({
                    where: { podcastId: id },
                });

                await prisma.podcastRecommendation.createMany({
                    data: recommendations.map((rec, index) => ({
                        podcastId: id,
                        recommendedId: rec.collectionId.toString(),
                        title: rec.collectionName,
                        author: rec.artistName,
                        description: "",
                        coverUrl: rec.artworkUrl600 || rec.artworkUrl100,
                        episodeCount: rec.trackCount || 0,
                        feedUrl: rec.feedUrl,
                        itunesId: rec.collectionId.toString(),
                        score: recommendations.length - index,
                        cachedAt: new Date(),
                        expiresAt,
                    })),
                });

                console.log(
                    `   Cached ${recommendations.length} recommendations`
                );

                return res.json(
                    recommendations.map((rec, index) => ({
                        id: rec.collectionId.toString(),
                        title: rec.collectionName,
                        author: rec.artistName,
                        description: "",
                        coverUrl: rec.artworkUrl600 || rec.artworkUrl100,
                        episodeCount: rec.trackCount || 0,
                        feedUrl: rec.feedUrl,
                        itunesId: rec.collectionId,
                        isExternal: true,
                        score: recommendations.length - index,
                    }))
                );
            }
        } catch (error: any) {
            console.warn("    iTunes search failed:", error.message);
        }

        // No recommendations available
        console.log(`    No recommendations found`);
        res.json([]);
    } catch (error: any) {
        console.error("Error fetching similar podcasts:", error);
        res.status(500).json({
            error: "Failed to fetch similar podcasts",
            message: error.message,
        });
    }
});

/**
 * OPTIONS /podcasts/:id/cover
 * Handle CORS preflight request for podcast cover images
 */
router.options("/:id/cover", (req, res) => {
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
    res.status(204).end();
});

/**
 * GET /podcasts/:id/cover
 * Serve cached podcast cover from local disk
 */
router.get("/:id/cover", async (req, res) => {
    try {
        const { id } = req.params;

        const podcast = await prisma.podcast.findUnique({
            where: { id },
            select: { localCoverPath: true, imageUrl: true },
        });

        if (!podcast) {
            return res.status(404).json({ error: "Podcast not found" });
        }

        // Serve from local disk if cached
        if (podcast.localCoverPath) {
            res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable"
            );
            res.setHeader(
                "Access-Control-Allow-Origin",
                req.headers.origin || "*"
            );
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.sendFile(podcast.localCoverPath);
        }

        // Fallback: redirect to original URL
        if (podcast.imageUrl) {
            return res.redirect(podcast.imageUrl);
        }

        res.status(404).json({ error: "Cover not found" });
    } catch (error: any) {
        console.error("Error serving podcast cover:", error);
        res.status(500).json({
            error: "Failed to serve cover",
            message: error.message,
        });
    }
});

/**
 * OPTIONS /podcasts/episodes/:episodeId/cover
 * Handle CORS preflight request for episode cover images
 */
router.options("/episodes/:episodeId/cover", (req, res) => {
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
    res.status(204).end();
});

/**
 * GET /podcasts/episodes/:episodeId/cover
 * Serve cached episode cover from local disk
 */
router.get("/episodes/:episodeId/cover", async (req, res) => {
    try {
        const { episodeId } = req.params;

        const episode = await prisma.podcastEpisode.findUnique({
            where: { id: episodeId },
            select: { localCoverPath: true, imageUrl: true },
        });

        if (!episode) {
            return res.status(404).json({ error: "Episode not found" });
        }

        // Serve from local disk if cached
        if (episode.localCoverPath) {
            res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable"
            );
            res.setHeader(
                "Access-Control-Allow-Origin",
                req.headers.origin || "*"
            );
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.sendFile(episode.localCoverPath);
        }

        // Fallback: redirect to original URL
        if (episode.imageUrl) {
            return res.redirect(episode.imageUrl);
        }

        res.status(404).json({ error: "Cover not found" });
    } catch (error: any) {
        console.error("Error serving episode cover:", error);
        res.status(500).json({
            error: "Failed to serve cover",
            message: error.message,
        });
    }
});

export default router;
