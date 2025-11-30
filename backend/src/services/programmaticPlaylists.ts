import { prisma } from "../utils/db";
import { lastFmService } from "./lastfm";

export interface ProgrammaticMix {
    id: string;
    type: string;
    name: string;
    description: string;
    trackIds: string[];
    coverUrls: string[]; // For mosaic cover art
    trackCount: number;
}

// Helper to randomly sample from array
function randomSample<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// Helper to get seeded random number for daily consistency
function getSeededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

export class ProgrammaticPlaylistService {
    private readonly TRACK_LIMIT = 20;
    private readonly DAILY_MIX_COUNT = 5;

    /**
     * Generate 4 daily rotating mixes
     */
    async generateAllMixes(
        userId: string,
        forceRandom = false
    ): Promise<ProgrammaticMix[]> {
        // Get today's date for daily rotation (or random seed if refreshing)
        const today = new Date().toISOString().split("T")[0];
        const seedString = forceRandom
            ? `${userId}-${Date.now()}-${Math.random()}`
            : `${today}-${userId}`;
        const dateSeed = getSeededRandom(seedString);

        console.log(
            `[MIXES] Generating mixes for user ${userId}, forceRandom: ${forceRandom}, seed: ${dateSeed}`
        );

        // Define all possible mix types
        const seedSuffix = forceRandom ? `-${Date.now()}` : "";
        const mixGenerators = [
            {
                fn: () => this.generateEraMix(userId, today + seedSuffix),
                weight: 2,
                name: "Era Mix",
            },
            {
                fn: () => this.generateGenreMix(userId, today + seedSuffix),
                weight: 2,
                name: "Genre Mix",
            },
            {
                fn: () => this.generateTopTracksMix(userId),
                weight: 1,
                name: "Top Tracks Mix",
            },
            {
                fn: () =>
                    this.generateRediscoverMix(userId, today + seedSuffix),
                weight: 1,
                name: "Rediscover Mix",
            },
            {
                fn: () => this.generateArtistSimilarMix(userId),
                weight: 1,
                name: "Artist Similar Mix",
            },
            {
                fn: () =>
                    this.generateRandomDiscoveryMix(userId, today + seedSuffix),
                weight: 1,
                name: "Random Discovery Mix",
            },
            {
                fn: () => this.generatePartyMix(userId, today + seedSuffix),
                weight: 2,
                name: "Party Mix",
            },
            {
                fn: () => this.generateChillMix(userId, today + seedSuffix),
                weight: 2,
                name: "Chill Mix",
            },
            {
                fn: () => this.generateWorkoutMix(userId, today + seedSuffix),
                weight: 2,
                name: "Workout Mix",
            },
            {
                fn: () => this.generateFocusMix(userId, today + seedSuffix),
                weight: 2,
                name: "Focus Mix",
            },
        ];

        // Select 5 mixes based on date seed
        const selectedIndices: number[] = [];
        let seed = dateSeed;

        console.log(
            `[MIXES] Selecting ${this.DAILY_MIX_COUNT} mixes from ${mixGenerators.length} types...`
        );

        while (selectedIndices.length < this.DAILY_MIX_COUNT) {
            seed = (seed * 9301 + 49297) % 233280;
            const index = seed % mixGenerators.length;
            if (!selectedIndices.includes(index)) {
                selectedIndices.push(index);
                console.log(
                    `[MIXES] Selected index ${index}: ${mixGenerators[index].name}`
                );
            }
        }

        console.log(
            `[MIXES] Final selected indices: [${selectedIndices.join(", ")}]`
        );

        // Generate selected mixes
        const mixPromises = selectedIndices.map((i) => {
            console.log(`[MIXES] Generating ${mixGenerators[i].name}...`);
            return mixGenerators[i].fn();
        });
        const mixes = await Promise.all(mixPromises);

        console.log(`[MIXES] Generated ${mixes.length} mixes before filtering`);
        mixes.forEach((mix, i) => {
            if (mix === null) {
                console.log(
                    `[MIXES] Mix ${i} (${
                        mixGenerators[selectedIndices[i]].name
                    }) returned NULL`
                );
            } else {
                console.log(
                    `[MIXES] Mix ${i}: ${mix.name} (${mix.trackCount} tracks)`
                );
            }
        });

        // Filter out null mixes
        let finalMixes = mixes.filter(
            (mix): mix is ProgrammaticMix => mix !== null
        );
        console.log(
            `[MIXES] Returning ${finalMixes.length} mixes after filtering nulls`
        );

        // If we don't have 5 mixes, try to fill gaps with successful generators
        if (finalMixes.length < this.DAILY_MIX_COUNT) {
            console.log(
                `[MIXES] Only got ${finalMixes.length} mixes, trying to fill gaps...`
            );

            // Try generating from all types that weren't selected or failed
            const successfulTypes = new Set(finalMixes.map((m) => m.type));
            const attemptedIndices = new Set(selectedIndices);

            for (
                let i = 0;
                i < mixGenerators.length &&
                finalMixes.length < this.DAILY_MIX_COUNT;
                i++
            ) {
                if (!attemptedIndices.has(i)) {
                    console.log(
                        `[MIXES] Attempting fallback: ${mixGenerators[i].name}`
                    );
                    const fallbackMix = await mixGenerators[i].fn();
                    if (fallbackMix && !successfulTypes.has(fallbackMix.type)) {
                        finalMixes.push(fallbackMix);
                        successfulTypes.add(fallbackMix.type);
                        console.log(
                            `[MIXES] Fallback succeeded: ${fallbackMix.name}`
                        );
                    }
                }
            }

            console.log(`[MIXES] After fallbacks: ${finalMixes.length} mixes`);
        }

        return finalMixes;
    }

