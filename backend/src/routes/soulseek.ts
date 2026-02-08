import { logger } from "../utils/logger";

/**
 * Soulseek routes - Direct connection via vendored soulseek-ts
 * Supports both general searches (for UI) and track-specific searches (for downloads)
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { soulseekService, SearchResult } from "../services/soulseek";
import { getSystemSettings } from "../utils/systemSettings";
import { randomUUID } from "crypto";

const router = Router();

// In-memory store for search results (with TTL cleanup)
interface SearchSession {
    query: string;
    results: SearchResult[];
    createdAt: Date;
}

const searchSessions = new Map<string, SearchSession>();
const SEARCH_SESSION_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup old search sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [searchId, session] of searchSessions.entries()) {
        if (now - session.createdAt.getTime() > SEARCH_SESSION_TTL) {
            searchSessions.delete(searchId);
        }
    }
}, 60000);

// Middleware to check if Soulseek credentials are configured
async function requireSoulseekConfigured(req: any, res: any, next: any) {
    try {
        const available = await soulseekService.isAvailable();

        if (!available) {
            return res.status(403).json({
                error: "Soulseek credentials not configured. Add username/password in System Settings.",
            });
        }

        next();
    } catch (error) {
        logger.error("Error checking Soulseek settings:", error);
        res.status(500).json({ error: "Failed to check settings" });
    }
}

/**
 * GET /soulseek/status
 * Check connection status
 */
router.get("/status", requireAuth, async (req, res) => {
    try {
        const available = await soulseekService.isAvailable();

        if (!available) {
            return res.json({
                enabled: false,
                connected: false,
                message: "Soulseek credentials not configured",
            });
        }

        const status = await soulseekService.getStatus();

        res.json({
            enabled: true,
            connected: status.connected,
            username: status.username,
        });
    } catch (error: any) {
        logger.error("Soulseek status error:", error.message);
        res.status(500).json({
            error: "Failed to get Soulseek status",
            details: error.message,
        });
    }
});

/**
 * POST /soulseek/connect
 * Manually trigger connection to Soulseek network
 */
router.post(
    "/connect",
    requireAuth,
    requireSoulseekConfigured,
    async (req, res) => {
        try {
            await soulseekService.connect();

            res.json({
                success: true,
                message: "Connected to Soulseek network",
            });
        } catch (error: any) {
            logger.error("Soulseek connect error:", error.message);
            res.status(500).json({
                error: "Failed to connect to Soulseek",
                details: error.message,
            });
        }
    },
);

/**
 * POST /soulseek/search
 * General search - supports both freeform queries and track-specific searches
 * Returns a searchId for polling results (async pattern)
 */
router.post(
    "/search",
    requireAuth,
    requireSoulseekConfigured,
    async (req, res) => {
        try {
            const { query, artist, title } = req.body;

            // Support both query formats for backward compatibility
            let searchQuery: string;

            if (query) {
                // General search (from UI search bar)
                searchQuery = query;
            } else if (artist && title) {
                // Track-specific search (for downloads)
                searchQuery = `${artist} ${title}`;
            } else {
                return res.status(400).json({
                    error: "Either 'query' or both 'artist' and 'title' are required",
                });
            }

            logger.debug(
                `[Soulseek] Starting general search: "${searchQuery}"`,
            );

            // Create search session
            const searchId = randomUUID();
            searchSessions.set(searchId, {
                query: searchQuery,
                results: [],
                createdAt: new Date(),
            });

            // Start async search (don't await - results come in over time)
            // Use full 45s timeout for quality results from P2P network
            soulseekService
                .searchTrack(searchQuery, "")
                .then((result) => {
                    const session = searchSessions.get(searchId);
                    if (session && result.found && result.allMatches) {
                        logger.debug(
                            `[Soulseek] Search ${searchId} found ${result.allMatches.length} matches`,
                        );
                        // Store all matches for polling
                        session.results = result.allMatches.map((match) => ({
                            user: match.username,
                            file: match.fullPath,
                            size: match.size,
                            slots: true, // Assume available since ranked
                            bitrate: match.bitRate,
                            speed: 0,
                        }));
                        logger.debug(
                            `[Soulseek] Search ${searchId} session updated with ${session.results.length} results`,
                        );
                    } else {
                        logger.debug(
                            `[Soulseek] Search ${searchId} completed with no matches (found: ${result.found})`,
                        );
                    }
                })
                .catch((err) => {
                    logger.error(
                        `[Soulseek] Search ${searchId} failed:`,
                        err.message,
                    );
                });

            res.json({
                searchId,
                message: "Search started",
            });
        } catch (error: any) {
            logger.error("Soulseek search error:", error.message);
            res.status(500).json({
                error: "Search failed",
                details: error.message,
            });
        }
    },
);

