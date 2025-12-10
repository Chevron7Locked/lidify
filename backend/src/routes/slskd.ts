import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { slskdService } from "../services/slskd";
import { getSystemSettings } from "../utils/systemSettings";
import { queueOrganizeSingles } from "../workers/organizeSingles";
import fs from "fs";
import path from "path";

const router = Router();

// Middleware to check if Slskd is enabled
async function requireSlskdEnabled(req: any, res: any, next: any) {
    try {
        const settings = await getSystemSettings();

        if (!settings?.slskdEnabled) {
            return res.status(403).json({
                error: "Soulseek integration is not enabled. Enable it in System Settings.",
            });
        }

        next();
    } catch (error) {
        console.error("Error checking Slskd settings:", error);
        res.status(500).json({ error: "Failed to check settings" });
    }
}

// Check if Slskd is available
router.get("/status", requireAuth, requireSlskdEnabled, async (req, res) => {
    try {
        const status = await slskdService.getStatus();
        res.json(status);
    } catch (error: any) {
        console.error("Slskd status error:", error.message);
        res.status(500).json({
            error: "Failed to get Slskd status",
            details: error.message,
        });
    }
});

// Start a search
router.post("/search", requireAuth, requireSlskdEnabled, async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: "Search query is required" });
        }

        console.log(`[SLSKD] Starting search: "${query}"`);
        const searchId = await slskdService.search(query);

        res.json({
            searchId,
            message: "Search started. Poll for results using the searchId.",
        });
    } catch (error: any) {
        console.error("Slskd search error:", error.message);
        res.status(500).json({
            error: "Failed to start search",
            details: error.message,
        });
    }
});

// Get search results
router.get(
    "/search/:searchId",
    requireAuth,
    requireSlskdEnabled,
    async (req, res) => {
        try {
            const { searchId } = req.params;

            const results = await slskdService.getSearchResults(searchId);

            console.log(`[SLSKD] Got ${results.length} raw results from Slskd`);

            // Format results for frontend and filter out invalid entries
            const formatted = results
                .map((result: any) => {
                    // Try to parse artist from folder structure
                    // Format: @@user\path\Artist\Album\Track.ext
                    const filenameParts = result.filename.split("\\");
                    let parsedArtist = null;
                    let parsedAlbum = null;

                    // Filter out common folder names that aren't artists
                    const ignoreFolders = [
                        "music",
                        "audio",
                        "downloads",
                        "complete",
                        "flac",
                        "mp3",
                        "albums",
                        "tracks",
                        "various",
                        "compilation",
                    ];

                    if (filenameParts.length >= 3) {
                        // First, check if album folder has "Artist - Album" format
                        const possibleAlbum =
                            filenameParts[filenameParts.length - 2];

                        if (possibleAlbum && possibleAlbum.includes(" - ")) {
                            const albumParts = possibleAlbum.split(" - ");
                            parsedArtist = albumParts[0].trim();
                            parsedAlbum = albumParts
                                .slice(1)
                                .join(" - ")
                                .trim();
                        }

                        // If no artist found from album folder, search up the folder tree
                        if (!parsedArtist) {
                            // Start from 3rd from last and work backwards
                            for (
                                let i = filenameParts.length - 3;
                                i >= 0;
                                i--
                            ) {
                                const folder = filenameParts[i];
                                if (
                                    folder &&
                                    !ignoreFolders.includes(
                                        folder.toLowerCase()
                                    ) &&
                                    !folder.startsWith("@@") // Skip user folders
                                ) {
                                    parsedArtist = folder;
                                    // Use the album folder if we haven't set it yet
                                    if (!parsedAlbum) {
                                        parsedAlbum = possibleAlbum;
                                    }
                                    break;
                                }
                            }
                        } else {
                            // We got artist from album folder, set the album
                            if (!parsedAlbum) {
                                parsedAlbum = possibleAlbum;
                            }
                        }
                    }

                    // If no artist found in folders, try filename
                    if (!parsedArtist) {
                        const lastPart =
                            filenameParts[filenameParts.length - 1];
                        if (lastPart.includes(" - ")) {
                            const parts = lastPart.split(" - ");
                            parsedArtist = parts[0]
                                .replace(/^\d+\.?\s*/, "")
                                .trim(); // Remove track numbers
                        }
                    }

                    return {
                        username: result.username,
                        filename: result.filename,
                        size: result.size,
                        bitrate: result.bitRate,
                        sampleRate: result.sampleRate,
                        bitDepth: result.bitDepth,
                        duration: result.length,
                        format: result.extension,
                        path: result.filename,
                        isLocked: result.isLocked,
                        speed: result.uploadSpeed,
                        queueLength: result.queueLength,
                        parsedArtist: parsedArtist,
                        parsedAlbum: parsedAlbum,
                    };
                })
                .filter((result: any) => {
                    // Filter out results without valid filenames
                    if (!result.filename || result.filename.trim() === "") {
                        return false;
                    }
                    // Filter out results without artist info
                    if (
                        !result.parsedArtist ||
                        result.parsedArtist.trim() === ""
                    ) {
                        return false;
                    }
                    return true;
                });

            console.log(`[SLSKD] After filtering: ${formatted.length} results`);

            res.json({
                results: formatted,
                count: formatted.length,
            });
        } catch (error: any) {
            console.error("Slskd search results error:", error.message);
            res.status(500).json({
                error: "Failed to get search results",
                details: error.message,
            });
        }
    }
);