    /**
     * Generate ONE era-based mix (rotating decade daily)
     */
    async generateEraMix(
        userId: string,
        today: string
    ): Promise<ProgrammaticMix | null> {
        // Get all decades
        const albums = await prisma.album.findMany({
            where: { tracks: { some: {} } },
            select: { year: true },
        });

        const decades = new Set<number>();
        albums.forEach((album) => {
            if (album.year) {
                const decade = Math.floor(album.year / 10) * 10;
                decades.add(decade);
            }
        });

        if (decades.size === 0) return null;

        // Pick one decade based on today's date
        const decadeArray = Array.from(decades).sort((a, b) => b - a);
        const decadeSeed = getSeededRandom(`era-${today}`);
        const selectedDecade = decadeArray[decadeSeed % decadeArray.length];

        // Get ALL tracks from this decade
        const tracks = await prisma.track.findMany({
            where: {
                album: {
                    year: { gte: selectedDecade, lt: selectedDecade + 10 },
                },
            },
            include: {
                album: { select: { coverUrl: true } },
            },
        });

        if (tracks.length < 10) return null;

        // Random sample 20 tracks
        const selectedTracks = randomSample(tracks, this.TRACK_LIMIT);
        const coverUrls = selectedTracks
            .filter((t) => t.album.coverUrl)
            .slice(0, 4)
            .map((t) => t.album.coverUrl!);

        return {
            id: `era-${selectedDecade}-${today}`,
            type: "era",
            name: `Your ${selectedDecade}s Mix`,
            description: `Random picks from the ${selectedDecade}s`,
            trackIds: selectedTracks.map((t) => t.id),
            coverUrls,
            trackCount: selectedTracks.length,
        };
    }