/**
 * GET /soulseek/search/:searchId
 * Get results for an ongoing search
 */
router.get("/search/:searchId", requireAuth, async (req, res) => {
    try {
        const { searchId } = req.params;
        const session = searchSessions.get(searchId);

        if (!session) {
            return res.status(404).json({
                error: "Search not found or expired",
                results: [],
                count: 0,
            });
        }

        // Format results for frontend
        const formattedResults = session.results.map((r) => {
            const filename = r.file.split(/[/\\]/).pop() || r.file;
            const format =
                filename.toLowerCase().endsWith(".flac") ? "flac" : "mp3";

            // Try to parse artist and album from path
            const pathParts = r.file.split(/[/\\]/);
            const parsedArtist =
                pathParts.length > 2 ?
                    pathParts[pathParts.length - 3]
                :   undefined;
            const parsedAlbum =
                pathParts.length > 1 ?
                    pathParts[pathParts.length - 2]
                :   undefined;

            // Extract title from filename: strip extension, track number prefix, and leading dash/space
            const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
            const parsedTitle = nameWithoutExt
                .replace(/^\d+[\s.\-_]*/, "") // Remove leading track number
                .replace(/^\s*-\s*/, "") // Remove leading dash
                .trim() || undefined;

            return {
                username: r.user,
                path: r.file,
                filename,
                size: r.size,
                bitrate: r.bitrate || 0,
                format,
                parsedArtist,
                parsedAlbum,
                parsedTitle,
            };
        });

        res.json({
            results: formattedResults,
            count: formattedResults.length,
        });
    } catch (error: any) {
        logger.error("Get search results error:", error.message);
        res.status(500).json({
            error: "Failed to get results",
            details: error.message,
        });
    }
});

/**
 * POST /soulseek/download
 * Download a track directly
 */
router.post(
    "/download",
    requireAuth,
    requireSoulseekConfigured,
    async (req, res) => {
        try {
            const { artist, title, album, filepath, filename } = req.body;

            // Derive artist/title from filename if not provided
            let resolvedArtist = artist;
            let resolvedTitle = title;

            if (!resolvedArtist || !resolvedTitle) {
                // Try to extract from filename (strip extension and track number)
                const name = (filename || filepath?.split(/[/\\]/).pop() || "")
                    .replace(/\.[^.]+$/, "")
                    .replace(/^\d+[\s.\-_]*/, "")
                    .trim();

                if (!resolvedTitle) resolvedTitle = name || "Unknown";
                if (!resolvedArtist) resolvedArtist = "Unknown";
                logger.warn(`[Soulseek] Derived artist/title from filename: "${resolvedArtist}" - "${resolvedTitle}"`);
            }

            const settings = await getSystemSettings();
            const musicPath = settings?.musicPath;

            if (!musicPath) {
                return res.status(400).json({
                    error: "Music path not configured",
                });
            }

            logger.debug(`[Soulseek] Downloading: "${resolvedArtist} - ${resolvedTitle}"`);

            const result = await soulseekService.searchAndDownload(
                resolvedArtist,
                resolvedTitle,
                album || "Unknown Album",
                musicPath,
            );

            if (result.success) {
                res.json({
                    success: true,
                    filePath: result.filePath,
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: result.error || "Download failed",
                });
            }
        } catch (error: any) {
            logger.error("Soulseek download error:", error.message);
            res.status(500).json({
                error: "Download failed",
                details: error.message,
            });
        }
    },
);

/**
 * POST /soulseek/disconnect
 * Disconnect from Soulseek network
 */
router.post("/disconnect", requireAuth, async (req, res) => {
    try {
        soulseekService.disconnect();
        res.json({ success: true, message: "Disconnected" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
