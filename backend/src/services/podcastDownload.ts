import { prisma } from "../utils/db";
import { config } from "../config";
import fs from "fs/promises";
import path from "path";
import axios from "axios";

/**
 * PodcastDownloadService - Background download and caching of podcast episodes
 * 
 * Features:
 * - Non-blocking background downloads when episodes are played
 * - 30-day cache expiry with automatic cleanup
 * - Proper range request support for cached files
 */

// Track in-progress downloads to avoid duplicates
const downloadingEpisodes = new Set<string>();

// Track download progress (episodeId -> { bytesDownloaded, totalBytes })
interface DownloadProgress {
    bytesDownloaded: number;
    totalBytes: number;
}
const downloadProgress = new Map<string, DownloadProgress>();

// Cache directory for podcast audio files
const getPodcastCacheDir = (): string => {
    return path.join(config.music.transcodeCachePath, "../podcast-audio");
};

/**
 * Get download progress for an episode
 * Returns { progress: 0-100, downloading: boolean } or null if not downloading
 */
export function getDownloadProgress(episodeId: string): { progress: number; downloading: boolean } | null {
    if (!downloadingEpisodes.has(episodeId)) {
        return null;
    }
    
    const progress = downloadProgress.get(episodeId);
    if (!progress || progress.totalBytes === 0) {
        return { progress: 0, downloading: true };
    }
    
    const percent = Math.round((progress.bytesDownloaded / progress.totalBytes) * 100);
    return { progress: Math.min(100, percent), downloading: true };
}

/**
 * Check if a cached file exists and is valid
 * Returns null if file doesn't exist, is empty, or is still being downloaded
 */