    /**
     * Generate ONE genre-based mix (rotating genre daily)
     */
    async generateGenreMix(
        userId: string,
        today: string
    ): Promise<ProgrammaticMix | null> {
        // Get top genres
        const genres = await prisma.genre.findMany({
            include: {
                _count: { select: { trackGenres: true } },
            },
            orderBy: {
                trackGenres: { _count: "desc" },
            },
            take: 20,
        });

        console.log(`[GENRE MIX] Found ${genres.length} genres total`);
        const validGenres = genres.filter((g) => g._count.trackGenres >= 5);
        console.log(
            `[GENRE MIX] ${validGenres.length} genres have >= 5 tracks`
        );
        if (validGenres.length === 0) {
            console.log(`[GENRE MIX] FAILED: No genres with enough tracks`);
            return null;
        }

        // Pick one genre based on today's date
        const genreSeed = getSeededRandom(`genre-${today}`);
        const selectedGenre = validGenres[genreSeed % validGenres.length];

        // Get ALL tracks from this genre
        const trackGenres = await prisma.trackGenre.findMany({
            where: { genreId: selectedGenre.id },
            include: {
                track: {
                    include: {
                        album: { select: { coverUrl: true } },
                    },
                },
            },
        });

        const tracks = trackGenres.map((tg) => tg.track);
        if (tracks.length < 5) return null;

        // Random sample 20 tracks
        const selectedTracks = randomSample(tracks, this.TRACK_LIMIT);
        const coverUrls = selectedTracks
            .filter((t) => t.album.coverUrl)
            .slice(0, 4)
            .map((t) => t.album.coverUrl!);

        return {
            id: `genre-${selectedGenre.id}-${today}`,
            type: "genre",
            name: `Your ${selectedGenre.name} Mix`,
            description: `Random ${selectedGenre.name} picks`,
            trackIds: selectedTracks.map((t) => t.id),
            coverUrls,
            trackCount: selectedTracks.length,
        };
    }

    /**
     * Generate "Your Top 20" mix
     */
    async generateTopTracksMix(
        userId: string
    ): Promise<ProgrammaticMix | null> {
        const playStats = await prisma.play.groupBy({
            by: ["trackId"],
            where: { userId },
            _count: { trackId: true },
            orderBy: { _count: { trackId: "desc" } },
            take: this.TRACK_LIMIT,
        });

        console.log(
            `[TOP TRACKS MIX] Found ${playStats.length} unique played tracks`
        );
        if (playStats.length < 5) {
            console.log(
                `[TOP TRACKS MIX] FAILED: Only ${playStats.length} tracks (need at least 5)`
            );
            return null;
        }

        const trackIds = playStats.map((p) => p.trackId);
        const tracks = await prisma.track.findMany({
            where: { id: { in: trackIds } },
            include: {
                album: { select: { coverUrl: true } },
            },
        });

        // Preserve play count order
        const orderedTracks = trackIds
            .map((id) => tracks.find((t) => t.id === id))
            .filter((t) => t !== undefined);

        const coverUrls = orderedTracks
            .filter((t) => t.album.coverUrl)
            .slice(0, 4)
            .map((t) => t.album.coverUrl!);

        return {
            id: "top-tracks",
            type: "top-tracks",
            name: "Your Top 20",
            description: "Your most played tracks",
            trackIds: orderedTracks.map((t) => t.id),
            coverUrls,
            trackCount: orderedTracks.length,
        };
    }

    /**
     * Generate "Rediscover" mix with daily rotation
     */
    async generateRediscoverMix(
        userId: string,
        today: string
    ): Promise<ProgrammaticMix | null> {
        // Get tracks with low play count (0-2 plays)
        const allTracks = await prisma.track.findMany({
            include: {
                _count: {
                    select: {
                        plays: { where: { userId } },
                    },
                },
                album: { select: { coverUrl: true } },
            },
        });

        const underplayedTracks = allTracks.filter((t) => t._count.plays <= 2);

        if (underplayedTracks.length < 5) return null;

        // Use date seed for consistent daily selection
        const seed = getSeededRandom(`rediscover-${today}`);
        let random = seed;
        const shuffled = underplayedTracks.sort(() => {
            random = (random * 9301 + 49297) % 233280;
            return random / 233280 - 0.5;
        });

        const selectedTracks = shuffled.slice(0, this.TRACK_LIMIT);
        const coverUrls = selectedTracks
            .filter((t) => t.album.coverUrl)
            .slice(0, 4)
            .map((t) => t.album.coverUrl!);

        return {
            id: `rediscover-${today}`,
            type: "rediscover",
            name: "Rediscover",
            description: "Hidden gems you rarely play",
            trackIds: selectedTracks.map((t) => t.id),
            coverUrls,
            trackCount: selectedTracks.length,
        };
    }

