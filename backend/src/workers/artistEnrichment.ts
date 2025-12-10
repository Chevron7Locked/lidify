import { Artist } from "@prisma/client";
import { prisma } from "../utils/db";
import { wikidataService } from "../services/wikidata";
import { lastFmService } from "../services/lastfm";
import { fanartService } from "../services/fanart";
import { deezerService } from "../services/deezer";
import { musicBrainzService } from "../services/musicbrainz";
import { normalizeArtistName } from "../utils/artistNormalization";
import { coverArtService } from "../services/coverArt";
import { redisClient } from "../utils/redis";

/**
 * Enriches an artist with metadata from Wikidata and Last.fm
 * - Fetches artist bio/summary and hero image from Wikidata
 * - Falls back to Last.fm if Wikidata fails
 * - Fetches similar artists from Last.fm
 */
export async function enrichSimilarArtist(artist: Artist): Promise<void> {
    const logPrefix = `[ENRICH ${artist.name}]`;
    console.log(`${logPrefix} Starting enrichment (MBID: ${artist.mbid})`);

    // Mark as enriching
    await prisma.artist.update({
        where: { id: artist.id },
        data: { enrichmentStatus: "enriching" },
    });

    // Track which source provided data
    let imageSource = "none";
    let summarySource = "none";

    try {
        // If artist has a temp MBID, try to get the real one from MusicBrainz
        if (artist.mbid.startsWith("temp-")) {
            console.log(`${logPrefix} Temp MBID detected, searching MusicBrainz...`);
            try {
                const mbResults = await musicBrainzService.searchArtist(
                    artist.name,
                    1
                );
                if (mbResults.length > 0 && mbResults[0].id) {
                    const realMbid = mbResults[0].id;
                    console.log(`${logPrefix} MusicBrainz: Found real MBID: ${realMbid}`);

                    // Update artist with real MBID
                    await prisma.artist.update({
                        where: { id: artist.id },
                        data: { mbid: realMbid },
                    });

                    // Update the local artist object
                    artist.mbid = realMbid;
                } else {
                    console.log(`${logPrefix} MusicBrainz: No match found, keeping temp MBID`);
                }
            } catch (error: any) {
                console.log(`${logPrefix} MusicBrainz: FAILED - ${error?.message || error}`);
            }
        }

        // Try Wikidata first (only if we have a real MBID)
        let summary = null;
        let heroUrl = null;

        if (!artist.mbid.startsWith("temp-")) {
            console.log(`${logPrefix} Wikidata: Fetching for MBID ${artist.mbid}...`);
            try {
                const wikidataInfo = await wikidataService.getArtistInfo(
                    artist.mbid
                );
                if (wikidataInfo) {
                    summary = wikidataInfo.summary;
                    heroUrl = wikidataInfo.image;
                    if (summary) summarySource = "wikidata";
                    if (heroUrl) imageSource = "wikidata";
                    console.log(`${logPrefix} Wikidata: SUCCESS (image: ${heroUrl ? "yes" : "no"}, summary: ${summary ? "yes" : "no"})`);
                } else {
                    console.log(`${logPrefix} Wikidata: No data returned`);
                }
            } catch (error: any) {
                console.log(`${logPrefix} Wikidata: FAILED - ${error?.message || error}`);
            }
        } else {
            console.log(`${logPrefix} Wikidata: Skipped (temp MBID)`);
        }

        // Fallback to Last.fm if Wikidata didn't work
        if (!summary || !heroUrl) {
            console.log(`${logPrefix} Last.fm: Fetching (need summary: ${!summary}, need image: ${!heroUrl})...`);
            try {
                const validMbid = artist.mbid.startsWith("temp-")
                    ? undefined
                    : artist.mbid;
                const lastfmInfo = await lastFmService.getArtistInfo(
                    artist.name,
                    validMbid
                );
                if (lastfmInfo) {
                    // Extract text from bio object (bio.summary or bio.content)
                    if (!summary && lastfmInfo.bio) {
                        const bio = lastfmInfo.bio as any;
                        summary = bio.summary || bio.content || null;
                        if (summary) {
                            summarySource = "lastfm";
                            console.log(`${logPrefix} Last.fm: Got summary`);
                        }
                    }

                    // Try Fanart.tv for image (only with real MBID)
                    if (!heroUrl && !artist.mbid.startsWith("temp-")) {
                        console.log(`${logPrefix} Fanart.tv: Fetching for MBID ${artist.mbid}...`);
                        try {
                            heroUrl = await fanartService.getArtistImage(
                                artist.mbid
                            );
                            if (heroUrl) {
                                imageSource = "fanart.tv";
                                console.log(`${logPrefix} Fanart.tv: SUCCESS - ${heroUrl.substring(0, 60)}...`);
                            } else {
                                console.log(`${logPrefix} Fanart.tv: No image found`);
                            }
                        } catch (error: any) {
                            console.log(`${logPrefix} Fanart.tv: FAILED - ${error?.message || error}`);
                        }
                    }

                    // Fallback to Deezer
                    if (!heroUrl) {
                        console.log(`${logPrefix} Deezer: Fetching for "${artist.name}"...`);
                        try {
                            heroUrl = await deezerService.getArtistImage(
                                artist.name
                            );
                            if (heroUrl) {
                                imageSource = "deezer";
                                console.log(`${logPrefix} Deezer: SUCCESS - ${heroUrl.substring(0, 60)}...`);
                            } else {
                                console.log(`${logPrefix} Deezer: No image found`);
                            }
                        } catch (error: any) {
                            console.log(`${logPrefix} Deezer: FAILED - ${error?.message || error}`);
                        }
                    }

                    // Last fallback to Last.fm's own image
                    if (!heroUrl && lastfmInfo.image) {
                        const imageArray = lastfmInfo.image as any[];
                        if (Array.isArray(imageArray)) {
                            const bestImage =
                                imageArray.find(
                                    (img) => img.size === "extralarge"
                                )?.["#text"] ||
                                imageArray.find(
                                    (img) => img.size === "large"
                                )?.["#text"] ||
                                imageArray.find(
                                    (img) => img.size === "medium"
                                )?.["#text"];
                            // Filter out Last.fm's placeholder images
                            if (
                                bestImage &&
                                !bestImage.includes(
                                    "2a96cbd8b46e442fc41c2b86b821562f"
                                )
                            ) {
                                heroUrl = bestImage;
                                imageSource = "lastfm";
                                console.log(`${logPrefix} Last.fm image: SUCCESS`);
                            } else {
                                console.log(`${logPrefix} Last.fm image: Placeholder/none`);
                            }
                        }
                    }
                } else {
                    console.log(`${logPrefix} Last.fm: No data returned`);
                }
            } catch (error: any) {
                console.log(`${logPrefix} Last.fm: FAILED - ${error?.message || error}`);
            }
        }

        // Get similar artists from Last.fm
        let similarArtists: Array<{
            name: string;
            mbid: string | null;
            similarity: number;
        }> = [];
        try {
            // Filter out temp MBIDs
            const validMbid = artist.mbid.startsWith("temp-")
                ? ""
                : artist.mbid;
            similarArtists = await lastFmService.getSimilarArtists(
                validMbid,
                artist.name
            );
            console.log(`${logPrefix} Similar artists: Found ${similarArtists.length}`);
        } catch (error: any) {
            console.log(`${logPrefix} Similar artists: FAILED - ${error?.message || error}`);
        }

        // Log enrichment summary
        console.log(`${logPrefix} SUMMARY: image=${imageSource}, summary=${summarySource}, heroUrl=${heroUrl ? "set" : "null"}`);

        // Update artist with enriched data
        await prisma.artist.update({
            where: { id: artist.id },
            data: {
                summary,
                heroUrl,
                lastEnriched: new Date(),
                enrichmentStatus: "completed",
            },
        });

        // Store similar artists
        if (similarArtists.length > 0) {
            // Delete existing similar artist relationships
            await prisma.similarArtist.deleteMany({
                where: { fromArtistId: artist.id },
            });

            // Create new relationships
            for (const similar of similarArtists) {
                // Find existing similar artist (don't create new ones)
                let similarArtistRecord = null;

                if (similar.mbid) {
                    // Try to find by MBID first
                    similarArtistRecord = await prisma.artist.findUnique({
                        where: { mbid: similar.mbid },
                    });
                }

                if (!similarArtistRecord) {
                    // Try to find by normalized name (case-insensitive)
                    const normalizedSimilarName = normalizeArtistName(
                        similar.name
                    );
                    similarArtistRecord = await prisma.artist.findFirst({
                        where: { normalizedName: normalizedSimilarName },
                    });
                }

                // Only create similarity relationship if the similar artist already exists in our database
                // This prevents endless crawling of similar artists
                if (similarArtistRecord) {
                    await prisma.similarArtist.upsert({
                        where: {
                            fromArtistId_toArtistId: {
                                fromArtistId: artist.id,
                                toArtistId: similarArtistRecord.id,
                            },
                        },
                        create: {
                            fromArtistId: artist.id,
                            toArtistId: similarArtistRecord.id,
                            weight: similar.similarity,
                        },
                        update: {
                            weight: similar.similarity,
                        },
                    });
                }
            }

            console.log(`${logPrefix} Stored ${similarArtists.length} similar artist relationships`);
        }

        // ========== ALBUM COVER ENRICHMENT ==========
        // Fetch covers for all albums belonging to this artist that don't have covers yet
        await enrichAlbumCovers(artist.id, heroUrl);

        // Cache artist image in Redis for faster access
        if (heroUrl) {
            try {
                await redisClient.setEx(`hero:${artist.id}`, 7 * 24 * 60 * 60, heroUrl);
            } catch (err) {
                // Redis errors are non-critical
            }
        }
    } catch (error: any) {
        console.error(`${logPrefix} ENRICHMENT FAILED:`, error?.message || error);

        // Mark as failed
        await prisma.artist.update({
            where: { id: artist.id },
            data: { enrichmentStatus: "failed" },
        });

        throw error;
    }
}

