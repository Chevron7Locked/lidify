/**
 * React Query Hooks for API Caching
 *
 * This file provides custom React Query hooks for the most frequently called APIs
 * in the music streaming app. These hooks implement smart caching strategies to:
 * - Reduce unnecessary API calls
 * - Improve perceived performance
 * - Provide automatic background refetching
 * - Handle loading and error states consistently
 *
 * Stale time configuration rationale:
 * - Artist data: 10 minutes (rarely changes)
 * - Album data: 10 minutes (rarely changes)
 * - Library/Home data: 2 minutes (may change as user adds music)
 * - Search results: 5 minutes (relatively static for same query)
 * - Playlists: 1 minute (user may be actively modifying)
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Artist, Album, Track } from "@/features/library/types";

export const queryKeys = {
    // Artist queries
    artist: (id: string) => ["artist", id] as const,
    artistLibrary: (id: string) => ["artist", "library", id] as const,
    artistDiscovery: (id: string) => ["artist", "discovery", id] as const,

    // Album queries
    album: (id: string) => ["album", id] as const,
    albumLibrary: (id: string) => ["album", "library", id] as const,
    albumDiscovery: (id: string) => ["album", "discovery", id] as const,
    albums: (filters?: Record<string, unknown>) => ["albums", filters] as const,

    // Library queries
    library: () => ["library"] as const,
    libraryArtists: (params: {
        filter?: string;
        sortBy?: string;
        limit?: number;
        offset?: number;
    }) => ["library", "artists", params] as const,
    libraryAlbums: (params: {
        filter?: string;
        sortBy?: string;
        limit?: number;
        offset?: number;
    }) => ["library", "albums", params] as const,
    libraryTracks: (params: {
        sortBy?: string;
        limit?: number;
        offset?: number;
    }) => ["library", "tracks", params] as const,
    recentlyListened: (limit?: number) =>
        ["library", "recently-listened", limit] as const,
    recentlyAdded: (limit?: number) =>
        ["library", "recently-added", limit] as const,

    // Recommendations
    recommendations: (limit?: number) => ["recommendations", limit] as const,
    similarArtists: (seedArtistId: string, limit?: number) =>
        ["recommendations", "artists", seedArtistId, limit] as const,
    similarAlbums: (seedAlbumId: string, limit?: number) =>
        ["recommendations", "albums", seedAlbumId, limit] as const,

    // Search
    search: (query: string, type?: string, limit?: number) =>
        ["search", query, type, limit] as const,
    discoverSearch: (query: string, type?: string, limit?: number) =>
        ["search", "discover", query, type, limit] as const,

    // Playlists
    playlists: () => ["playlists"] as const,
    playlist: (id: string) => ["playlist", id] as const,

    // Mixes
    mixes: () => ["mixes"] as const,
    mix: (id: string) => ["mix", id] as const,

    // Popular artists
    popularArtists: (limit?: number) => ["popular-artists", limit] as const,

    // Audiobooks
    audiobooks: () => ["audiobooks"] as const,
    audiobook: (id: string) => ["audiobook", id] as const,

    // Podcasts
    podcasts: () => ["podcasts"] as const,
    podcast: (id: string) => ["podcast", id] as const,
    topPodcasts: (limit?: number, genreId?: number) =>
        ["podcasts", "top", limit, genreId] as const,

    // Browse (Deezer playlists/radios)
    browseAll: () => ["browse", "all"] as const,
    browseFeatured: (limit?: number) => ["browse", "featured", limit] as const,
    browseRadios: (limit?: number) => ["browse", "radios", limit] as const,
};

/**
 * Hook to fetch artist data with automatic library/discovery fallback
 *
 * Tries library first, falls back to discovery if not found.
 * Cache time: 10 minutes (artist data rarely changes)
 *
 * @param id - Artist ID or MusicBrainz ID
 * @returns Query result with artist data
 *
 * @example
 * const { data: artist, isLoading, error } = useArtistQuery("artist-123");
 */
