import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { api } from "@/lib/api";
import { useDownloadContext } from "@/lib/download-context";
import type { Album, AlbumSource } from "../types";
import { useMemo, useEffect, useRef } from "react";

export function useAlbumData(albumId?: string) {
    const params = useParams();
    const router = useRouter();
    const id = albumId || (params.id as string);
    const { downloadStatus } = useDownloadContext();
    const prevActiveCountRef = useRef(downloadStatus.activeDownloads.length);

    // Use React Query with dynamic refetch interval based on download status
    const {
        data: album,
        isLoading,
        error,
        refetch,
    } = useQuery({
        queryKey: queryKeys.album(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Album ID is required");
            try {
                return await api.getAlbum(id);
            } catch (error) {
                return await api.getAlbumDiscovery(id);
            }
        },
        enabled: !!id,
        staleTime: 10 * 60 * 1000,
        retry: 1,
        // Poll every 5 seconds when there are active downloads
        refetchInterval: downloadStatus.hasActiveDownloads ? 5000 : false,
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

    // Determine source from the album data (if it came from library or discovery)
    const source: AlbumSource | null = useMemo(() => {
        if (!album) return null;
        // Check the owned property - this is the definitive source of truth
        // Albums can have track listings from MusicBrainz even if not owned
        return album.owned === true ? "library" : "discovery";
    }, [album]);

    // Handle errors
    if (error && !isLoading) {
        toast.error("Failed to load album");
        router.back();
    }

    return {
        album,
        loading: isLoading,
        source,
        reloadAlbum: refetch,
    };
}
