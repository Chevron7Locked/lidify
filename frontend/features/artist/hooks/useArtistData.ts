import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { api } from "@/lib/api";
import { useDownloadContext } from "@/lib/download-context";
import { Artist, Album, ArtistSource } from "../types";
import { useMemo, useEffect, useRef } from "react";

export function useArtistData() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { downloadStatus } = useDownloadContext();
    const prevActiveCountRef = useRef(downloadStatus.activeDownloads.length);

    // Use React Query with dynamic refetch interval based on download status
    const {
        data: artist,
        isLoading,
        error,
        isError,
        refetch,
    } = useQuery({
        queryKey: queryKeys.artist(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Artist ID is required");
            try {
                return await api.getArtist(id);
            } catch (error) {
                return await api.getArtistDiscovery(id);
            }
        },
        enabled: !!id,
        staleTime: 10 * 60 * 1000,
        retry: 1,
        // Only poll when we have valid data AND there are active downloads
        // Don't poll if the query is in error state (e.g., 404 artist not found)
        refetchInterval: (query) => {
            if (query.state.error || !query.state.data) return false;
            return downloadStatus.hasActiveDownloads ? 5000 : false;
        },
    });

    // Refetch when downloads complete (active count decreases)
    useEffect(() => {
        const currentActiveCount = downloadStatus.activeDownloads.length;
        if (
            prevActiveCountRef.current > 0 &&
            currentActiveCount < prevActiveCountRef.current
        ) {
            // Downloads have completed, refresh data
            refetch();
        }
        prevActiveCountRef.current = currentActiveCount;
    }, [downloadStatus.activeDownloads.length, refetch]);

    // Determine source from the artist data (if it came from library or discovery)
    const source: ArtistSource | null = useMemo(() => {
        if (!artist) return null;
        return artist.id && !artist.id.includes("-") ? "library" : "discovery";
    }, [artist]);

    // Sort albums by year (newest first, nulls last) - memoized
    const albums = useMemo(() => {
        if (!artist?.albums) return [];

        return [...artist.albums].sort((a, b) => {
            if (a.year == null && b.year == null) return 0;
            if (a.year == null) return 1;
            if (b.year == null) return -1;
            return b.year - a.year;
        });
    }, [artist?.albums]);

    // Handle errors - only show toast once, don't auto-navigate
    // The page component should handle displaying a "not found" state
    // Don't call router.back() as it causes navigation loops

    return {
        artist,
        albums,
        loading: isLoading,
        error: isError,
        source,
        reloadArtist: refetch,
    };
}