    /**
     * Generate "More Like X" mix
     */
    async generateArtistSimilarMix(
        userId: string
    ): Promise<ProgrammaticMix | null> {
        // Get most played artist from last 7 days
        const recentPlays = await prisma.play.findMany({
            where: {
                userId,
                playedAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            },
            include: {
                track: {
                    include: {
                        album: { select: { artistId: true } },
                    },
                },
            },
        });

        console.log(
            `[ARTIST SIMILAR MIX] Found ${recentPlays.length} plays in last 7 days`
        );
        if (recentPlays.length === 0) {
            console.log(`[ARTIST SIMILAR MIX] FAILED: No plays in last 7 days`);
            return null;
        }

        // Count plays by artist
        const artistPlayCounts = new Map<string, number>();
        recentPlays.forEach((play) => {
            const artistId = play.track.album.artistId;
            artistPlayCounts.set(
                artistId,
                (artistPlayCounts.get(artistId) || 0) + 1
            );
        });

        // Get top artist
        const topArtistId = Array.from(artistPlayCounts.entries()).sort(
            (a, b) => b[1] - a[1]
        )[0][0];

        const topArtist = await prisma.artist.findUnique({
            where: { id: topArtistId },
        });

        if (!topArtist || !topArtist.name) {
            console.log(
                `[ARTIST SIMILAR MIX] FAILED: Top artist not found or has no name`
            );
            return null;
        }

        console.log(`[ARTIST SIMILAR MIX] Top artist: ${topArtist.name}`);

        // Get similar artists from Last.fm
        try {
            const similarArtists = await lastFmService.getSimilarArtists(
                topArtist.name,
                "10"
            );

            console.log(
                `[ARTIST SIMILAR MIX] Last.fm returned ${similarArtists.length} similar artists`
            );

            const similarArtistNames = similarArtists.map((a) => a.name);
            const artistsInLibrary = await prisma.artist.findMany({
                where: { name: { in: similarArtistNames } },
                include: {
                    albums: {
                        include: {
                            tracks: {
                                include: {
                                    album: { select: { coverUrl: true } },
                                },
                            },
                        },
                    },
                },
            });

            console.log(
                `[ARTIST SIMILAR MIX] Found ${artistsInLibrary.length} similar artists in library`
            );

            const tracks = artistsInLibrary.flatMap((artist) =>
                artist.albums.flatMap((album) => album.tracks)
            );

            console.log(
                `[ARTIST SIMILAR MIX] Total tracks from similar artists: ${tracks.length}`
            );

            if (tracks.length < 5) {
                console.log(
                    `[ARTIST SIMILAR MIX] FAILED: Only ${tracks.length} tracks (need at least 5)`
                );
                return null;
            }

            const selectedTracks = randomSample(tracks, this.TRACK_LIMIT);
            const coverUrls = selectedTracks
                .filter((t) => t.album.coverUrl)
                .slice(0, 4)
                .map((t) => t.album.coverUrl!);

            return {
                id: `artist-similar-${topArtistId}`,
                type: "artist-similar",
                name: `More Like ${topArtist.name}`,
                description: `Similar artists you might enjoy`,
                trackIds: selectedTracks.map((t) => t.id),
                coverUrls,
                trackCount: selectedTracks.length,
            };
        } catch (error) {
            console.error("Failed to generate artist similar mix:", error);
            return null;
        }
    }

    /**
     * Generate random discovery mix with daily rotation
     */
    async generateRandomDiscoveryMix(
        userId: string,
        today: string
    ): Promise<ProgrammaticMix | null> {
        const totalAlbums = await prisma.album.count({
            where: { tracks: { some: {} } },
        });

        if (totalAlbums < 10) return null;

        // Use date as seed for consistent daily randomness
        const seed = getSeededRandom(`random-${today}`) % totalAlbums;

        const randomAlbums = await prisma.album.findMany({
            where: { tracks: { some: {} } },
            include: {
                tracks: {
                    include: {
                        album: { select: { coverUrl: true } },
                    },
                },
            },
            skip: seed,
            take: 5, // Just a few albums
        });

        const tracks = randomAlbums.flatMap((album) => album.tracks);
        if (tracks.length < 5) return null;

        const selectedTracks = randomSample(tracks, this.TRACK_LIMIT);
        const coverUrls = randomAlbums
            .filter((a) => a.coverUrl)
            .slice(0, 4)
            .map((a) => a.coverUrl!);

        return {
            id: `random-discovery-${today}`,
            type: "random-discovery",
            name: "Random Discovery",
            description: "Random albums to explore today",
            trackIds: selectedTracks.map((t) => t.id),
            coverUrls,
            trackCount: selectedTracks.length,
        };
    }

