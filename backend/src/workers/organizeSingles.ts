import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import axios from "axios";
import { musicbrainzService } from "../services/musicbrainz";
import { lastfmService } from "../services/lastfm";

interface AlbumMatch {
    artist: string;
    album: string;
    releaseType: "album" | "ep" | "single";
    trackCount: number;
    mbid?: string;
    confidence: number;
}

/**
 * Check if a track belongs to an album using MusicBrainz and Last.fm
 */
async function identifyAlbum(
    artist: string,
    title: string
): Promise<AlbumMatch | null> {
    try {
        console.log(`[ALBUM-DETECT] Checking: ${artist} - ${title}`);

        // First try MusicBrainz (most accurate)
        try {
            const mbResults = await musicbrainzService.searchRecording(
                title,
                artist
            );

            if (mbResults && mbResults.length > 0) {
                const recording = mbResults[0];

                // Get release info
                if (recording.releases && recording.releases.length > 0) {
                    const release = recording.releases[0];

                    const albumMatch: AlbumMatch = {
                        artist: release["artist-credit"]
                            ? release["artist-credit"][0].name
                            : artist,
                        album: release.title,
                        releaseType: (release["release-group"]?.[
                            "primary-type"
                        ]?.toLowerCase() || "album") as any,
                        trackCount: release["track-count"] || 1,
                        mbid: release.id,
                        confidence: 0.9,
                    };

                    console.log(
                        `[ALBUM-DETECT] MusicBrainz match: ${albumMatch.album} (${albumMatch.releaseType})`
                    );
                    return albumMatch;
                }
            }
        } catch (mbError) {
            console.error("[ALBUM-DETECT] MusicBrainz error:", mbError);
        }

        // Fallback to Last.fm
        try {
            const trackInfo = await lastfmService.getTrackInfo(artist, title);

            if (trackInfo && trackInfo.album) {
                const albumInfo = await lastfmService.getAlbumInfo(
                    artist,
                    trackInfo.album.title
                );

                if (albumInfo) {
                    // Determine release type based on track count
                    let releaseType: "album" | "ep" | "single" = "album";
                    const trackCount = albumInfo.tracks?.track?.length || 1;

                    if (trackCount === 1) {
                        releaseType = "single";
                    } else if (trackCount <= 6) {
                        releaseType = "ep";
                    }

                    const albumMatch: AlbumMatch = {
                        artist: albumInfo.artist,
                        album: albumInfo.name,
                        releaseType,
                        trackCount,
                        mbid: albumInfo.mbid,
                        confidence: 0.7,
                    };

                    console.log(
                        `[ALBUM-DETECT] Last.fm match: ${albumMatch.album} (${albumMatch.releaseType})`
                    );
                    return albumMatch;
                }
            }
        } catch (lfmError) {
            console.error("[ALBUM-DETECT] Last.fm error:", lfmError);
        }

        console.log(`[ALBUM-DETECT] No album match found, treating as single`);
        return null;
    } catch (error) {
        console.error("[ALBUM-DETECT] Error:", error);
        return null;
    }
}

/**
 * Run the organize-singles bash script
 */
