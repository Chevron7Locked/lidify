import { Router } from "express";
import { requireAuthOrToken } from "../middleware/auth";
import { prisma } from "../utils/db";
import { lastFmService } from "../services/lastfm";
import { startOfWeek, endOfWeek } from "date-fns";

const router = Router();

router.use(requireAuthOrToken);

// POST /discover/generate - Generate new Discover Weekly playlist (using Bull queue)
router.post("/generate", async (req, res) => {
    try {
        const userId = req.user!.id;
        const { discoverQueue } = await import("../workers/queues");

        console.log(
            `\n Queuing Discover Weekly generation for user ${userId}`
        );

        // Add generation job to queue
        const job = await discoverQueue.add({ userId });

        res.json({
            message: "Discover Weekly generation started",
            jobId: job.id,
        });
    } catch (error) {
        console.error("Generate Discover Weekly error:", error);
        res.status(500).json({ error: "Failed to start generation" });
    }
});

// GET /discover/generate/status/:jobId - Check generation job status
router.get("/generate/status/:jobId", async (req, res) => {
    try {
        const { discoverQueue } = await import("../workers/queues");
        const job = await discoverQueue.getJob(req.params.jobId);

        if (!job) {
            return res.status(404).json({ error: "Job not found" });
        }

        const state = await job.getState();
        const progress = job.progress();
        const result = job.returnvalue;

        res.json({
            status: state,
            progress,
            result,
        });
    } catch (error) {
        console.error("Get generation status error:", error);
        res.status(500).json({ error: "Failed to get job status" });
    }
});

// GET /discover/current - Get current week's Discover Weekly playlist
router.get("/current", async (req, res) => {
    try {
        const userId = req.user!.id;

        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
        const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }); // Sunday

        // Get all discovery albums for this week
        const discoveryAlbums = await prisma.discoveryAlbum.findMany({
            where: {
                userId,
                weekStartDate: weekStart,
                status: { in: ["ACTIVE", "LIKED"] },
            },
            orderBy: { downloadedAt: "asc" },
        });

        // Get unavailable albums for this week (show full replacement chain)
        const unavailableAlbums = await prisma.unavailableAlbum.findMany({
            where: {
                userId,
                weekStartDate: weekStart,
            },
            orderBy: [
                { originalAlbumId: "asc" }, // Group by original album
                { attemptNumber: "asc" }, // Then sort by attempt number
            ],
        });

        // For each discovery album, find the corresponding album in library and get one track
        const tracks = [];

        for (const discoveryAlbum of discoveryAlbums) {
            // Find the album in library by matching artist + album title
            const album = await prisma.album.findFirst({
                where: {
                    title: discoveryAlbum.albumTitle,
                    artist: {
                        name: discoveryAlbum.artistName,
                    },
                },
                include: {
                    artist: true,
                    tracks: {
                        take: 1, // Just need one track per album
                        orderBy: { trackNo: "asc" },
                    },
                },
            });

            if (album && album.tracks.length > 0) {
                const track = album.tracks[0];
                tracks.push({
                    id: track.id, // Real track ID
                    title: track.title,
                    artist: discoveryAlbum.artistName,
                    album: discoveryAlbum.albumTitle,
                    albumId: discoveryAlbum.rgMbid,
                    isLiked: discoveryAlbum.status === "LIKED",
                    likedAt: discoveryAlbum.likedAt,
                    similarity: discoveryAlbum.similarity,
                    tier: discoveryAlbum.tier,
                    coverUrl: album.coverUrl,
                    available: true,
                });
            } else {
                // Album not scanned yet (still downloading/scanning)
                // Return placeholder data
                tracks.push({
                    id: `pending-${discoveryAlbum.id}`,
                    title: "Downloading...",
                    artist: discoveryAlbum.artistName,
                    album: discoveryAlbum.albumTitle,
                    albumId: discoveryAlbum.rgMbid,
                    isLiked: discoveryAlbum.status === "LIKED",
                    likedAt: discoveryAlbum.likedAt,
                    similarity: discoveryAlbum.similarity,
                    tier: discoveryAlbum.tier,
                    coverUrl: null,
                    available: true,
                });
            }
        }

        // Format unavailable albums
        const unavailable = unavailableAlbums.map((album) => ({
            id: `unavailable-${album.id}`,
            title: album.albumTitle,
            artist: album.artistName,
            album: album.albumTitle,
            albumId: album.albumMbid,
            similarity: album.similarity,
            tier: album.tier,
            previewUrl: album.previewUrl,
            deezerTrackId: album.deezerTrackId,
            deezerAlbumId: album.deezerAlbumId,
            attemptNumber: album.attemptNumber,
            originalAlbumId: album.originalAlbumId,
            available: false,
        }));

        try {
            console.log(`\nDiscover Weekly API Response:`);
            console.log(`  Total tracks: ${tracks.length}`);
            console.log(`  Unavailable albums: ${unavailable.length}`);
            if (unavailable.length > 0 && unavailable.length <= 20) {
                console.log(`  Unavailable albums with previews:`);
                unavailable.slice(0, 5).forEach((album, i) => {
                    console.log(
                        `    ${i + 1}. ${album.artist} - ${album.album} [${
                            album.previewUrl ? "HAS PREVIEW" : "NO PREVIEW"
                        }]`
                    );
                });
                if (unavailable.length > 5) {
                    console.log(`    ... and ${unavailable.length - 5} more`);
                }
            }
        } catch (err) {
            console.error("Error logging discover response:", err);
        }

        res.json({
            weekStart,
            weekEnd,
            tracks,
            unavailable,
            totalCount: tracks.length,
            unavailableCount: unavailable.length,
        });
    } catch (error) {
        console.error("Get current Discover Weekly error:", error);
        res.status(500).json({
            error: "Failed to get Discover Weekly playlist",
        });
    }
});

