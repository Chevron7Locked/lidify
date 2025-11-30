import { useState, useCallback } from "react";
import { useAudio } from "@/lib/audio-context";
import { useJobStatus, JobStatus } from "@/hooks/useJobStatus";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DiscoverTrack, DiscoverPlaylist } from "../types";

export function useDiscoverActions(
    playlist: DiscoverPlaylist | null,
    onGenerationComplete?: () => void
) {
    const { playTracks, isPlaying, pause, play } = useAudio();
    const [discoverJobId, setDiscoverJobId] = useState<string | null>(null);

    const { jobStatus, isPolling } = useJobStatus(discoverJobId, "discover", {
        onComplete: (result) => {
            if (result.success) {
                toast.success(
                    `Generated ${result.songCount} songs in ${result.playlistName}!`
                );
                onGenerationComplete?.();
            } else {
                toast.error(`Generation failed: ${result.error}`);
            }
            setDiscoverJobId(null);
        },
        onError: (error) => {
            toast.error(`Generation failed: ${error}`);
            setDiscoverJobId(null);
        },
    });

    const handleGenerate = useCallback(async () => {
        if (isPolling) {
            console.warn("Generation already in progress, ignoring request");
            toast.warning("Generation already in progress...");
            return;
        }

        try {
            toast.info("Generating your Discover Weekly playlist...");
            const response = await api.generateDiscoverWeekly();
            setDiscoverJobId(response.jobId);
        } catch (error: any) {
            console.error("Generation failed:", error);
            toast.error(error.message || "Failed to generate playlist");
        }
    }, [isPolling]);

    const handleLike = useCallback(
        async (track: DiscoverTrack) => {
            try {
                if (track.isLiked) {
                    await api.unlikeDiscoverAlbum(track.albumId);
                    toast.success(`Unmarked ${track.album}`);
                } else {
                    await api.likeDiscoverAlbum(track.albumId);
                    toast.success(`${track.album} will be kept!`);
                }

                // Trigger reload to update state
                onGenerationComplete?.();
            } catch (error: any) {
                console.error("Like failed:", error);
                toast.error(error.message || "Failed to update");
            }
        },
        [onGenerationComplete]
    );

    const handlePlayPlaylist = useCallback(() => {
        if (!playlist || playlist.tracks.length === 0) return;

        const formattedTracks = playlist.tracks.map((track) => ({
            id: track.id,
            title: track.title,
            artist: { name: track.artist },
            album: {
                title: track.album,
                coverArt: track.coverUrl || undefined,
            },
            duration: 0,
        }));

        playTracks(formattedTracks, 0);
    }, [playlist, playTracks]);

    const handlePlayTrack = useCallback(
        (index: number) => {
            if (!playlist || playlist.tracks.length === 0) return;

            const formattedTracks = playlist.tracks.map((track) => ({
                id: track.id,
                title: track.title,
                artist: { name: track.artist },
                album: {
                    title: track.album,
                    coverArt: track.coverUrl || undefined,
                },
                duration: 0,
            }));

            playTracks(formattedTracks, index);
        },
        [playlist, playTracks]
    );

    const handleTogglePlay = useCallback(() => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    }, [isPlaying, pause, play]);

    return {
        handleGenerate,
        handleLike,
        handlePlayPlaylist,
        handlePlayTrack,
        handleTogglePlay,
        isPolling,
        jobStatus,
    };
}
