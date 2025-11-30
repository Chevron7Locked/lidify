import * as fs from "fs";
import * as path from "path";
import { parseFile } from "music-metadata";
import { prisma } from "../utils/db";
import PQueue from "p-queue";
import { CoverArtExtractor } from "./coverArtExtractor";
import { deezerService } from "./deezer";
import { normalizeArtistName, areArtistNamesSimilar } from "../utils/artistNormalization";

// Supported audio formats
const AUDIO_EXTENSIONS = new Set([
    ".mp3",
    ".flac",
    ".m4a",
    ".aac",
    ".ogg",
    ".opus",
    ".wav",
    ".wma",
    ".ape",
    ".wv",
]);

interface ScanProgress {
    filesScanned: number;
    filesTotal: number;
    currentFile: string;
    errors: Array<{ file: string; error: string }>;
}

interface ScanResult {
    tracksAdded: number;
    tracksUpdated: number;
    tracksRemoved: number;
    errors: Array<{ file: string; error: string }>;
    duration: number;
}

export class MusicScannerService {
    private scanQueue = new PQueue({ concurrency: 10 });
    private progressCallback?: (progress: ScanProgress) => void;
    private coverArtExtractor?: CoverArtExtractor;

    constructor(
        progressCallback?: (progress: ScanProgress) => void,
        coverCachePath?: string
    ) {
        this.progressCallback = progressCallback;
        if (coverCachePath) {
            this.coverArtExtractor = new CoverArtExtractor(coverCachePath);
        }
    }

    /**
     * Scan the music directory and update the database
     */
    async scanLibrary(musicPath: string): Promise<ScanResult> {
        const startTime = Date.now();
        const result: ScanResult = {
            tracksAdded: 0,
            tracksUpdated: 0,
            tracksRemoved: 0,
            errors: [],
            duration: 0,
        };

        console.log(`Starting library scan: ${musicPath}`);

        // Step 1: Find all audio files
        const audioFiles = await this.findAudioFiles(musicPath);
        console.log(`Found ${audioFiles.length} audio files`);

        // Step 2: Get existing tracks from database
        const existingTracks = await prisma.track.findMany({
            select: {
                id: true,
                filePath: true,
                fileModified: true,
            },
        });

        const tracksByPath = new Map(
            existingTracks.map((t) => [t.filePath, t])
        );

        // Step 3: Process each audio file
        let filesScanned = 0;
        const progress: ScanProgress = {
            filesScanned: 0,
            filesTotal: audioFiles.length,
            currentFile: "",
            errors: [],
        };

        for (const audioFile of audioFiles) {
            await this.scanQueue.add(async () => {
                try {
                    const relativePath = path.relative(musicPath, audioFile);
                    progress.currentFile = relativePath;
                    this.progressCallback?.(progress);

                    const stats = await fs.promises.stat(audioFile);
                    const fileModified = stats.mtime;

                    const existingTrack = tracksByPath.get(relativePath);

                    // Check if file needs updating
                    if (existingTrack) {
                        if (
                            existingTrack.fileModified &&
                            existingTrack.fileModified >= fileModified
                        ) {
                            // File hasn't changed, skip
                            filesScanned++;
                            progress.filesScanned = filesScanned;
                            return;
                        }
                        // File changed, will update
                        result.tracksUpdated++;
                    } else {
                        // New file
                        result.tracksAdded++;
                    }

                    // Extract metadata and update database
                    await this.processAudioFile(
                        audioFile,
                        relativePath,
                        musicPath
                    );
                } catch (err: any) {
                    const error = {
                        file: audioFile,
                        error: err.message || String(err),
                    };
                    result.errors.push(error);
                    progress.errors.push(error);
                    console.error(`Error processing ${audioFile}:`, err);
                } finally {
                    filesScanned++;
                    progress.filesScanned = filesScanned;
                    this.progressCallback?.(progress);
                }
            });
        }

        await this.scanQueue.onIdle();

        // Step 4: Remove tracks for files that no longer exist
        const scannedPaths = new Set(
            audioFiles.map((f) => path.relative(musicPath, f))
        );
        const tracksToRemove = existingTracks.filter(
            (t) => !scannedPaths.has(t.filePath)
        );

        if (tracksToRemove.length > 0) {
            await prisma.track.deleteMany({
                where: {
                    id: { in: tracksToRemove.map((t) => t.id) },
                },
            });
            result.tracksRemoved = tracksToRemove.length;
            console.log(`Removed ${tracksToRemove.length} missing tracks`);
        }

        result.duration = Date.now() - startTime;
        console.log(
            `Scan complete: +${result.tracksAdded} ~${result.tracksUpdated} -${result.tracksRemoved} (${result.duration}ms)`
        );

        return result;
    }