/**
 * Enrich album covers for an artist
 * Fetches covers from Cover Art Archive for albums without covers
 */
async function enrichAlbumCovers(artistId: string, artistHeroUrl: string | null): Promise<void> {
    try {
        // Find albums for this artist that don't have cover art
        const albumsWithoutCovers = await prisma.album.findMany({
            where: {
                artistId,
                OR: [
                    { coverUrl: null },
                    { coverUrl: "" },
                ],
            },
            select: {
                id: true,
                rgMbid: true,
                title: true,
            },
        });

        if (albumsWithoutCovers.length === 0) {
            console.log(`    All albums already have covers`);
            return;
        }

        console.log(`    Fetching covers for ${albumsWithoutCovers.length} albums...`);

        let fetchedCount = 0;
        const BATCH_SIZE = 3; // Limit concurrent requests

        // Process in batches to avoid overwhelming Cover Art Archive
        for (let i = 0; i < albumsWithoutCovers.length; i += BATCH_SIZE) {
            const batch = albumsWithoutCovers.slice(i, i + BATCH_SIZE);
            
            await Promise.all(
                batch.map(async (album) => {
                    if (!album.rgMbid) return;

                    try {
                        const coverUrl = await coverArtService.getCoverArt(album.rgMbid);
                        
                        if (coverUrl) {
                            // Save to database
                            await prisma.album.update({
                                where: { id: album.id },
                                data: { coverUrl },
                            });

                            // Cache in Redis
                            try {
                                await redisClient.setEx(
                                    `album-cover:${album.id}`,
                                    30 * 24 * 60 * 60, // 30 days
                                    coverUrl
                                );
                            } catch (err) {
                                // Redis errors are non-critical
                            }

                            fetchedCount++;
                        }
                    } catch (err) {
                        // Cover art fetch failed, continue with next album
                        console.log(`      No cover found for: ${album.title}`);
                    }
                })
            );
        }

        console.log(`    Fetched ${fetchedCount}/${albumsWithoutCovers.length} album covers`);
    } catch (error) {
        console.error(`    Failed to enrich album covers:`, error);
        // Don't throw - album cover failures shouldn't fail the entire enrichment
    }
}