    /**
     * Generate "Party Playlist" mix - upbeat dance, electronic, pop tracks
     */
    async generatePartyMix(
        userId: string,
        today: string
    ): Promise<ProgrammaticMix | null> {
        // Party genres: dance, electronic, pop, disco, house, techno, edm, funk
        const partyGenres = [
            "Dance",
            "Electronic",
            "Pop",
            "Disco",
            "House",
            "Techno",
            "EDM",
            "Funk",
            "Electro",
            "Dance Pop",
            "Dance-Pop",
            "Club",
            "Eurodance",
            "Trance",
            "Dubstep",
            "Drum and Bass",
            "Hip Hop",
        ];

        // Find matching genres in the database (case insensitive)
        const genres = await prisma.genre.findMany({
            where: {
                name: {
                    in: partyGenres,
                    mode: "insensitive",
                },
            },
            include: {
                trackGenres: {
                    include: {
                        track: {
                            include: {
                                album: { select: { coverUrl: true } },
                            },
                        },
                    },
                },
            },
        });

        const tracks = genres.flatMap((genre) =>
            genre.trackGenres.map((tg) => tg.track)
        );

        if (tracks.length < 10) return null;

        // Use date seed for consistent daily selection
        const seed = getSeededRandom(`party-${today}`);
        let random = seed;
        const shuffled = tracks.sort(() => {
            random = (random * 9301 + 49297) % 233280;
            return random / 233280 - 0.5;
        });

        const selectedTracks = shuffled.slice(0, this.TRACK_LIMIT);
        const coverUrls = selectedTracks
            .filter((t) => t.album.coverUrl)
            .slice(0, 4)
            .map((t) => t.album.coverUrl!);

        return {
            id: `party-${today}`,
            type: "party",
            name: "Party Playlist",
            description: "High energy dance, EDM, and pop hits",
            trackIds: selectedTracks.map((t) => t.id),
            coverUrls,
            trackCount: selectedTracks.length,
        };
    }

    /**
     * Generate "Chill Mix" - relaxing, mellow tracks
     */
    async generateChillMix(
        userId: string,
        today: string
    ): Promise<ProgrammaticMix | null> {
        // Chill genres: ambient, chillout, downtempo, lo-fi, acoustic, indie folk
        const chillGenres = [
            "Ambient",
            "Chillout",
            "Downtempo",
            "Lo-Fi",
            "Acoustic",
            "Indie Folk",
            "Folk",
            "Chillwave",
            "Dream Pop",
            "Soft Rock",
            "Singer-Songwriter",
            "Neo-Soul",
            "Trip Hop",
            "Easy Listening",
        ];

        const genres = await prisma.genre.findMany({
            where: {
                name: {
                    in: chillGenres,
                    mode: "insensitive",
                },
            },
            include: {
                trackGenres: {
                    include: {
                        track: {
                            include: {
                                album: { select: { coverUrl: true } },
                            },
                        },
                    },
                },
            },
        });

        const tracks = genres.flatMap((genre) =>
            genre.trackGenres.map((tg) => tg.track)
        );

        if (tracks.length < 10) return null;

        const seed = getSeededRandom(`chill-${today}`);
        let random = seed;
        const shuffled = tracks.sort(() => {
            random = (random * 9301 + 49297) % 233280;
            return random / 233280 - 0.5;
        });

        const selectedTracks = shuffled.slice(0, this.TRACK_LIMIT);
        const coverUrls = selectedTracks
            .filter((t) => t.album.coverUrl)
            .slice(0, 4)
            .map((t) => t.album.coverUrl!);

        return {
            id: `chill-${today}`,
            type: "chill",
            name: "Chill Mix",
            description: "Relax and unwind with mellow vibes",
            trackIds: selectedTracks.map((t) => t.id),
            coverUrls,
            trackCount: selectedTracks.length,
        };
    }

