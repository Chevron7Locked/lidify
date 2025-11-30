/**
 * useHomeData Hook
 *
 * Manages data loading for the Home page, fetching all 7 sections using React Query
 * and providing refresh functionality for mixes.
 */

import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type {
    Artist,
    ListenedItem,
    Podcast,
    Audiobook,
    Mix,
    PopularArtist,
} from '../types';
import {
    useRecentlyListenedQuery,
    useRecentlyAddedQuery,
    useRecommendationsQuery,
    useMixesQuery,
    usePopularArtistsQuery,
    useTopPodcastsQuery,
    useAudiobooksQuery,
    useRefreshMixesMutation,
} from '@/hooks/useQueries';

export interface UseHomeDataReturn {
    // Data sections
    recentlyListened: ListenedItem[];
    recentlyAdded: Artist[];
    recommended: Artist[];
    mixes: Mix[];
    popularArtists: PopularArtist[];
    recentPodcasts: Podcast[];
    recentAudiobooks: Audiobook[];

    // Loading states
    isLoading: boolean;
    isRefreshingMixes: boolean;

    // Actions
    handleRefreshMixes: () => Promise<void>;
}

/**
 * Custom hook to load all Home page data sections using React Query
 *
 * Loads the following sections with automatic caching:
 * 1. Recently listened (Continue Listening)
 * 2. Recently added artists
 * 3. Recommended for you
 * 4. Mixes (Made For You)
 * 5. Popular artists
 * 6. Recent podcasts
 * 7. Recent audiobooks
 *
 * @returns {UseHomeDataReturn} All home page data and loading states
 */
export function useHomeData(): UseHomeDataReturn {
    const { isAuthenticated } = useAuth();

    // React Query hooks - these automatically handle caching, refetching, and loading states
    const { data: recentlyListenedData, isLoading: isLoadingListened } = useRecentlyListenedQuery(10);
    const { data: recentlyAddedData, isLoading: isLoadingAdded } = useRecentlyAddedQuery(10);
    const { data: recommendedData, isLoading: isLoadingRecommended } = useRecommendationsQuery(10);
    const { data: mixesData, isLoading: isLoadingMixes } = useMixesQuery();
    const { data: popularData, isLoading: isLoadingPopular } = usePopularArtistsQuery(20);
    const { data: podcastsData, isLoading: isLoadingPodcasts } = useTopPodcastsQuery(10);
    const { data: audiobooksData, isLoading: isLoadingAudiobooks } = useAudiobooksQuery();

    // Mutation for refreshing mixes
    const { mutateAsync: refreshMixes, isPending: isRefreshingMixes } = useRefreshMixesMutation();

    /**
     * Refresh mixes and update cache
     */
    const handleRefreshMixes = async () => {
        try {
            await refreshMixes();
            toast.success('Mixes refreshed! Check out your new daily picks');
        } catch (error) {
            console.error('Failed to refresh mixes:', error);
            toast.error('Failed to refresh mixes');
        }
    };

    // Process recently listened data - can contain artists, podcasts, or audiobooks
    const items = recentlyListenedData?.items || recentlyListenedData?.artists || [];

    // Calculate overall loading state - true if any query is loading
    const isLoading =
        !isAuthenticated ||
        isLoadingListened ||
        isLoadingAdded ||
        isLoadingRecommended ||
        isLoadingMixes ||
        isLoadingPopular ||
        isLoadingPodcasts ||
        isLoadingAudiobooks;

    return {
        recentlyListened: items,
        recentlyAdded: recentlyAddedData?.artists || [],
        recommended: recommendedData?.artists || [],
        mixes: mixesData || [],
        popularArtists: popularData?.artists || [],
        recentPodcasts: podcastsData?.slice(0, 10) || [],
        recentAudiobooks: audiobooksData?.slice(0, 10) || [],
        isLoading,
        isRefreshingMixes,
        handleRefreshMixes,
    };
}
