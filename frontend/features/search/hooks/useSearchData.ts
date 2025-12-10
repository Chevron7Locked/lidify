import { useSearchQuery, useDiscoverSearchQuery } from "@/hooks/useQueries";
import type { SearchResult, DiscoverResult } from "../types";
import { useMemo } from "react";

interface UseSearchDataProps {
    query: string;
}

interface UseSearchDataReturn {
    libraryResults: SearchResult | null;
    discoverResults: DiscoverResult[];
    isLibrarySearching: boolean;
    isDiscoverSearching: boolean;
    hasSearched: boolean;
}

export function useSearchData({ query }: UseSearchDataProps): UseSearchDataReturn {
    // React Query automatically handles debouncing through the enabled flag
    // Queries only run when query is at least 2 characters
    const {
        data: libraryResults,
        isLoading: isLibrarySearching,
        isFetching: isLibraryFetching
    } = useSearchQuery(query, "all", 20);

    const {
        data: discoverData,
        isLoading: isDiscoverSearching,
        isFetching: isDiscoverFetching
    } = useDiscoverSearchQuery(query, "all", 20);

    // Extract discover results
    const discoverResults = useMemo(() => {
        return discoverData?.results || [];
    }, [discoverData]);

    // Track if user has searched (query is at least 2 characters)
    const hasSearched = query.trim().length >= 2;

    return {
        libraryResults: libraryResults || null,
        discoverResults,
        isLibrarySearching: isLibrarySearching || isLibraryFetching,
        isDiscoverSearching: isDiscoverSearching || isDiscoverFetching,
        hasSearched,
    };
}
