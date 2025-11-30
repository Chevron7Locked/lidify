/**
 * Data Integrity Worker
 *
 * Periodic cleanup to maintain database health:
 * 1. Remove expired DiscoverExclusion records
 * 2. Clean up orphaned DiscoveryTrack records
 * 3. Clean up orphaned Album records (DISCOVER location with no DiscoveryAlbum)
 * 4. Consolidate duplicate artists (temp MBID vs real MBID)
 * 5. Clean up orphaned artists (no albums)
 * 6. Clean up old completed/failed DownloadJob records
 */

import { prisma } from "../utils/db";

interface IntegrityReport {
    expiredExclusions: number;
    orphanedDiscoveryTracks: number;
    orphanedAlbums: number;
    consolidatedArtists: number;
    orphanedArtists: number;
    oldDownloadJobs: number;
}

export async function runDataIntegrityCheck(): Promise<IntegrityReport> {
    console.log("\nRunning data integrity check...");

    const report: IntegrityReport = {
        expiredExclusions: 0,
        orphanedDiscoveryTracks: 0,
        orphanedAlbums: 0,
        consolidatedArtists: 0,
        orphanedArtists: 0,
        oldDownloadJobs: 0,
    };

    // 1. Remove expired DiscoverExclusion records
    const expiredExclusions = await prisma.discoverExclusion.deleteMany({
        where: {
            expiresAt: { lt: new Date() },
        },
    });
    report.expiredExclusions = expiredExclusions.count;
    if (expiredExclusions.count > 0) {
        console.log(
            `     Removed ${expiredExclusions.count} expired exclusions`
        );
    }

    // 2. Clean up orphaned DiscoveryTrack records (tracks whose Track record was deleted)
    const orphanedDiscoveryTracks = await prisma.discoveryTrack.deleteMany({
        where: {
            trackId: null,
        },
    });
    report.orphanedDiscoveryTracks = orphanedDiscoveryTracks.count;
    if (orphanedDiscoveryTracks.count > 0) {
        console.log(
            `     Removed ${orphanedDiscoveryTracks.count} orphaned discovery track records`
        );
    }

    // 3. Clean up orphaned DISCOVER albums (no active DiscoveryAlbum record)
    const discoverAlbums = await prisma.album.findMany({
        where: { location: "DISCOVER" },
        include: { artist: true },
    });

    for (const album of discoverAlbums) {
        // Check if there's an ACTIVE or LIKED DiscoveryAlbum record
        const hasActiveRecord = await prisma.discoveryAlbum.findFirst({
            where: {
                OR: [
                    { rgMbid: album.rgMbid },
                    {
                        albumTitle: album.title,
                        artistName: album.artist.name,
                    },
                ],
                status: { in: ["ACTIVE", "LIKED"] },
            },
        });

        if (!hasActiveRecord) {
            // Delete tracks first
            await prisma.track.deleteMany({
                where: { albumId: album.id },
            });
            // Delete album
            await prisma.album.delete({
                where: { id: album.id },
            });
            report.orphanedAlbums++;
            console.log(
                `     Removed orphaned album: ${album.artist.name} - ${album.title}`
            );
        }
    }

    // 4. Consolidate duplicate artists (same name, one with temp MBID, one with real)
    const tempArtists = await prisma.artist.findMany({
        where: {
            mbid: { startsWith: "temp-" },
        },
        include: { albums: true },
    });

    for (const tempArtist of tempArtists) {
        // Find a real artist with the same normalized name
        const realArtist = await prisma.artist.findFirst({
            where: {
                normalizedName: tempArtist.normalizedName,
                mbid: { not: { startsWith: "temp-" } },
            },
        });

        if (realArtist) {
            // Move all albums from temp artist to real artist
            await prisma.album.updateMany({
                where: { artistId: tempArtist.id },
                data: { artistId: realArtist.id },
            });

            // Delete SimilarArtist relations
            await prisma.similarArtist.deleteMany({
                where: {
                    OR: [
                        { artistId: tempArtist.id },
                        { similarArtistId: tempArtist.id },
                    ],
                },
            });

            // Delete temp artist
            await prisma.artist.delete({
                where: { id: tempArtist.id },
            });

            report.consolidatedArtists++;
            console.log(
                `     Consolidated "${tempArtist.name}" (temp) into real artist`
            );
        }
    }

    // 5. Clean up orphaned artists (no albums)
    const orphanedArtists = await prisma.artist.findMany({
        where: {
            albums: { none: {} },
        },
    });

    if (orphanedArtists.length > 0) {
        // Delete SimilarArtist relations first
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

        // Delete orphaned artists
        await prisma.artist.deleteMany({
            where: { id: { in: orphanedArtists.map((a) => a.id) } },
        });

        report.orphanedArtists = orphanedArtists.length;
    }

    // 6. Clean up old DownloadJob records (older than 30 days, completed/failed)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldJobs = await prisma.downloadJob.deleteMany({
        where: {
            status: { in: ["completed", "failed"] },
            completedAt: { lt: thirtyDaysAgo },
        },
    });
    report.oldDownloadJobs = oldJobs.count;
    if (oldJobs.count > 0) {
        console.log(`     Removed ${oldJobs.count} old download jobs`);
    }

    // Summary
    console.log("\nData integrity check complete:");
    console.log(`   - Expired exclusions: ${report.expiredExclusions}`);
    console.log(
        `   - Orphaned discovery tracks: ${report.orphanedDiscoveryTracks}`
    );
    console.log(`   - Orphaned albums: ${report.orphanedAlbums}`);
    console.log(`   - Consolidated artists: ${report.consolidatedArtists}`);
    console.log(`   - Orphaned artists: ${report.orphanedArtists}`);
    console.log(`   - Old download jobs: ${report.oldDownloadJobs}`);

    return report;
}

// CLI entry point
if (require.main === module) {
    runDataIntegrityCheck()
        .then((report) => {
            console.log("\nData integrity check completed successfully");
            process.exit(0);
        })
        .catch((err) => {
            console.error("\n Data integrity check failed:", err);
            process.exit(1);
        });
}