export async function organizeSingles(): Promise<void> {
    return new Promise(async (resolve, reject) => {
        const script = path.join(process.cwd(), "..", "organize-singles.sh");

        // Get music path from environment variable (host path)
        // The database stores container paths (/music), but the script runs on the host
        // and needs the actual host filesystem path
        // Try multiple sources: env var, .env file, or check docker-compose
        let musicPath = process.env.MUSIC_PATH;

        // If not in env, try reading from .env file in project root
        if (!musicPath) {
            try {
                const envPath = path.join(process.cwd(), "..", ".env");
                const envContent = fs.readFileSync(envPath, "utf-8");
                const match = envContent.match(/^MUSIC_PATH=(.+)$/m);
                if (match) {
                    musicPath = match[1].trim().replace(/^["']|["']$/g, ""); // Remove quotes
                }
            } catch (error) {
                // .env file doesn't exist or can't be read
            }
        }

        if (!musicPath) {
            const error =
                "MUSIC_PATH is not set in environment or .env file. Cannot organize downloads. Please set MUSIC_PATH to your music directory path (e.g., C:/Users/YourName/Music on Windows or /home/user/music on Linux).";
            console.error(`[ORGANIZE] ${error}`);
            throw new Error(error);
        }

        // Path normalization: bash scripts handle platform-specific paths
        // On Windows with Git Bash, /c/Users/... format works fine
        // On Unix systems, forward slashes are standard
        // Just ensure consistent format for logging
        const normalizedPath = musicPath.replace(/\\/g, "/");

        console.log(`[ORGANIZE] Running organize-singles script...`);
        console.log(`[ORGANIZE] Music path: ${normalizedPath}`);
        console.log(
            `[ORGANIZE] Downloads directory: ${normalizedPath}/Soulseek`
        );

        const childProcess = spawn("bash", [script], {
            env: {
                ...process.env,
                MUSIC_PATH: normalizedPath,
                LIDIFY_API_URL:
                    process.env.API_URL ||
                    process.env.NEXT_PUBLIC_API_URL ||
                    "http://localhost:3006",
            },
        });

        let output = "";

        childProcess.stdout?.on("data", (data) => {
            output += data.toString();
        });

        childProcess.stderr?.on("data", (data) => {
            console.error("[ORGANIZE]", data.toString());
        });

        childProcess.on("close", async (code) => {
            if (code === 0) {
                console.log("[ORGANIZE] Script completed successfully");
                console.log(output);

                // Trigger Lidify library sync after organization completes
                try {
                    console.log("[ORGANIZE] Triggering Lidify library sync...");
                    const { syncLibrary } = await import("../workers/sync");
                    // Don't await - run in background
                    syncLibrary().catch((err) => {
                        console.error("[ORGANIZE] Lidify sync failed:", err);
                    });
                    console.log("[ORGANIZE] Lidify sync triggered");
                } catch (err) {
                    console.warn(
                        "[ORGANIZE] Failed to trigger Lidify sync:",
                        err
                    );
                }

                resolve();
            } else {
                reject(new Error(`Script exited with code ${code}`));
            }
        });
    });
}

/**
 * Queue organization task
 * This runs after downloads complete and intelligently organizes tracks
 */
export async function queueOrganizeSingles(): Promise<void> {
    console.log("[ORGANIZE] Queueing organization task...");

    // Poll for download completion instead of using a fixed timeout
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
    const pollInterval = 5000; // Check every 5 seconds
    const startTime = Date.now();

    const checkDownloads = async () => {
        try {
            const { slskdService } = await import("../services/slskd");
            const downloads = await slskdService.getDownloads();

            console.log(
                `[ORGANIZE] Checking downloads... Found ${downloads.length} total download(s)`
            );
            if (downloads.length > 0) {
                downloads.forEach((d: any, idx: number) => {
                    console.log(
                        `[ORGANIZE] Download ${idx + 1}: state="${
                            d.state
                        }", filename="${d.filename || d.name || "unknown"}"`
                    );
                });
            }

            // Check if there are any in-progress downloads
            const activeDownloads = downloads.filter(
                (d: any) =>
                    d.state === "InProgress" ||
                    d.state === "Queued" ||
                    d.state === "Initializing" ||
                    d.state === "Pending" ||
                    d.state === "Requested"
            );

            // Also check for recently completed downloads (might still be writing)
            const recentlyCompleted = downloads.filter(
                (d: any) =>
                    d.state === "Completed" &&
                    d.completedAt &&
                    Date.now() - new Date(d.completedAt).getTime() < 30000 // Completed less than 30 seconds ago
            );

            if (
                activeDownloads.length === 0 &&
                recentlyCompleted.length === 0
            ) {
                // All downloads complete and files have had time to finish writing
                console.log(
                    `[ORGANIZE] All downloads complete (${downloads.length} total), waiting 5 seconds for file writes to finish...`
                );
                // Wait a bit more to ensure files are fully written
                setTimeout(async () => {
                    await organizeSingles();
                    console.log("Singles organized");
                }, 5000);
                return;
            }

            if (activeDownloads.length === 0 && recentlyCompleted.length > 0) {
                // Downloads just completed, wait for files to finish writing
                console.log(
                    `[ORGANIZE] ${recentlyCompleted.length} download(s) recently completed, waiting for file writes to finish...`
                );
                setTimeout(checkDownloads, pollInterval);
                return;
            }

            // Check if we've exceeded max wait time
            if (Date.now() - startTime > maxWaitTime) {
                console.log(
                    "[ORGANIZE] Max wait time exceeded, organizing anyway..."
                );
                await organizeSingles();
                console.log("Singles organized (timed out)");
                return;
            }

            // Still downloading, check again soon
            console.log(
                `[ORGANIZE] ${activeDownloads.length} download(s) still in progress, waiting...`
            );
            setTimeout(checkDownloads, pollInterval);
        } catch (error) {
            console.error("[ORGANIZE] Error checking download status:", error);
            // If we can't check status, just organize anyway after a delay
            setTimeout(async () => {
                try {
                    await organizeSingles();
                    console.log("Singles organized (fallback)");
                } catch (orgError) {
                    console.error("Failed to organize singles:", orgError);
                }
            }, 60000); // Wait 1 minute as fallback
        }
    };

    // Start checking after initial delay
    setTimeout(checkDownloads, 10000); // Start checking after 10 seconds
}

/**
 * Smart organize with album detection
 * This is called manually or after batch downloads
 */
export async function smartOrganize(
    tracks: { artist: string; title: string }[]
): Promise<void> {
    console.log(`[SMART-ORGANIZE] Analyzing ${tracks.length} track(s)...`);

    const albumGroups = new Map<string, AlbumMatch>();

    // Identify albums for each track
    for (const track of tracks) {
        const albumMatch = await identifyAlbum(track.artist, track.title);

        if (albumMatch && albumMatch.releaseType !== "single") {
            const key = `${albumMatch.artist}:${albumMatch.album}`;
            albumGroups.set(key, albumMatch);
        }
    }

    console.log(
        `[SMART-ORGANIZE] Found ${albumGroups.size} potential album(s)/EP(s)`
    );

    // Log findings
    albumGroups.forEach((match, key) => {
        console.log(
            `[SMART-ORGANIZE] - ${match.artist} - ${match.album} (${match.releaseType}, ${match.trackCount} tracks)`
        );
    });

    // Run organization script
    await organizeSingles();
}
