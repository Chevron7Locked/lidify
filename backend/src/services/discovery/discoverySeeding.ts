/**
 * Discovery Seeding Module
 *
 * Handles seed artist selection for discovering new music based on:
 * - User's listening history (recent plays)
 * - Library contents (fallback when insufficient history)
 * - Album ownership checking across multiple sources
 */

import { prisma } from '../../utils/db';
import { logger } from '../../utils/logger';
import { lidarrService } from '../lidarr';
import { subWeeks } from 'date-fns';

export interface SeedArtist {
    name: string;
    mbid?: string;
}

export class DiscoverySeeding {
    private readonly DEFAULT_SEED_COUNT = 10;
    private readonly MIN_PLAYS_THRESHOLD = 5;
    private readonly RECENT_PLAYS_LIMIT = 50;

    /**
     * Gets seed artists based on user's listening history.
     * Falls back to library artists when insufficient play history.
     * Uses recency weighting: plays in last 2 weeks count 2x more.
     */
    async getSeedArtists(userId: string, seedCount?: number): Promise<SeedArtist[]> {
        const limit = seedCount ?? this.DEFAULT_SEED_COUNT;
        const twoWeeksAgo = subWeeks(new Date(), 2);
        const fourWeeksAgo = subWeeks(new Date(), 4);

        // Get plays from last 4 weeks with recency weighting
        const recentPlays = await prisma.play.groupBy({
            by: ['trackId'],
            where: {
                userId,
                playedAt: { gte: fourWeeksAgo },
                source: { in: ['LIBRARY', 'DISCOVERY_KEPT'] },
            },
            _count: { id: true },
            _max: { playedAt: true },
        });

        // Weight: plays in last 2 weeks count 2x
        const weightedPlays = recentPlays
            .map(play => {
                const isRecent = play._max.playedAt && play._max.playedAt >= twoWeeksAgo;
                const weight = isRecent ? 2 : 1;
                return {
                    trackId: play.trackId,
                    weightedCount: play._count.id * weight,
                    rawCount: play._count.id,
                };
            })
            .filter(p => p.rawCount >= this.MIN_PLAYS_THRESHOLD) // Filter <5 plays
            .sort((a, b) => b.weightedCount - a.weightedCount)
            .slice(0, this.RECENT_PLAYS_LIMIT);

        if (weightedPlays.length < this.MIN_PLAYS_THRESHOLD) {
            return this.getFallbackSeedArtists(limit);
        }

        const tracks = await prisma.track.findMany({
            where: {
                id: { in: weightedPlays.map((p) => p.trackId) },
                album: { location: 'LIBRARY' },
            },
            include: { album: { include: { artist: true } } },
        });

        const artistMap = new Map<string, SeedArtist>();
        for (const track of tracks) {
            const artist = track.album.artist;
            if (!artistMap.has(track.album.artistId)) {
                if (this.isValidMbid(artist.mbid)) {
                    artistMap.set(track.album.artistId, {
                        name: artist.name,
                        mbid: artist.mbid,
                    });
                }
            }
        }

        const artists = Array.from(artistMap.values()).slice(0, limit);
        logger.debug(`[DiscoverySeeding] Found ${artists.length} recency-weighted seed artists`);
        return artists;
    }

    /**
     * Fallback: Get artists with most albums in library when play history is insufficient.
     */
    private async getFallbackSeedArtists(limit: number): Promise<SeedArtist[]> {
        logger.debug('[DiscoverySeeding] Insufficient play history, falling back to library');

        const albums = await prisma.album.groupBy({
            by: ['artistId'],
            where: { location: 'LIBRARY' },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: limit,
        });

        const artists = await prisma.artist.findMany({
            where: { id: { in: albums.map((a) => a.artistId) } },
        });

        return artists
            .filter((a) => this.isValidMbid(a.mbid))
            .map((a) => ({ name: a.name, mbid: a.mbid }));
    }

    /**
     * Checks if an artist is already in the user's library (has albums).
     * Discovery should find NEW artists, not more albums from artists they already own.
     */
    async isArtistInLibrary(artistMbid: string): Promise<boolean> {
        if (!this.isValidMbid(artistMbid)) {
            return false;
        }

        const artist = await prisma.artist.findFirst({
            where: { mbid: artistMbid },
            include: { albums: { take: 1 } },
        });

        if (artist && artist.albums.length > 0) {
            logger.debug(`[DiscoverySeeding] Artist ${artistMbid} is in library`);
            return true;
        }

        return false;
    }

    /**
     * Checks if an album is already owned through any source:
     * - OwnedAlbum table
     * - Album table
     * - Previous discovery
     * - Pending downloads
     * - Lidarr
     */
    async isAlbumOwned(albumMbid: string, userId: string): Promise<boolean> {
        const ownedAlbum = await prisma.ownedAlbum.findFirst({
            where: { rgMbid: albumMbid },
        });
        if (ownedAlbum) return true;

        const existingAlbum = await prisma.album.findFirst({
            where: { rgMbid: albumMbid },
        });
        if (existingAlbum) return true;

        const previousDiscovery = await prisma.discoveryAlbum.findFirst({
            where: { rgMbid: albumMbid, userId },
        });
        if (previousDiscovery) return true;

        const pendingDownload = await prisma.downloadJob.findFirst({
            where: {
                targetMbid: albumMbid,
                status: { in: ['pending', 'processing'] },
            },
        });
        if (pendingDownload) return true;

        const inLidarr = await lidarrService.isAlbumAvailable(albumMbid);
        if (inLidarr) return true;

        return false;
    }

    /**
     * Validates that an MBID is not null/undefined and not a temporary ID.
     */
    private isValidMbid(mbid: string | null | undefined): mbid is string {
        return !!mbid && !mbid.startsWith('temp-');
    }
}

export const discoverySeeding = new DiscoverySeeding();
