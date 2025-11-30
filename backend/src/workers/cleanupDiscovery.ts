import { prisma } from "../utils/db";
import fs from "fs/promises";
import path from "path";

export async function cleanupDiscoveryTracks() {
    console.log("\nCleaning up old discovery tracks...");

    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Find discovery albums older than 7 days
        const oldDiscoveryAlbums = await prisma.discoveryAlbum.findMany({
            where: {
                downloadedAt: { lt: sevenDaysAgo },
            },
            include: {
                tracks: true,
            },
        });

        console.log(
            `  Found ${oldDiscoveryAlbums.length} old discovery albums`
        );

        if (oldDiscoveryAlbums.length === 0) {
            console.log("  No cleanup needed");
            return { deletedAlbums: 0, deletedTracks: 0 };
        }

        let deletedAlbums = 0;
        let deletedTracks = 0;

        for (const album of oldDiscoveryAlbums) {
            // Check if any tracks should be kept
            const tracksToKeep = [];
            const tracksToDelete = [];

            for (const track of album.tracks) {
                let shouldKeep = false;

                // Keep if user marked it
                if (track.userKept) {
                    shouldKeep = true;
                }

                // Keep if in any playlist (check playlist_items)
                if (track.trackId) {
                    const inPlaylist = await prisma.playlistItem.findFirst({
                        where: { trackId: track.trackId },
                    });
                    if (inPlaylist) {
                        shouldKeep = true;
                    }
                }

                // Keep if user liked it
                if (track.trackId) {
                    const liked = await prisma.likedTrack.findFirst({
                        where: { trackId: track.trackId },
                    });
                    if (liked) {
                        shouldKeep = true;
                    }
                }

                // Keep if played in last 7 days
                if (track.lastPlayedAt) {
                    const lastPlayed = new Date(track.lastPlayedAt);
                    if (lastPlayed >= sevenDaysAgo) {
                        shouldKeep = true;
                    }
                }

                if (shouldKeep) {
                    tracksToKeep.push(track);
                } else {
                    tracksToDelete.push(track);
                }
            }

            // If all tracks should be deleted, delete the album
            if (tracksToDelete.length === album.tracks.length) {
                console.log(
                    `  Deleting album: ${album.albumTitle} by ${album.artistName}`
                );

                // Delete physical files
                if (album.folderPath) {
                    try {
                        await fs.rm(album.folderPath, {
                            recursive: true,
                            force: true,
                        });
                        console.log(`    Deleted folder: ${album.folderPath}`);
                    } catch (err) {
                        console.warn(`    Could not delete folder: ${err}`);
                    }
                }

                // Delete from database (cascade deletes tracks)
                await prisma.discoveryAlbum.delete({
                    where: { id: album.id },
                });

                deletedAlbums++;
                deletedTracks += album.tracks.length;
            } else if (tracksToDelete.length > 0) {
                // Delete specific tracks only
                console.log(
                    `  Partial cleanup: ${album.albumTitle} (${tracksToDelete.length}/${album.tracks.length} tracks)`
                );

                for (const track of tracksToDelete) {
                    // Delete physical file
                    if (track.filePath) {
                        try {
                            await fs.unlink(track.filePath);
                            console.log(`    Deleted: ${track.fileName}`);
                        } catch (err) {
                            console.warn(`    Could not delete file: ${err}`);
                        }
                    }

                    // Delete from database
                    await prisma.discoveryTrack.delete({
                        where: { id: track.id },
                    });

                    deletedTracks++;
                }
            } else {
                console.log(
                    `  Keeping album: ${album.albumTitle} (all tracks in use)`
                );
            }
        }

        console.log(
            `\n  Cleanup complete: ${deletedAlbums} albums, ${deletedTracks} tracks deleted`
        );

        return { deletedAlbums, deletedTracks };
    } catch (error) {
        console.error("Cleanup discovery tracks error:", error);
        throw error;
    }
}

// CLI entry point
if (require.main === module) {
    cleanupDiscoveryTracks()
        .then((result) => {
            console.log("\nDiscovery cleanup completed successfully");
            console.log(
                `Deleted: ${result.deletedAlbums} albums, ${result.deletedTracks} tracks`
            );
            process.exit(0);
        })
        .catch((err) => {
            console.error("\n Failed:", err);
            process.exit(1);
        });
}