// Download a file
router.post("/download", requireAuth, requireSlskdEnabled, async (req, res) => {
    try {
        const { username, filepath, filename, size, artist, album } = req.body;

        if (!username || !filepath) {
            return res.status(400).json({
                error: "Username and filepath are required",
            });
        }

        console.log(
            `[SLSKD] Starting download: ${
                filename || filepath
            } from ${username}${size ? ` (${size} bytes)` : ""}${
                artist ? ` [Artist: ${artist}]` : ""
            }${album ? ` [Album: ${album}]` : ""}`
        );

        await slskdService.download(username, filepath, size);

        // Store metadata for organization script (if provided)
        if (artist || album || filename) {
            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();
            const musicPath = process.env.MUSIC_PATH;

            if (musicPath) {
                const metadataPath = `${musicPath}/Soulseek/.metadata.json`;
                const fs = require("fs");
                const path = require("path");

                try {
                    let metadata = {};
                    if (fs.existsSync(metadataPath)) {
                        metadata = JSON.parse(
                            fs.readFileSync(metadataPath, "utf-8")
                        );
                    }

                    // Use filename as key (will be matched when organizing)
                    const key = filename || path.basename(filepath);
                    metadata[key] = {
                        artist: artist || null,
                        album: album || null,
                        filename: filename || null,
                        downloadedAt: new Date().toISOString(),
                    };

                    fs.writeFileSync(
                        metadataPath,
                        JSON.stringify(metadata, null, 2),
                        "utf-8"
                    );
                    console.log(`[SLSKD] Stored metadata for: ${key}`);
                } catch (err) {
                    console.warn("[SLSKD] Failed to store metadata:", err);
                }
            }
        }

        // Queue organization task (will poll for download completion)
        // Wait a moment for Slskd to register the download before checking
        console.log(
            "[SLSKD] Queueing organization task (waiting 5s for download registration)..."
        );
        setTimeout(() => {
            queueOrganizeSingles().catch((err) => {
                console.error("[SLSKD] Organization task failed:", err);
            });
        }, 5000);

        res.json({
            success: true,
            message: "Download started",
            filename: filename || filepath,
        });
    } catch (error: any) {
        console.error("Slskd download error:", error.message);
        res.status(500).json({
            error: "Failed to start download",
            details: error.message,
        });
    }
});

// Get active downloads
router.get("/downloads", requireAuth, requireSlskdEnabled, async (req, res) => {
    try {
        const downloads = await slskdService.getDownloads();

        res.json({
            downloads,
            count: downloads.length,
        });
    } catch (error: any) {
        console.error("Slskd downloads error:", error.message);
        res.status(500).json({
            error: "Failed to get downloads",
            details: error.message,
        });
    }
});

export default router;