    /**
     * Extract the primary artist from collaboration strings
     * Examples:
     *   "CHVRCHES & Robert Smith" -> "CHVRCHES"
     *   "Artist feat. Someone" -> "Artist"
     *   "Artist ft. Someone" -> "Artist"
     *   "Artist, Someone" -> "Artist"
     */
    private extractPrimaryArtist(artistName: string): string {
        // Trim whitespace
        artistName = artistName.trim();

        // Patterns that indicate a collaboration (in order of priority)
        const collaborationPatterns = [
            / feat\.? /i, // "feat." or "feat "
            / ft\.? /i, // "ft." or "ft "
            / featuring /i,
            / \& /, // " & "
            / and /i, // " and "
            / with /i, // " with "
            /, /, // ", "
        ];

        // Find the first collaboration pattern and extract the primary artist
        for (const pattern of collaborationPatterns) {
            const match = artistName.split(pattern);
            if (match.length > 1) {
                // Return the part before the collaboration indicator
                return match[0].trim();
            }
        }

        // No collaboration found, return as-is
        return artistName;
    }

    /**
     * Check if a file path is within the discovery folder
     * Discovery albums are stored in paths like "discovery/Artist/Album/track.flac"
     * or "Discover/Artist/Album/track.flac" (case-insensitive)
     */
    private isDiscoveryPath(relativePath: string): boolean {
        const normalizedPath = relativePath.toLowerCase().replace(/\\/g, "/");
        // Check if path starts with "discovery/" or "discover/"
        return (
            normalizedPath.startsWith("discovery/") ||
            normalizedPath.startsWith("discover/")
        );
    }

    /**
     * Check if an album MBID is part of a pending discovery download
     * This allows discovery albums to be downloaded to the same /music folder
     * without requiring a separate /music/discovery root folder in Lidarr
     */
    private async isDiscoveryDownload(albumMbid: string): Promise<boolean> {
        if (!albumMbid || albumMbid.startsWith("temp-")) return false;

        try {
            const discoveryJob = await prisma.downloadJob.findFirst({
                where: {
                    targetMbid: albumMbid,
                    discoveryBatchId: { not: null },
                },
            });
            return !!discoveryJob;
        } catch {
            return false;
        }
    }