export function useArtistQuery(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.artist(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Artist ID is required");

            // Try library first
            try {
                return await api.getArtist(id);
            } catch {
                // Fallback to discovery
                return await api.getArtistDiscovery(id);
            }
        },
        enabled: !!id,
        staleTime: 10 * 60 * 1000, // 10 minutes
        retry: 1,
    });
}

/**
 * Hook to fetch artist data from library only
 *
 * @param id - Artist ID
 * @returns Query result with artist data from library
 */
export function useArtistLibraryQuery(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.artistLibrary(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Artist ID is required");
            return await api.getArtist(id);
        },
        enabled: !!id,
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to fetch artist data from discovery only
 *
 * @param id - Artist name or MusicBrainz ID
 * @returns Query result with artist data from Last.fm
 */
export function useArtistDiscoveryQuery(nameOrMbid: string | undefined) {
    return useQuery({
        queryKey: queryKeys.artistDiscovery(nameOrMbid || ""),
        queryFn: async () => {
            if (!nameOrMbid) throw new Error("Artist name or MBID is required");
            return await api.getArtistDiscovery(nameOrMbid);
        },
        enabled: !!nameOrMbid,
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to fetch album data with automatic library/discovery fallback
 *
 * Cache time: 10 minutes (album data rarely changes)
 *
 * @param id - Album ID or Release Group MBID
 * @returns Query result with album data
 *
 * @example
 * const { data: album, isLoading, error } = useAlbumQuery("album-123");
 */
export function useAlbumQuery(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.album(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Album ID is required");

            // Try library first
            try {
                return await api.getAlbum(id);
            } catch {
                // Fallback to discovery
                return await api.getAlbumDiscovery(id);
            }
        },
        enabled: !!id,
        staleTime: 10 * 60 * 1000, // 10 minutes
        retry: 1,
    });
}

/**
 * Hook to fetch album data from library only
 *
 * @param id - Album ID
 * @returns Query result with album data from library
 */
export function useAlbumLibraryQuery(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.albumLibrary(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Album ID is required");
            return await api.getAlbum(id);
        },
        enabled: !!id,
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to fetch album data from discovery only
 *
 * @param rgMbid - Release Group MusicBrainz ID
 * @returns Query result with album data from Last.fm
 */
export function useAlbumDiscoveryQuery(rgMbid: string | undefined) {
    return useQuery({
        queryKey: queryKeys.albumDiscovery(rgMbid || ""),
        queryFn: async () => {
            if (!rgMbid) throw new Error("Album MBID is required");
            return await api.getAlbumDiscovery(rgMbid);
        },
        enabled: !!rgMbid,
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to fetch albums list with optional filters
 *
 * @param params - Filter parameters (artistId, limit, offset)
 * @returns Query result with albums array
 *
 * @example
 * const { data } = useAlbumsQuery({ artistId: "123", limit: 20 });
 */
export function useAlbumsQuery(params?: {
    artistId?: string;
    limit?: number;
    offset?: number;
}) {
    return useQuery({
        queryKey: queryKeys.albums(params),
        queryFn: () => api.getAlbums(params),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch recently listened items (Continue Listening)
 *
 * Cache time: 2 minutes (may change frequently)
 *
 * @param limit - Number of items to fetch (default: 10)
 * @returns Query result with recently listened items
 *
 * @example
 * const { data } = useRecentlyListenedQuery(10);
 */
export function useRecentlyListenedQuery(limit: number = 10) {
    return useQuery({
        queryKey: queryKeys.recentlyListened(limit),
        queryFn: () => api.getRecentlyListened(limit),
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Hook to fetch recently added artists
 *
 * Cache time: 2 minutes (may change as user adds music)
 *
 * @param limit - Number of items to fetch (default: 10)
 * @returns Query result with recently added artists
 *
 * @example
 * const { data } = useRecentlyAddedQuery(10);
 */
export function useRecentlyAddedQuery(limit: number = 10) {
    return useQuery({
        queryKey: queryKeys.recentlyAdded(limit),
        queryFn: () => api.getRecentlyAdded(limit),
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

export type LibraryFilter = "owned" | "discovery" | "all";
export type SortOption = "name" | "name-desc" | "recent" | "tracks";

interface LibraryArtistsParams {
    filter?: LibraryFilter;
    sortBy?: SortOption;
    limit?: number;
    page?: number;
    enabled?: boolean;
}

interface LibraryAlbumsParams {
    filter?: LibraryFilter;
    sortBy?: SortOption;
    limit?: number;
    page?: number;
    enabled?: boolean;
}

interface LibraryTracksParams {
    sortBy?: SortOption;
    limit?: number;
    page?: number;
    enabled?: boolean;
}

// Page response types for infinite queries
interface ArtistsPageResponse {
    artists: Artist[];
    total: number;
    offset: number;
    limit: number;
}

interface AlbumsPageResponse {
    albums: Album[];
    total: number;
    offset: number;
    limit: number;
}

interface TracksPageResponse {
    tracks: Track[];
    total: number;
    offset: number;
    limit: number;
}

// Sort functions - defined once outside components to prevent recreation
const sortArtists = (artists: Artist[], sortBy: SortOption): Artist[] => {
    return [...artists].sort((a, b) => {
        switch (sortBy) {
            case "name":
                return a.name.localeCompare(b.name);
            case "name-desc":
                return b.name.localeCompare(a.name);
            case "tracks":
                return (b.trackCount || 0) - (a.trackCount || 0);
            default:
                return 0;
        }
    });
};

const sortAlbums = (albums: Album[], sortBy: SortOption): Album[] => {
    return [...albums].sort((a, b) => {
        switch (sortBy) {
            case "name":
                return a.title.localeCompare(b.title);
            case "name-desc":
                return b.title.localeCompare(a.title);
            case "recent":
                return (b.year || 0) - (a.year || 0);
            default:
                return 0;
        }
    });
};

const sortTracks = (tracks: Track[], sortBy: SortOption): Track[] => {
    return [...tracks].sort((a, b) => {
        switch (sortBy) {
            case "name":
                return a.title.localeCompare(b.title);
            case "name-desc":
                return b.title.localeCompare(a.title);
            default:
                return 0;
        }
    });
};

/**
 * Hook to fetch library artists with pagination and filtering
 *
 * Cache time: 2 minutes (may change as user adds music)
 */
export function useLibraryArtistsQuery({
    filter = "owned",
    sortBy = "name",
    limit = 40,
    page = 1,
    enabled = true,
}: LibraryArtistsParams = {}) {
    const offset = (page - 1) * limit;
    return useQuery({
        queryKey: queryKeys.libraryArtists({ filter, sortBy, limit, offset }),
        queryFn: () => api.getArtists({ limit, offset, filter }),
        select: (response) => ({
            artists: sortArtists(response.artists, sortBy),
            total: response.total,
            offset: response.offset,
            limit: response.limit,
        }),
        staleTime: 2 * 60 * 1000,
        enabled,
        // Add structural sharing to prevent unnecessary re-renders
        structuralSharing: true,
        // Use placeholder data for better perceived performance
        placeholderData: (previousData) => previousData,
    });
}

/**
 * Hook to fetch library albums with infinite pagination and filtering
 *
 * Cache time: 2 minutes (may change as user adds music)
 */
export function useLibraryAlbumsInfiniteQuery(
    {
        filter = "owned",
        sortBy = "name",
        limit = 40,
        enabled = true,
    }: Omit<LibraryAlbumsParams, 'page'> & { enabled?: boolean } = {},
) {
    return useInfiniteQuery<AlbumsPageResponse, Error, { pages: AlbumsPageResponse[], pageParams: number[] }, readonly unknown[], number>({
        queryKey: queryKeys.libraryAlbums({ filter, sortBy, limit }),
        queryFn: async ({ pageParam }) => {
            const offset = (pageParam - 1) * limit;
            const response = await api.getAlbums({ limit, offset, filter });
            return {
                albums: sortAlbums(response.albums, sortBy),
                total: response.total,
                offset: response.offset,
                limit: response.limit,
            };
        },
        getNextPageParam: (lastPage: AlbumsPageResponse, allPages: AlbumsPageResponse[]) => {
            const totalItems = lastPage.total;
            const fetchedItems = allPages.flatMap(page => page.albums).length;
            return fetchedItems < totalItems ? allPages.length + 1 : undefined;
        },
        initialPageParam: 1,
        enabled,
    });
}

/**
 * Hook to fetch library artists with infinite pagination and filtering
 *
 * Cache time: 2 minutes (may change as user adds music)
 */
export function useLibraryArtistsInfiniteQuery(
    {
        filter = "owned",
        sortBy = "name",
        limit = 40,
        enabled = true,
    }: Omit<LibraryArtistsParams, 'page'> & { enabled?: boolean } = {},
) {
    return useInfiniteQuery<ArtistsPageResponse, Error, { pages: ArtistsPageResponse[], pageParams: number[] }, readonly unknown[], number>({
        queryKey: queryKeys.libraryArtists({ filter, sortBy, limit }),
        queryFn: async ({ pageParam }) => {
            const offset = (pageParam - 1) * limit;
            const response = await api.getArtists({ limit, offset, filter });
            return {
                artists: sortArtists(response.artists, sortBy),
                total: response.total,
                offset: response.offset,
                limit: response.limit,
            };
        },
        getNextPageParam: (lastPage: ArtistsPageResponse, allPages: ArtistsPageResponse[]) => {
            const totalItems = lastPage.total;
            const fetchedItems = allPages.flatMap(page => page.artists).length;
            return fetchedItems < totalItems ? allPages.length + 1 : undefined;
        },
        initialPageParam: 1,
        enabled,
    });
}

/**
 * Hook to fetch library albums with pagination and filtering
 *
 * Cache time: 2 minutes (may change as user adds music)
 */
export function useLibraryAlbumsQuery({
    filter = "owned",
    sortBy = "name",
    limit = 40,
    page = 1,
    enabled = true,
}: LibraryAlbumsParams = {}) {
    const offset = (page - 1) * limit;
    return useQuery({
        queryKey: queryKeys.libraryAlbums({ filter, sortBy, limit, offset }),
        queryFn: () => api.getAlbums({ limit, offset, filter }),
        select: (response) => ({
            albums: sortAlbums(response.albums, sortBy),
            total: response.total,
            offset: response.offset,
            limit: response.limit,
        }),
        staleTime: 2 * 60 * 1000,
        enabled,
    });
}

/**
 * Hook to fetch library tracks with infinite pagination
 *
 * Cache time: 2 minutes (may change as user adds music)
 */
export function useLibraryTracksInfiniteQuery(
    {
        sortBy = "name",
        limit = 40,
        enabled = true,
    }: Omit<LibraryTracksParams, 'page'> & { enabled?: boolean } = {},
) {
    return useInfiniteQuery<TracksPageResponse, Error, { pages: TracksPageResponse[], pageParams: number[] }, readonly unknown[], number>({
        queryKey: queryKeys.libraryTracks({ sortBy, limit }),
        queryFn: async ({ pageParam }) => {
            const offset = (pageParam - 1) * limit;
            const response = await api.getTracks({ limit, offset });
            return {
                tracks: sortTracks(response.tracks, sortBy),
                total: response.total,
                offset: response.offset,
                limit: response.limit,
            };
        },
        getNextPageParam: (lastPage: TracksPageResponse, allPages: TracksPageResponse[]) => {
            const totalItems = lastPage.total;
            const fetchedItems = allPages.flatMap(page => page.tracks).length;
            return fetchedItems < totalItems ? allPages.length + 1 : undefined;
        },
        initialPageParam: 1,
        enabled,
    });
}

/**
 * Hook to fetch library tracks with pagination
 *
 * Cache time: 2 minutes (may change as user adds music)
 */
export function useLibraryTracksQuery({
    sortBy = "name",
    limit = 40,
    page = 1,
    enabled = true,
}: LibraryTracksParams = {}) {
    const offset = (page - 1) * limit;
    return useQuery({
        queryKey: queryKeys.libraryTracks({ sortBy, limit, offset }),
        queryFn: () => api.getTracks({ limit, offset }),
        select: (response) => ({
            tracks: sortTracks(response.tracks, sortBy),
            total: response.total,
            offset: response.offset,
            limit: response.limit,
        }),
        staleTime: 2 * 60 * 1000,
        enabled,
    });
}

/**
 * Hook to fetch personalized recommendations
 *
 * Cache time: 5 minutes
 *
 * @param limit - Number of recommendations (default: 10)
 * @returns Query result with recommended artists
 *
 * @example
 * const { data } = useRecommendationsQuery(10);
 */
export function useRecommendationsQuery(limit: number = 10) {
    return useQuery({
        queryKey: queryKeys.recommendations(limit),
        queryFn: () => api.getRecommendationsForYou(limit),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch similar artists based on a seed artist
 *
 * @param seedArtistId - Artist ID to find similar artists for
 * @param limit - Number of recommendations (default: 20)
 * @returns Query result with similar artists
 *
 * @example
 * const { data } = useSimilarArtistsQuery("artist-123", 20);
 */
export function useSimilarArtistsQuery(
    seedArtistId: string | undefined,
    limit: number = 20,
) {
    return useQuery({
        queryKey: queryKeys.similarArtists(seedArtistId || "", limit),
        queryFn: async () => {
            if (!seedArtistId) throw new Error("Seed artist ID is required");
            return await api.getSimilarArtists(seedArtistId, limit);
        },
        enabled: !!seedArtistId,
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to fetch similar albums based on a seed album
 *
 * @param seedAlbumId - Album ID to find similar albums for
 * @param limit - Number of recommendations (default: 20)
 * @returns Query result with similar albums
 */
export function useSimilarAlbumsQuery(
    seedAlbumId: string | undefined,
    limit: number = 20,
) {
    return useQuery({
        queryKey: queryKeys.similarAlbums(seedAlbumId || "", limit),
        queryFn: async () => {
            if (!seedAlbumId) throw new Error("Seed album ID is required");
            return await api.getSimilarAlbums(seedAlbumId, limit);
        },
        enabled: !!seedAlbumId,
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to search library with debouncing
 *
 * Cache time: 5 minutes (search results are relatively static)
 *
 * @param query - Search query string
 * @param type - Type filter (all, artists, albums, tracks, audiobooks, podcasts)
 * @param limit - Number of results per type (default: 20)
 * @returns Query result with search results
 *
 * @example
 * const { data } = useSearchQuery("radiohead", "all", 20);
 */
export function useSearchQuery(
    query: string,
    type:
        | "all"
        | "artists"
        | "albums"
        | "tracks"
        | "audiobooks"
        | "podcasts" = "all",
    limit: number = 20,
) {
    return useQuery({
        queryKey: queryKeys.search(query, type, limit),
        queryFn: ({ signal }) => api.search(query, type, limit, signal),
        enabled: query.length >= 2, // Only search if query is at least 2 characters
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to search discovery/Last.fm with debouncing
 *
 * @param query - Search query string
 * @param type - Type filter (music, podcasts, all)
 * @param limit - Number of results (default: 20)
 * @returns Query result with discovery search results
 *
 * @example
 * const { data } = useDiscoverSearchQuery("radiohead", "music", 20);
 */
export function useDiscoverSearchQuery(
    query: string,
    type: "music" | "podcasts" | "all" = "music",
    limit: number = 20,
) {
    return useQuery({
        queryKey: queryKeys.discoverSearch(query, type, limit),
        queryFn: ({ signal }) => api.discoverSearch(query, type, limit, signal),
        enabled: query.length >= 2,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch all playlists
 *
 * Cache time: 1 minute (playlists may be actively modified)
 *
 * @returns Query result with playlists array
 *
 * @example
 * const { data: playlists } = usePlaylistsQuery();
 */
export function usePlaylistsQuery() {
    return useQuery({
        queryKey: queryKeys.playlists(),
        queryFn: () => api.getPlaylists(),
        staleTime: 1 * 60 * 1000, // 1 minute
    });
}

/**
 * Hook to fetch a single playlist
 *
 * @param id - Playlist ID
 * @returns Query result with playlist data
 *
 * @example
 * const { data: playlist } = usePlaylistQuery("playlist-123");
 */
export function usePlaylistQuery(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.playlist(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Playlist ID is required");
            return await api.getPlaylist(id);
        },
        enabled: !!id,
        staleTime: 1 * 60 * 1000, // 1 minute
    });
}

/**
 * Hook to fetch all mixes (Made For You)
 *
 * Cache time: 5 minutes
 *
 * @returns Query result with mixes array
 *
 * @example
 * const { data: mixes } = useMixesQuery();
 */
export function useMixesQuery() {
    return useQuery({
        queryKey: queryKeys.mixes(),
        queryFn: () => api.getMixes(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch a single mix
 *
 * @param id - Mix ID
 * @returns Query result with mix data
 */
export function useMixQuery(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.mix(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Mix ID is required");
            return await api.getMix(id);
        },
        enabled: !!id,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch popular artists from Last.fm
 *
 * Cache time: 10 minutes (popular charts don't change frequently)
 *
 * @param limit - Number of artists to fetch (default: 20)
 * @returns Query result with popular artists
 *
 * @example
 * const { data } = usePopularArtistsQuery(20);
 */
export function usePopularArtistsQuery(limit: number = 20) {
    return useQuery({
        queryKey: queryKeys.popularArtists(limit),
        queryFn: () => api.getPopularArtists(limit),
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to fetch all audiobooks
 *
 * @returns Query result with audiobooks array
 */
export function useAudiobooksQuery() {
    return useQuery({
        queryKey: queryKeys.audiobooks(),
        queryFn: () => api.getAudiobooks(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch a single audiobook
 *
 * @param id - Audiobook ID
 * @returns Query result with audiobook data
 */
export function useAudiobookQuery(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.audiobook(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Audiobook ID is required");
            return await api.getAudiobook(id);
        },
        enabled: !!id,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch all subscribed podcasts
 *
 * @returns Query result with podcasts array
 */
export function usePodcastsQuery() {
    return useQuery({
        queryKey: queryKeys.podcasts(),
        queryFn: () => api.getPodcasts(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch a single podcast
 *
 * Returns null if podcast is not found (404), allowing the page to handle preview mode.
 *
 * @param id - Podcast ID
 * @returns Query result with podcast data
 */
export function usePodcastQuery(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.podcast(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Podcast ID is required");

            try {
                return await api.getPodcast(id);
            } catch (error) {
                // If podcast not found (404), return null to allow preview mode
                if (
                    error?.status === 404 ||
                    error?.message?.includes("not found") ||
                    error?.message?.includes("not subscribed")
                ) {
                    return null;
                }
                // For other errors, throw to trigger error state
                throw error;
            }
        },
        enabled: !!id,
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: false, // Don't retry 404 errors
    });
}

/**
 * Hook to fetch top podcasts
 *
 * @param limit - Number of podcasts (default: 20)
 * @param genreId - Optional genre ID filter
 * @returns Query result with top podcasts
 */
export function useTopPodcastsQuery(limit: number = 20, genreId?: number) {
    return useQuery({
        queryKey: queryKeys.topPodcasts(limit, genreId),
        queryFn: () => api.getTopPodcasts(limit, genreId),
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to refresh mixes with cache invalidation
 *
 * @returns Mutation object with mutate function
 *
 * @example
 * const { mutate: refreshMixes, isPending } = useRefreshMixesMutation();
 * refreshMixes();
 */
export function useRefreshMixesMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => api.refreshMixes(),
        onSuccess: () => {
            // Invalidate mixes query to refetch
            queryClient.invalidateQueries({ queryKey: queryKeys.mixes() });
        },
    });
}

/**
 * Hook to add track to playlist with cache invalidation
 *
 * @returns Mutation object with mutate function
 *
 * @example
 * const { mutate: addToPlaylist } = useAddToPlaylistMutation();
 * addToPlaylist({ playlistId: "123", trackId: "456" });
 */
export function useAddToPlaylistMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            playlistId,
            trackId,
        }: {
            playlistId: string;
            trackId: string;
        }) => api.addTrackToPlaylist(playlistId, trackId),
        onSuccess: (_, variables) => {
            // Invalidate the specific playlist query
            queryClient.invalidateQueries({
                queryKey: queryKeys.playlist(variables.playlistId),
            });
            // Also invalidate the playlists list
            queryClient.invalidateQueries({
                queryKey: queryKeys.playlists(),
            });
        },
    });
}

/**
 * Hook to create a new playlist with cache invalidation
 *
 * @returns Mutation object with mutate function
 *
 * @example
 * const { mutate: createPlaylist } = useCreatePlaylistMutation();
 * createPlaylist({ name: "My Playlist", isPublic: false });
 */
export function useCreatePlaylistMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            name,
            isPublic,
        }: {
            name: string;
            isPublic?: boolean;
        }) => api.createPlaylist(name, isPublic),
        onSuccess: () => {
            // Invalidate playlists list to show new playlist
            queryClient.invalidateQueries({
                queryKey: queryKeys.playlists(),
            });
        },
    });
}

/**
 * Hook to delete a playlist with cache invalidation
 *
 * @returns Mutation object with mutate function
 *
 * @example
 * const { mutate: deletePlaylist } = useDeletePlaylistMutation();
 * deletePlaylist("playlist-123");
 */
export function useDeletePlaylistMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (playlistId: string) => api.deletePlaylist(playlistId),
        onSuccess: () => {
            // Invalidate playlists list
            queryClient.invalidateQueries({
                queryKey: queryKeys.playlists(),
            });
        },
    });
}

interface PlaylistPreview {
    id: string;
    source: string;
    type: string;
    title: string;
    description: string | null;
    creator: string;
    imageUrl: string | null;
    trackCount: number;
    url: string;
}

interface Genre {
    id: number;
    name: string;
    picture?: string;
}

interface GenreWithRadios {
    id: number;
    name: string;
    radios: PlaylistPreview[];
}

interface BrowseAllResponse {
    playlists: PlaylistPreview[];
    radios: PlaylistPreview[];
    genres: Genre[];
    radiosByGenre: GenreWithRadios[];
}

/**
 * Hook to fetch all browse content (playlists, radios, genres) from Deezer
 *
 * @returns Query result with all browse content
 */
export function useBrowseAllQuery() {
    return useQuery({
        queryKey: queryKeys.browseAll(),
        queryFn: async (): Promise<BrowseAllResponse> => {
            return api.get<BrowseAllResponse>("/browse/all");
        },
        staleTime: 10 * 60 * 1000, // 10 minutes - playlists don't change often
    });
}

/**
 * Hook to fetch featured playlists from Deezer
 *
 * @param limit - Maximum number of playlists to fetch
 * @returns Query result with featured playlists
 */
export function useFeaturedPlaylistsQuery(limit: number = 50) {
    return useQuery({
        queryKey: queryKeys.browseFeatured(limit),
        queryFn: async (): Promise<PlaylistPreview[]> => {
            const response = await api.get<{ playlists: PlaylistPreview[] }>(
                `/browse/playlists/featured?limit=${limit}`,
            );
            return response.playlists;
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

/**
 * Hook to fetch radio stations from Deezer
 *
 * @param limit - Maximum number of radios to fetch
 * @returns Query result with radio stations
 */
export function useRadiosQuery(limit: number = 50) {
    return useQuery({
        queryKey: queryKeys.browseRadios(limit),
        queryFn: async (): Promise<PlaylistPreview[]> => {
            const response = await api.get<{ radios: PlaylistPreview[] }>(
                `/browse/radios?limit=${limit}`,
            );
            return response.radios;
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}
