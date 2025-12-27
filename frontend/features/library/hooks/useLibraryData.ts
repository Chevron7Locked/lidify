import { useEffect, useState, useCallback, useRef } from "react";
import { Artist, Album, Track, Tab } from "../types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export type LibraryFilter = "owned" | "discovery" | "all";
export type SortOption = "name" | "name-desc" | "recent" | "tracks";

interface UseLibraryDataProps {
    activeTab: Tab;
    filter?: LibraryFilter;
    sortBy?: SortOption;
    itemsPerPage?: number;
    currentPage?: number;
}

interface PaginationState {
    total: number;
    offset: number;
    limit: number;
}

export function useLibraryData({
    activeTab,
    filter = "owned",
    sortBy = "name",
    itemsPerPage = 50,
    currentPage = 1,
}: UseLibraryDataProps) {
    const [artists, setArtists] = useState<Artist[]>([]);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [tracks, setTracks] = useState<Track[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [pagination, setPagination] = useState<PaginationState>({
        total: 0,
        offset: 0,
        limit: itemsPerPage,
    });
    const { isAuthenticated } = useAuth();

    // Track the current request to avoid race conditions
    const requestIdRef = useRef(0);

    const loadData = useCallback(async () => {
        if (!isAuthenticated) return;

        const currentRequestId = ++requestIdRef.current;
        const offset = (currentPage - 1) * itemsPerPage;

        setIsLoading(true);
        try {
            if (activeTab === "artists") {
                const response = await api.getArtists({
                    limit: itemsPerPage,
                    offset,
                    filter,
                });
                // Only update if this is still the current request
                if (currentRequestId === requestIdRef.current) {
                    // Sort client-side since backend sorts by name asc only
                    let sortedArtists = [...response.artists];
                    switch (sortBy) {
                        case "name":
                            sortedArtists.sort((a, b) => a.name.localeCompare(b.name));
                            break;
                        case "name-desc":
                            sortedArtists.sort((a, b) => b.name.localeCompare(a.name));
                            break;
                        case "tracks":
                            sortedArtists.sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0));
                            break;
                    }
                    setArtists(sortedArtists);
                    setPagination({
                        total: response.total,
                        offset: response.offset,
                        limit: response.limit,
                    });
                }
            } else if (activeTab === "albums") {
                const response = await api.getAlbums({
                    limit: itemsPerPage,
                    offset,
                    filter,
                });
                if (currentRequestId === requestIdRef.current) {
                    // Sort client-side since backend sorts by year desc only
                    let sortedAlbums = [...response.albums];
                    switch (sortBy) {
                        case "name":
                            sortedAlbums.sort((a, b) => a.title.localeCompare(b.title));
                            break;
                        case "name-desc":
                            sortedAlbums.sort((a, b) => b.title.localeCompare(a.title));
                            break;
                        case "recent":
                            sortedAlbums.sort((a, b) => (b.year || 0) - (a.year || 0));
                            break;
                    }
                    setAlbums(sortedAlbums);
                    setPagination({
                        total: response.total,
                        offset: response.offset,
                        limit: response.limit,
                    });
                }
            } else if (activeTab === "tracks") {
                const response = await api.getTracks({
                    limit: itemsPerPage,
                    offset,
                });
                if (currentRequestId === requestIdRef.current) {
                    // Sort client-side
                    let sortedTracks = [...response.tracks];
                    switch (sortBy) {
                        case "name":
                            sortedTracks.sort((a, b) => a.title.localeCompare(b.title));
                            break;
                        case "name-desc":
                            sortedTracks.sort((a, b) => b.title.localeCompare(a.title));
                            break;
                    }
                    setTracks(sortedTracks);
                    setPagination({
                        total: response.total,
                        offset: response.offset,
                        limit: response.limit,
                    });
                }
            }
        } catch (error) {
            console.error("Failed to load library data:", error);
        } finally {
            if (currentRequestId === requestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [activeTab, filter, sortBy, itemsPerPage, currentPage, isAuthenticated]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const reloadData = () => {
        loadData();
    };

    const totalPages = Math.ceil(pagination.total / itemsPerPage);

    return {
        artists,
        albums,
        tracks,
        isLoading,
        reloadData,
        pagination: {
            ...pagination,
            totalPages,
            currentPage,
            itemsPerPage,
        },
    };
}