// POST /discover/like - Like a track (marks entire album for keeping)
router.post("/like", async (req, res) => {
    try {
        const userId = req.user!.id;
        const { albumId } = req.body;

        if (!albumId) {
            return res.status(400).json({ error: "albumId required" });
        }

        // Find the discovery album
        const discoveryAlbum = await prisma.discoveryAlbum.findFirst({
            where: {
                userId,
                rgMbid: albumId,
                status: "ACTIVE",
            },
        });

        if (!discoveryAlbum) {
            return res
                .status(404)
                .json({ error: "Album not in active discovery" });
        }

        // Mark as liked (entire album will be kept)
        await prisma.discoveryAlbum.update({
            where: { id: discoveryAlbum.id },
            data: {
                status: "LIKED",
                likedAt: new Date(),
            },
        });

        // Retroactively mark all plays from this album as DISCOVERY_KEPT
        // Note: This requires getting tracks from the album first
        const tracks = await prisma.discoveryTrack.findMany({
            where: { discoveryAlbumId: discoveryAlbum.id },
            select: { trackId: true },
        });

        const trackIds = tracks
            .map((t) => t.trackId)
            .filter((id): id is string => id !== null);

        if (trackIds.length > 0) {
            await prisma.play.updateMany({
                where: {
                    userId,
                    trackId: { in: trackIds },
                    source: "DISCOVERY",
                },
                data: {
                    source: "DISCOVERY_KEPT",
                },
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Like discovery album error:", error);
        res.status(500).json({ error: "Failed to like album" });
    }
});

// DELETE /discover/unlike - Unlike a track
router.delete("/unlike", async (req, res) => {
    try {
        const userId = req.user!.id;
        const { albumId } = req.body;

        if (!albumId) {
            return res.status(400).json({ error: "albumId required" });
        }

        const discoveryAlbum = await prisma.discoveryAlbum.findFirst({
            where: {
                userId,
                rgMbid: albumId,
                status: "LIKED",
            },
        });

        if (!discoveryAlbum) {
            return res.status(404).json({ error: "Album not liked" });
        }

        // Revert status back to ACTIVE
        await prisma.discoveryAlbum.update({
            where: { id: discoveryAlbum.id },
            data: {
                status: "ACTIVE",
                likedAt: null,
            },
        });

        // Revert plays back to DISCOVERY source
        const tracks = await prisma.discoveryTrack.findMany({
            where: { discoveryAlbumId: discoveryAlbum.id },
            select: { trackId: true },
        });

        const trackIds = tracks
            .map((t) => t.trackId)
            .filter((id): id is string => id !== null);

        if (trackIds.length > 0) {
            await prisma.play.updateMany({
                where: {
                    userId,
                    trackId: { in: trackIds },
                    source: "DISCOVERY_KEPT",
                },
                data: {
                    source: "DISCOVERY",
                },
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Unlike discovery album error:", error);
        res.status(500).json({ error: "Failed to unlike album" });
    }
});

// GET /discover/config - Get user's Discover Weekly configuration
router.get("/config", async (req, res) => {
    try {
        const userId = req.user!.id;

        let config = await prisma.userDiscoverConfig.findUnique({
            where: { userId },
        });

        // Create default config if doesn't exist
        if (!config) {
            config = await prisma.userDiscoverConfig.create({
                data: {
                    userId,
                    playlistSize: 40,
                    maxRetryAttempts: 3,
                    enabled: true,
                },
            });
        }

        res.json(config);
    } catch (error) {
        console.error("Get Discover Weekly config error:", error);
        res.status(500).json({ error: "Failed to get configuration" });
    }
});

// PATCH /discover/config - Update user's Discover Weekly configuration
router.patch("/config", async (req, res) => {
    try {
        const userId = req.user!.id;
        const { playlistSize, maxRetryAttempts, enabled } = req.body;

        // Validate playlist size
        if (playlistSize !== undefined) {
            const size = parseInt(playlistSize, 10);
            if (isNaN(size) || size < 5 || size > 50 || size % 5 !== 0) {
                return res.status(400).json({
                    error: "Invalid playlist size. Must be between 5-50 in increments of 5.",
                });
            }
        }

        // Validate max retry attempts
        if (maxRetryAttempts !== undefined) {
            const retries = parseInt(maxRetryAttempts, 10);
            if (isNaN(retries) || retries < 1 || retries > 10) {
                return res.status(400).json({
                    error: "Invalid retry attempts. Must be between 1-10.",
                });
            }
        }

        const config = await prisma.userDiscoverConfig.upsert({
            where: { userId },
            create: {
                userId,
                playlistSize: playlistSize ?? 40,
                maxRetryAttempts: maxRetryAttempts ?? 3,
                enabled: enabled ?? true,
            },
            update: {
                ...(playlistSize !== undefined && {
                    playlistSize: parseInt(playlistSize, 10),
                }),
                ...(maxRetryAttempts !== undefined && {
                    maxRetryAttempts: parseInt(maxRetryAttempts, 10),
                }),
                ...(enabled !== undefined && { enabled }),
            },
        });

        res.json(config);
    } catch (error) {
        console.error("Update Discover Weekly config error:", error);
        res.status(500).json({ error: "Failed to update configuration" });
    }
});

// GET /discover/popular-artists - Get popular artists from Last.fm charts
router.get("/popular-artists", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;

        const artists = await lastFmService.getTopChartArtists(limit);

        res.json({ artists });
    } catch (error: any) {
        console.error("[Discover] Get popular artists error:", error?.message || error);
        // Return empty array instead of 500 - allows homepage to still render
        res.json({ artists: [] });
    }
});

// DELETE /discover/clear - Clear the discovery playlist (move liked to library, delete the rest)
router.delete("/clear", async (req, res) => {
    try {
        const userId = req.user!.id;

        console.log(`\n Clearing Discover Weekly playlist for user ${userId}`);

        // Get all discovery albums for this user
        const discoveryAlbums = await prisma.discoveryAlbum.findMany({
            where: {
                userId,
                status: { in: ["ACTIVE", "LIKED"] },
            },
        });

        if (discoveryAlbums.length === 0) {
            return res.json({
                success: true,
                message: "No discovery albums to clear",
                likedMoved: 0,
                activeDeleted: 0,
            });
        }

        const likedAlbums = discoveryAlbums.filter((a) => a.status === "LIKED");
        const activeAlbums = discoveryAlbums.filter(
            (a) => a.status === "ACTIVE"
        );

        console.log(
            `  Found ${likedAlbums.length} liked albums to move to library`
        );
        console.log(`  Found ${activeAlbums.length} active albums to delete`);

        // Get system settings for Lidarr
        const { getSystemSettings } = await import("../utils/systemSettings");
        const settings = await getSystemSettings();

        let likedMoved = 0;
        let activeDeleted = 0;

        // Process liked albums - move to library
        if (likedAlbums.length > 0) {
            console.log(`\n📚 Moving liked albums to library...`);

            for (const album of likedAlbums) {
                try {
                    // Find the album in the database by matching artist + title
                    const dbAlbum = await prisma.album.findFirst({
                        where: {
                            title: album.albumTitle,
                            artist: { name: album.artistName },
                        },
                        include: { artist: true },
                    });

                    if (dbAlbum) {
                        // Update album location to LIBRARY
                        await prisma.album.update({
                            where: { id: dbAlbum.id },
                            data: { location: "LIBRARY" },
                        });

                        // Create OwnedAlbum record if doesn't exist
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
                            update: {}, // No update needed if exists
                        });

                        // If Lidarr is enabled, move the album files to main library
                        if (
                            settings.lidarrEnabled &&
                            settings.lidarrUrl &&
                            settings.lidarrApiKey &&
                            album.lidarrAlbumId
                        ) {
                            const axios = (await import("axios")).default;

                            try {
                                // Get album details from Lidarr
                                const albumResponse = await axios.get(
                                    `${settings.lidarrUrl}/api/v1/album/${album.lidarrAlbumId}`,
                                    {
                                        headers: {
                                            "X-Api-Key": settings.lidarrApiKey,
                                        },
                                        timeout: 10000,
                                    }
                                );

                                const artistId = albumResponse.data.artistId;

                                // Get artist details
                                const artistResponse = await axios.get(
                                    `${settings.lidarrUrl}/api/v1/artist/${artistId}`,
                                    {
                                        headers: {
                                            "X-Api-Key": settings.lidarrApiKey,
                                        },
                                        timeout: 10000,
                                    }
                                );

                                // Update artist's root folder path to main library if in discovery
                                if (
                                    artistResponse.data.path?.includes(
                                        "/music/discovery"
                                    )
                                ) {
                                    // Move artist to main library path
                                    await axios.put(
                                        `${settings.lidarrUrl}/api/v1/artist/${artistId}`,
                                        {
                                            ...artistResponse.data,
                                            path: artistResponse.data.path.replace(
                                                "/music/discovery",
                                                "/music"
                                            ),
                                            moveFiles: true,
                                        },
                                        {
                                            headers: {
                                                "X-Api-Key":
                                                    settings.lidarrApiKey,
                                            },
                                            timeout: 30000,
                                        }
                                    );
                                    console.log(
                                        `    Moved to library: ${album.artistName} - ${album.albumTitle}`
                                    );
                                }
                            } catch (lidarrError: any) {
                                console.log(
                                    `  Lidarr move failed for ${album.albumTitle}: ${lidarrError.message}`
                                );
                            }
                        }

                        likedMoved++;
                    }

                    // Mark as MOVED in discovery database
                    await prisma.discoveryAlbum.update({
                        where: { id: album.id },
                        data: { status: "MOVED" },
                    });
                } catch (error: any) {
                    console.error(
                        `  ✗ Failed to move ${album.albumTitle}: ${error.message}`
                    );
                }
            }
        }

        // Process active (non-liked) albums - delete them
        if (activeAlbums.length > 0) {
            console.log(`\n[CLEANUP] Deleting non-liked albums...`);

            const checkedArtistIds = new Set<number>();

            for (const album of activeAlbums) {
                try {
                    // Remove from Lidarr if enabled
                    if (
                        settings.lidarrEnabled &&
                        settings.lidarrUrl &&
                        settings.lidarrApiKey &&
                        album.lidarrAlbumId
                    ) {
                        const axios = (await import("axios")).default;

                        try {
                            // Get album details to find artist ID
                            let artistId: number | undefined;
                            try {
                                const albumResponse = await axios.get(
                                    `${settings.lidarrUrl}/api/v1/album/${album.lidarrAlbumId}`,
                                    {
                                        headers: {
                                            "X-Api-Key": settings.lidarrApiKey,
                                        },
                                        timeout: 10000,
                                    }
                                );
                                artistId = albumResponse.data.artistId;
                            } catch (e: any) {
                                if (e.response?.status !== 404) throw e;
                            }

                            // Delete album from Lidarr
                            await axios.delete(
                                `${settings.lidarrUrl}/api/v1/album/${album.lidarrAlbumId}`,
                                {
                                    params: { deleteFiles: true },
                                    headers: {
                                        "X-Api-Key": settings.lidarrApiKey,
                                    },
                                    timeout: 10000,
                                }
                            );
                            console.log(
                                `    Deleted from Lidarr: ${album.albumTitle}`
                            );

                            // Check if artist should be removed too
                            if (artistId && !checkedArtistIds.has(artistId)) {
                                checkedArtistIds.add(artistId);

                                try {
                                    const artistResponse = await axios.get(
                                        `${settings.lidarrUrl}/api/v1/artist/${artistId}`,
                                        {
                                            headers: {
                                                "X-Api-Key":
                                                    settings.lidarrApiKey,
                                            },
                                            timeout: 10000,
                                        }
                                    );

                                    const artist = artistResponse.data;
                                    const artistMbid = artist.foreignArtistId;

                                    // Check if artist has any LIBRARY albums in our database
                                    const hasLibraryAlbums =
                                        await prisma.album.findFirst({
                                            where: {
                                                artist: { mbid: artistMbid },
                                                location: "LIBRARY",
                                            },
                                        });

                                    // Check if artist has any LIKED/MOVED discovery albums
                                    const hasKeptDiscoveryAlbums =
                                        await prisma.discoveryAlbum.findFirst({
                                            where: {
                                                artistMbid: artistMbid,
                                                status: {
                                                    in: ["LIKED", "MOVED"],
                                                },
                                            },
                                        });

                                    // Only remove artist if they have no library albums and no kept discovery albums
                                    if (
                                        !hasLibraryAlbums &&
                                        !hasKeptDiscoveryAlbums
                                    ) {
                                        await axios.delete(
                                            `${settings.lidarrUrl}/api/v1/artist/${artistId}`,
                                            {
                                                params: { deleteFiles: true },
                                                headers: {
                                                    "X-Api-Key":
                                                        settings.lidarrApiKey,
                                                },
                                                timeout: 10000,
                                            }
                                        );
                                        console.log(
                                            `    Removed artist from Lidarr: ${artist.artistName}`
                                        );
                                    } else {
                                        console.log(
                                            `    Keeping artist in Lidarr: ${artist.artistName} (has library or kept albums)`
                                        );
                                    }
                                } catch (e: any) {
                                    // Artist might have other albums
                                }
                            }
                        } catch (lidarrError: any) {
                            if (lidarrError.response?.status !== 404) {
                                console.log(
                                    `  Lidarr delete failed for ${album.albumTitle}: ${lidarrError.message}`
                                );
                            }
                        }
                    }

                    // Delete DiscoveryTrack records first (foreign key to Track)
                    await prisma.discoveryTrack.deleteMany({
                        where: { discoveryAlbumId: album.id },
                    });

                    // Remove from local database
                    const dbAlbum = await prisma.album.findFirst({
                        where: {
                            title: album.albumTitle,
                            artist: { name: album.artistName },
                            location: "DISCOVER",
                        },
                        include: { tracks: true },
                    });

                    if (dbAlbum) {
                        // Delete tracks first
                        await prisma.track.deleteMany({
                            where: { albumId: dbAlbum.id },
                        });

                        // Delete album
                        await prisma.album.delete({
                            where: { id: dbAlbum.id },
                        });
                    }

                    // Mark as DELETED in discovery database
                    await prisma.discoveryAlbum.update({
                        where: { id: album.id },
                        data: { status: "DELETED" },
                    });

                    activeDeleted++;
                } catch (error: any) {
                    console.error(
                        `  ✗ Failed to delete ${album.albumTitle}: ${error.message}`
                    );
                }
            }
        }

        // Clean up unavailable albums for this user
        await prisma.unavailableAlbum.deleteMany({
            where: { userId },
        });

        // === PHASE 2: Clean up orphaned discovery records ===
        // These are Album/Track records with location="DISCOVER" that weren't linked to a DiscoveryAlbum
        // This can happen if downloads failed or playlist build failed
        console.log(`\n Cleaning up orphaned discovery records...`);

        // Find all DISCOVER albums that don't have a corresponding DiscoveryAlbum record
        const orphanedAlbums = await prisma.album.findMany({
            where: {
                location: "DISCOVER",
            },
            include: { artist: true, tracks: true },
        });

        let orphanedAlbumsDeleted = 0;
        for (const orphanAlbum of orphanedAlbums) {
            // Check if there's a DiscoveryAlbum record for this
            const hasDiscoveryRecord = await prisma.discoveryAlbum.findFirst({
                where: {
                    OR: [
                        { rgMbid: orphanAlbum.rgMbid },
                        {
                            albumTitle: orphanAlbum.title,
                            artistName: orphanAlbum.artist.name,
                        },
                    ],
                    status: { in: ["ACTIVE", "LIKED"] }, // Keep if active or liked
                },
            });

            if (!hasDiscoveryRecord) {
                // Delete tracks first
                await prisma.track.deleteMany({
                    where: { albumId: orphanAlbum.id },
                });
                // Delete album
                await prisma.album.delete({
                    where: { id: orphanAlbum.id },
                });
                orphanedAlbumsDeleted++;
                console.log(
                    `    Deleted orphaned album: ${orphanAlbum.artist.name} - ${orphanAlbum.title}`
                );
            }
        }

        if (orphanedAlbumsDeleted > 0) {
            console.log(
                `  Cleaned up ${orphanedAlbumsDeleted} orphaned discovery albums`
            );
        }

        // Clean up orphaned artists (artists with no albums)
        const orphanedArtists = await prisma.artist.findMany({
            where: {
                albums: { none: {} },
            },
        });

        if (orphanedArtists.length > 0) {
            // Delete artist relations first (SimilarArtist records)
            await prisma.similarArtist.deleteMany({
                where: {
                    OR: [
                        { artistId: { in: orphanedArtists.map((a) => a.id) } },
                        {
                            similarArtistId: {
                                in: orphanedArtists.map((a) => a.id),
                            },
                        },
                    ],
                },
            });

            await prisma.artist.deleteMany({
                where: { id: { in: orphanedArtists.map((a) => a.id) } },
            });
            console.log(
                `  Cleaned up ${orphanedArtists.length} orphaned artists`
            );
        }

        // Clean up orphaned DiscoveryTrack records (tracks whose album was deleted)
        const orphanedDiscoveryTracks = await prisma.discoveryTrack.deleteMany({
            where: {
                trackId: null, // Track was deleted but DiscoveryTrack record remains
            },
        });

        if (orphanedDiscoveryTracks.count > 0) {
            console.log(
                `  Cleaned up ${orphanedDiscoveryTracks.count} orphaned discovery track records`
            );
        }

        // Clean up old DiscoveryAlbum records that are DELETED or MOVED (older than 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oldDiscoveryAlbums = await prisma.discoveryAlbum.deleteMany({
            where: {
                userId,
                status: { in: ["DELETED", "MOVED"] },
                downloadedAt: { lt: thirtyDaysAgo },
            },
        });

        if (oldDiscoveryAlbums.count > 0) {
            console.log(
                `  Cleaned up ${oldDiscoveryAlbums.count} old discovery album records`
            );
        }

        console.log(
            `\nClear complete: ${likedMoved} moved to library, ${activeDeleted} deleted, ${orphanedAlbumsDeleted} orphans cleaned`
        );

        res.json({
            success: true,
            message: "Discovery playlist cleared",
            likedMoved,
            activeDeleted,
            orphanedAlbumsDeleted,
        });
    } catch (error) {
        console.error("Clear discovery playlist error:", error);
        res.status(500).json({ error: "Failed to clear discovery playlist" });
    }
});

export default router;