    /**
     * Recursively find all audio files in a directory
     */
    private async findAudioFiles(dirPath: string): Promise<string[]> {
        const files: string[] = [];

        async function walk(dir: string) {
            const entries = await fs.promises.readdir(dir, {
                withFileTypes: true,
            });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await walk(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (AUDIO_EXTENSIONS.has(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        }

        await walk(dirPath);
        return files;
    }

    /**
     * Process a single audio file and update database
     */
    private async processAudioFile(
        absolutePath: string,
        relativePath: string,
        musicPath: string
    ): Promise<void> {
        // Extract metadata
        const metadata = await parseFile(absolutePath);
        const stats = await fs.promises.stat(absolutePath);

        // Parse basic info
        const title =
            metadata.common.title ||
            path.basename(relativePath, path.extname(relativePath));
        const trackNo = metadata.common.track.no || 0;
        const duration = Math.floor(metadata.format.duration || 0);
        const mime = metadata.format.codec || "audio/mpeg";

        // Artist and album info
        let rawArtistName =
            metadata.common.artist ||
            metadata.common.albumartist ||
            "Unknown Artist";

        // Extract primary artist from collaborations (e.g., "CHVRCHES & Robert Smith" -> "CHVRCHES")
        // This prevents creating duplicate artists for collaborations/features
        const artistName = this.extractPrimaryArtist(rawArtistName);

        const albumTitle = metadata.common.album || "Unknown Album";
        const year = metadata.common.year || null;

        // Get or create artist
        const normalizedArtistName = normalizeArtistName(artistName);
        let artist = await prisma.artist.findFirst({
            where: { normalizedName: normalizedArtistName },
        });

        // If we found an artist, optionally update to better capitalization
        if (artist && artist.name !== artistName) {
            // Check if the new name has better capitalization (starts with uppercase)
            const currentNameIsLowercase = artist.name[0] === artist.name[0].toLowerCase();
            const newNameIsCapitalized = artistName[0] === artistName[0].toUpperCase();

            if (currentNameIsLowercase && newNameIsCapitalized) {
                console.log(`Updating artist name capitalization: "${artist.name}" -> "${artistName}"`);
                artist = await prisma.artist.update({
                    where: { id: artist.id },
                    data: { name: artistName },
                });
            }
        }

        if (!artist) {
            // Try fuzzy matching to catch typos like "the weeknd" vs "the weekend"
            // Only check artists with similar normalized names (performance optimization)
            const similarArtists = await prisma.artist.findMany({
                where: {
                    normalizedName: {
                        // Get artists whose normalized names start with similar prefix
                        startsWith: normalizedArtistName.substring(0, Math.min(3, normalizedArtistName.length)),
                    },
                },
                select: { id: true, name: true, normalizedName: true, mbid: true },
            });

            // Check for fuzzy matches
            for (const candidate of similarArtists) {
                if (areArtistNamesSimilar(artistName, candidate.name, 95)) {
                    console.log(`Fuzzy match found: "${artistName}" -> "${candidate.name}"`);
                    artist = candidate;
                    break;
                }
            }
        }

        if (!artist) {
            // Try to find by MusicBrainz ID if available
            const artistMbid = metadata.common.musicbrainz_artistid?.[0];
            if (artistMbid) {
                artist = await prisma.artist.findUnique({
                    where: { mbid: artistMbid },
                });

                // If we have a real MBID but no artist exists, check if there's a temp artist we should consolidate
                if (!artist) {
                    const tempArtist = await prisma.artist.findFirst({
                        where: {
                            normalizedName: normalizedArtistName,
                            mbid: { startsWith: 'temp-' },
                        },
                    });

                    if (tempArtist) {
                        // Consolidate: update temp artist to real MBID
                        console.log(`🔗 Consolidating temp artist "${tempArtist.name}" with real MBID: ${artistMbid}`);
                        artist = await prisma.artist.update({
                            where: { id: tempArtist.id },
                            data: { mbid: artistMbid },
                        });
                    }
                }
            }

            if (!artist) {
                // Create new artist (use a temporary MBID for now)
                artist = await prisma.artist.create({
                    data: {
                        name: artistName,
                        normalizedName: normalizedArtistName,
                        mbid:
                            artistMbid || `temp-${Date.now()}-${Math.random()}`,
                        enrichmentStatus: "pending",
                    },
                });
            }
        }

        // Get or create album
        let album = await prisma.album.findFirst({
            where: {
                artistId: artist.id,
                title: albumTitle,
            },
        });

        if (!album) {
            // Try to find by release group MBID if available
            const albumMbid = metadata.common.musicbrainz_releasegroupid;
            if (albumMbid) {
                album = await prisma.album.findUnique({
                    where: { rgMbid: albumMbid },
                });
            }

            if (!album) {
                // Create new album (use a temporary MBID for now)
                const rgMbid =
                    albumMbid || `temp-${Date.now()}-${Math.random()}`;

                // Determine if this is a discovery album:
                // 1. Check file path (legacy: /music/discovery/ folder)
                // 2. Check if MBID matches a discovery download job (preferred: no separate folder needed)
                const isDiscoveryByPath = this.isDiscoveryPath(relativePath);
                const isDiscoveryByJob = await this.isDiscoveryDownload(rgMbid);
                const isDiscoveryAlbum = isDiscoveryByPath || isDiscoveryByJob;

                album = await prisma.album.create({
                    data: {
                        title: albumTitle,
                        artistId: artist.id,
                        rgMbid,
                        year,
                        primaryType: "Album",
                        location: isDiscoveryAlbum ? "DISCOVER" : "LIBRARY",
                    },
                });

                // Only create OwnedAlbum record for library albums (not discovery)
                // Discovery albums are temporary and should not appear in the user's library
                if (!isDiscoveryAlbum) {
                    await prisma.ownedAlbum.create({
                        data: {
                            rgMbid,
                            artistId: artist.id,
                            source: "native_scan",
                        },
                    });
                }
            }

            // Extract cover art if we have an extractor and album doesn't have cover yet
            if (this.coverArtExtractor && !album.coverUrl) {
                const coverPath = await this.coverArtExtractor.extractCoverArt(
                    absolutePath,
                    album.id
                );
                if (coverPath) {
                    await prisma.album.update({
                        where: { id: album.id },
                        data: { coverUrl: `native:${coverPath}` },
                    });
                } else {
                    // No embedded art, try fetching from Deezer
                    try {
                        const deezerCover = await deezerService.getAlbumCover(
                            artistName,
                            albumTitle
                        );
                        if (deezerCover) {
                            await prisma.album.update({
                                where: { id: album.id },
                                data: { coverUrl: deezerCover },
                            });
                        }
                    } catch (error) {
                        // Silently fail - cover art is optional
                    }
                }
            }
        }

        // Upsert track
        await prisma.track.upsert({
            where: { filePath: relativePath },
            create: {
                albumId: album.id,
                title,
                trackNo,
                duration,
                mime,
                filePath: relativePath,
                fileModified: stats.mtime,
                fileSize: stats.size,
            },
            update: {
                albumId: album.id,
                title,
                trackNo,
                duration,
                mime,
                fileModified: stats.mtime,
                fileSize: stats.size,
            },
        });
    }
}
