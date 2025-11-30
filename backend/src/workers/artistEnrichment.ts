import { Artist } from "@prisma/client";
import { prisma } from "../utils/db";
import { wikidataService } from "../services/wikidata";
import { lastFmService } from "../services/lastfm";
import { fanartService } from "../services/fanart";
import { deezerService } from "../services/deezer";
import { musicBrainzService } from "../services/musicbrainz";
import { normalizeArtistName } from "../utils/artistNormalization";

/**
 * Enriches an artist with metadata from Wikidata and Last.fm
 * - Fetches artist bio/summary and hero image from Wikidata
 * - Falls back to Last.fm if Wikidata fails
 * - Fetches similar artists from Last.fm
 */
export async function enrichSimilarArtist(artist: Artist): Promise<void> {
    console.log(`  Enriching artist data...`);

    // Mark as enriching
    await prisma.artist.update({
        where: { id: artist.id },
        data: { enrichmentStatus: "enriching" },
    });

    try {
        // If artist has a temp MBID, try to get the real one from MusicBrainz
        if (artist.mbid.startsWith("temp-")) {
            console.log(`     Temp MBID detected, searching MusicBrainz...`);
            try {
                const mbResults = await musicBrainzService.searchArtist(
                    artist.name,
                    1
                );
                if (mbResults.length > 0 && mbResults[0].id) {
                    const realMbid = mbResults[0].id;
                    console.log(`    Found real MBID: ${realMbid}`);

                    // Update artist with real MBID
                    await prisma.artist.update({
                        where: { id: artist.id },
                        data: { mbid: realMbid },
                    });

                    // Update the local artist object
                    artist.mbid = realMbid;
                } else {
                    console.log(
                        `  No MusicBrainz match found, keeping temp MBID`
                    );
                }
            } catch (error) {
                console.log(`  MusicBrainz search failed:`, error);
            }
        }

        // Try Wikidata first (only if we have a real MBID)
        let summary = null;
        let heroUrl = null;

        if (!artist.mbid.startsWith("temp-")) {
            try {
                const wikidataInfo = await wikidataService.getArtistInfo(
                    artist.mbid
                );
                if (wikidataInfo) {
                    summary = wikidataInfo.summary;
                    heroUrl = wikidataInfo.image;
                    console.log(`    Got info from Wikidata`);
                }
            } catch (error) {
                console.log(`  Wikidata failed, skipping`);
            }
        }

        // Fallback to Last.fm if Wikidata didn't work
        if (!summary || !heroUrl) {
            console.log(`  No Wikidata info, trying Last.fm...`);
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
                    }

                    // Try multiple sources for hero image (Fanart.tv → Deezer → Last.fm)
                    if (!heroUrl && !artist.mbid.startsWith("temp-")) {
                        try {
                            heroUrl = await fanartService.getArtistImage(
                                artist.mbid
                            );
                        } catch (error) {
                            console.log(`  Fanart.tv failed, trying Deezer...`);
                        }
                    }

                    // Fallback to Deezer
                    if (!heroUrl) {
                        try {
                            heroUrl = await deezerService.getArtistImage(
                                artist.name
                            );
                        } catch (error) {
                            console.log(
                                `Deezer failed, using Last.fm image...`
                            );
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
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`  Last.fm failed, skipping`);
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
            console.log(`    Found ${similarArtists.length} similar artists`);
        } catch (error) {
            console.log(`  Could not fetch similar artists`);
        }

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

            console.log(
                `    Stored ${similarArtists.length} similar artist relationships`
            );
        }
    } catch (error) {
        console.error(`     Enrichment failed:`, error);

        // Mark as failed
        await prisma.artist.update({
            where: { id: artist.id },
            data: { enrichmentStatus: "failed" },
        });

        throw error;
    }
}