export async function getCachedFilePath(episodeId: string): Promise<string | null> {
    // Don't return cache path if still downloading - file may be incomplete
    if (downloadingEpisodes.has(episodeId)) {
        console.log(`[PODCAST-DL] Episode ${episodeId} is still downloading, not using cache`);
        return null;
    }
    
    const cacheDir = getPodcastCacheDir();
    const cachedPath = path.join(cacheDir, `${episodeId}.mp3`);
    
    try {
        await fs.access(cachedPath, fs.constants.F_OK);
        const stats = await fs.stat(cachedPath);
        
        // File must be > 0 bytes to be valid
        if (stats.size > 0) {
            // Check database record exists
            const dbRecord = await prisma.podcastDownload.findFirst({
                where: { episodeId }
            });
            
            // If no DB record, file might be incomplete or stale
            if (!dbRecord) {
                console.log(`[PODCAST-DL] No DB record for ${episodeId}, deleting stale cache file`);
                await fs.unlink(cachedPath).catch(() => {});
                return null;
            }
            
            // Validate file size matches what we recorded (allow 1% variance for filesystem differences)
            const expectedSize = dbRecord.fileSizeMb * 1024 * 1024;
            const actualSize = stats.size;
            const variance = Math.abs(actualSize - expectedSize) / expectedSize;
            
            if (expectedSize > 0 && variance > 0.01) {
                console.log(`[PODCAST-DL] Size mismatch for ${episodeId}: actual ${actualSize} vs expected ${Math.round(expectedSize)}, deleting`);
                await fs.unlink(cachedPath).catch(() => {});
                await prisma.podcastDownload.deleteMany({ where: { episodeId } });
                return null;
            }
            
            // Update last accessed time
            await prisma.podcastDownload.updateMany({
                where: { episodeId },
                data: { lastAccessedAt: new Date() }
            });
            
            console.log(`[PODCAST-DL] Cache valid for ${episodeId}: ${stats.size} bytes`);
            return cachedPath;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Start a background download for an episode
 * Returns immediately, download happens asynchronously
 */
export function downloadInBackground(
    episodeId: string, 
    audioUrl: string,
    userId: string
): void {
    // Skip if already downloading
    if (downloadingEpisodes.has(episodeId)) {
        console.log(`[PODCAST-DL] Already downloading episode ${episodeId}, skipping`);
        return;
    }
    
    // Mark as downloading
    downloadingEpisodes.add(episodeId);
    
    // Start download in background (don't await)
    performDownload(episodeId, audioUrl, userId)
        .catch(err => {
            console.error(`[PODCAST-DL] Background download failed for ${episodeId}:`, err.message);
        })
        .finally(() => {
            downloadingEpisodes.delete(episodeId);
        });
}

/**
 * Perform the actual download with retry support
 */
async function performDownload(
    episodeId: string, 
    audioUrl: string,
    userId: string,
    attempt: number = 1
): Promise<void> {
    const maxAttempts = 3;
    console.log(`[PODCAST-DL] Starting background download for episode ${episodeId} (attempt ${attempt}/${maxAttempts})`);
    
    const cacheDir = getPodcastCacheDir();
    
    // Ensure cache directory exists
    await fs.mkdir(cacheDir, { recursive: true });
    
    const tempPath = path.join(cacheDir, `${episodeId}.tmp`);
    const finalPath = path.join(cacheDir, `${episodeId}.mp3`);
    
    try {
        // Check if already cached (and validated)
        downloadingEpisodes.delete(episodeId); // Temporarily remove to check cache
        const existingCached = await getCachedFilePath(episodeId);
        downloadingEpisodes.add(episodeId); // Re-add
        if (existingCached) {
            console.log(`[PODCAST-DL] Episode ${episodeId} already cached, skipping download`);
            return;
        }
        
        // Clean up any partial temp files from previous attempts
        await fs.unlink(tempPath).catch(() => {});
        
        // Download the file with longer timeout for large podcasts
        const response = await axios.get(audioUrl, {
            responseType: 'stream',
            timeout: 600000, // 10 minute timeout for large files (3+ hour podcasts)
            headers: {
                'User-Agent': 'Lidify/1.0 (https://github.com/Chevron7Locked/lidify)'
            },
            // Don't let axios decompress - we want raw bytes
            decompress: false
        });
        
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        console.log(`[PODCAST-DL] Downloading ${episodeId} (${Math.round(contentLength / 1024 / 1024)}MB)`);
        
        // Initialize progress tracking
        downloadProgress.set(episodeId, { bytesDownloaded: 0, totalBytes: contentLength });
        
        // Write to temp file first with progress tracking
        const writeStream = (await import('fs')).createWriteStream(tempPath);
        let bytesDownloaded = 0;
        let lastLogTime = Date.now();
        
        await new Promise<void>((resolve, reject) => {
            response.data.on('data', (chunk: Buffer) => {
                bytesDownloaded += chunk.length;
                downloadProgress.set(episodeId, { bytesDownloaded, totalBytes: contentLength });
                
                // Log progress every 30 seconds for long downloads
                const now = Date.now();
                if (now - lastLogTime > 30000) {
                    const percent = contentLength > 0 ? Math.round((bytesDownloaded / contentLength) * 100) : 0;
                    console.log(`[PODCAST-DL] Download progress ${episodeId}: ${percent}% (${Math.round(bytesDownloaded / 1024 / 1024)}MB)`);
                    lastLogTime = now;
                }
            });
            
            response.data.on('end', () => {
                writeStream.end(() => resolve());
            });
            
            response.data.pipe(writeStream, { end: false });
            
            writeStream.on('error', (err) => {
                response.data.destroy();
                reject(err);
            });
            
            response.data.on('error', (err: Error) => {
                writeStream.destroy();
                reject(err);
            });
            
            // Handle aborted connections
            response.data.on('aborted', () => {
                writeStream.destroy();
                reject(new Error('Download aborted by server'));
            });
        });
        
        // Verify file was written and is complete
        const stats = await fs.stat(tempPath);
        if (stats.size === 0) {
            await fs.unlink(tempPath).catch(() => {});
            throw new Error('Downloaded file is empty');
        }
        
        // Check if download is complete (file size should match content-length if provided)
        if (contentLength > 0 && stats.size < contentLength) {
            const percentComplete = Math.round((stats.size / contentLength) * 100);
            console.error(`[PODCAST-DL] Incomplete download for ${episodeId}: ${stats.size}/${contentLength} bytes (${percentComplete}%)`);
            await fs.unlink(tempPath).catch(() => {});
            throw new Error(`Download incomplete: got ${stats.size} bytes, expected ${contentLength}`);
        }
        
        // Move temp file to final location
        await fs.rename(tempPath, finalPath);
        
        // Record in database
        const fileSizeMb = stats.size / 1024 / 1024;
        
        await prisma.podcastDownload.upsert({
            where: {
                userId_episodeId: { userId, episodeId }
            },
            create: {
                userId,
                episodeId,
                localPath: finalPath,
                fileSizeMb,
                downloadedAt: new Date(),
                lastAccessedAt: new Date()
            },
            update: {
                localPath: finalPath,
                fileSizeMb,
                downloadedAt: new Date(),
                lastAccessedAt: new Date()
            }
        });
        
        console.log(`[PODCAST-DL] Successfully cached episode ${episodeId} (${fileSizeMb.toFixed(1)}MB)`);
        
        // Clean up progress tracking
        downloadProgress.delete(episodeId);
        
    } catch (error: any) {
        // Clean up temp file and progress tracking on error
        await fs.unlink(tempPath).catch(() => {});
        downloadProgress.delete(episodeId);
        
        // Retry on failure
        if (attempt < maxAttempts) {
            console.log(`[PODCAST-DL] Download failed (attempt ${attempt}), retrying in 5s: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return performDownload(episodeId, audioUrl, userId, attempt + 1);
        }
        
        throw error;
    }
}

/**
 * Clean up cached episodes older than 30 days
 * Should be called periodically (e.g., daily)
 */
export async function cleanupExpiredCache(): Promise<{ deleted: number; freedMb: number }> {
    console.log('[PODCAST-DL] Starting cache cleanup...');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Find expired downloads
    const expiredDownloads = await prisma.podcastDownload.findMany({
        where: {
            lastAccessedAt: { lt: thirtyDaysAgo }
        }
    });
    
    let deleted = 0;
    let freedMb = 0;
    
    for (const download of expiredDownloads) {
        try {
            // Delete file from disk
            await fs.unlink(download.localPath).catch(() => {});
            
            // Delete database record
            await prisma.podcastDownload.delete({
                where: { id: download.id }
            });
            
            deleted++;
            freedMb += download.fileSizeMb;
            
            console.log(`[PODCAST-DL] Deleted expired cache: ${path.basename(download.localPath)}`);
        } catch (err: any) {
            console.error(`[PODCAST-DL] Failed to delete ${download.localPath}:`, err.message);
        }
    }
    
    console.log(`[PODCAST-DL] Cleanup complete: ${deleted} files deleted, ${freedMb.toFixed(1)}MB freed`);
    
    return { deleted, freedMb };
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
    totalFiles: number;
    totalSizeMb: number;
    oldestFile: Date | null;
}> {
    const downloads = await prisma.podcastDownload.findMany({
        select: {
            fileSizeMb: true,
            downloadedAt: true
        },
        orderBy: { downloadedAt: 'asc' }
    });
    
    return {
        totalFiles: downloads.length,
        totalSizeMb: downloads.reduce((sum, d) => sum + d.fileSizeMb, 0),
        oldestFile: downloads.length > 0 ? downloads[0].downloadedAt : null
    };
}

/**
 * Check if an episode is currently being downloaded
 */
export function isDownloading(episodeId: string): boolean {
    return downloadingEpisodes.has(episodeId);
}