    /**
     * Generate "Workout Mix" - high energy, motivational tracks
     */
    async generateWorkoutMix(
        userId: string,
        today: string
    ): Promise<ProgrammaticMix | null> {
        // Workout genres: rock, metal, hip hop, electronic with high energy
        const workoutGenres = [
            "Rock",
            "Metal",
            "Hard Rock",
            "Alternative Rock",
            "Punk",
            "Hip Hop",
            "Rap",
            "Trap",
            "Hardcore",
            "Metalcore",
            "Industrial",
            "Drum and Bass",
            "Hardstyle",
            "Nu Metal",
        ];

        const genres = await prisma.genre.findMany({
            where: {
                name: {
                    in: workoutGenres,
                    mode: "insensitive",
                },
            },
            include: {
                trackGenres: {
                    include: {
                        track: {
                            include: {
                                album: { select: { coverUrl: true } },
                            },
                        },
                    },
                },
            },
        });

        const tracks = genres.flatMap((genre) =>
            genre.trackGenres.map((tg) => tg.track)
        );

        if (tracks.length < 10) return null;

        const seed = getSeededRandom(`workout-${today}`);
        let random = seed;
        const shuffled = tracks.sort(() => {
            random = (random * 9301 + 49297) % 233280;
            return random / 233280 - 0.5;
        });

        const selectedTracks = shuffled.slice(0, this.TRACK_LIMIT);
        const coverUrls = selectedTracks
            .filter((t) => t.album.coverUrl)
            .slice(0, 4)
            .map((t) => t.album.coverUrl!);

        return {
            id: `workout-${today}`,
            type: "workout",
            name: "Workout Mix",
            description: "High energy tracks to power your workout",
            trackIds: selectedTracks.map((t) => t.id),
            coverUrls,
            trackCount: selectedTracks.length,
        };
    }

    /**
     * Generate "Focus Mix" - instrumental, minimal vocals, concentration music
     */
    async generateFocusMix(
        userId: string,
        today: string
    ): Promise<ProgrammaticMix | null> {
        // Focus genres: classical, instrumental, jazz, electronic (ambient types)
        const focusGenres = [
            "Classical",
            "Instrumental",
            "Jazz",
            "Piano",
            "Ambient",
            "Post-Rock",
            "Math Rock",
            "Soundtrack",
            "Score",
            "Contemporary Classical",
            "Minimal",
            "Modern Classical",
            "Neoclassical",
        ];

        const genres = await prisma.genre.findMany({
            where: {
                name: {
                    in: focusGenres,
                    mode: "insensitive",
                },
            },
            include: {
                trackGenres: {
                    include: {
                        track: {
                            include: {
                                album: { select: { coverUrl: true } },
                            },
                        },
                    },
                },
            },
        });

        const tracks = genres.flatMap((genre) =>
            genre.trackGenres.map((tg) => tg.track)
        );

        if (tracks.length < 10) return null;

        const seed = getSeededRandom(`focus-${today}`);
        let random = seed;
        const shuffled = tracks.sort(() => {
            random = (random * 9301 + 49297) % 233280;
            return random / 233280 - 0.5;
        });

        const selectedTracks = shuffled.slice(0, this.TRACK_LIMIT);
        const coverUrls = selectedTracks
            .filter((t) => t.album.coverUrl)
            .slice(0, 4)
            .map((t) => t.album.coverUrl!);

        return {
            id: `focus-${today}`,
            type: "focus",
            name: "Focus Mix",
            description: "Concentration music for deep work",
            trackIds: selectedTracks.map((t) => t.id),
            coverUrls,
            trackCount: selectedTracks.length,
        };
    }
}

export const programmaticPlaylistService = new ProgrammaticPlaylistService();
