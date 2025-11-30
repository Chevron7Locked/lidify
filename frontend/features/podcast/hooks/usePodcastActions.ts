"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAudio } from "@/lib/audio-context";
import { api } from "@/lib/api";
import { Podcast, Episode, PodcastPreview } from "../types";
import { queryKeys } from "@/hooks/useQueries";

export function usePodcastActions(podcastId: string) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { playPodcast, currentPodcast, isPlaying, pause, resume } =
        useAudio();

    const [isSubscribing, setIsSubscribing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleSubscribe = useCallback(
        async (previewData: PodcastPreview | null) => {
            if (!previewData) return;

            setIsSubscribing(true);
            try {
                const response = await api.subscribePodcast(
                    previewData.feedUrl!,
                    previewData.itunesId
                );

                if (response.success && response.podcast?.id) {
                    // Invalidate podcasts cache so the list refreshes
                    queryClient.invalidateQueries({ queryKey: queryKeys.podcasts() });
                    router.push(`/podcasts/${response.podcast.id}`);
                }
            } catch (error: any) {
                console.error("Subscribe error:", error);
                alert(error.message || "Failed to subscribe to podcast");
            } finally {
                setIsSubscribing(false);
            }
        },
        [router, queryClient]
    );

    const handleRemovePodcast = useCallback(async () => {
        try {
            await api.removePodcast(podcastId);
            // Invalidate podcasts cache so the list refreshes without the removed podcast
            queryClient.invalidateQueries({ queryKey: queryKeys.podcasts() });
            router.push("/podcasts");
        } catch (error) {
            console.error("Failed to remove podcast:", error);
        }
    }, [podcastId, router, queryClient]);

    const handlePlayEpisode = useCallback(
        (episode: Episode, podcast: Podcast) => {
            playPodcast({
                id: `${podcastId}:${episode.id}`,
                title: episode.title,
                podcastTitle: podcast.title,
                coverUrl: podcast.coverUrl,
                duration: episode.duration,
                progress: episode.progress || null,
            });
        },
        [podcastId, playPodcast]
    );

    const handlePlayPauseEpisode = useCallback(
        (episode: Episode, podcast: Podcast) => {
            const isCurrentEpisode =
                currentPodcast?.id === `${podcastId}:${episode.id}`;

            if (isCurrentEpisode && isPlaying) {
                pause();
            } else if (isCurrentEpisode) {
                resume();
            } else {
                handlePlayEpisode(episode, podcast);
            }
        },
        [podcastId, currentPodcast, isPlaying, pause, resume, handlePlayEpisode]
    );

    const isEpisodePlaying = useCallback(
        (episodeId: string) => {
            return currentPodcast?.id === `${podcastId}:${episodeId}`;
        },
        [podcastId, currentPodcast]
    );

    return {
        isSubscribing,
        showDeleteConfirm,
        setShowDeleteConfirm,
        handleSubscribe,
        handleRemovePodcast,
        handlePlayEpisode,
        handlePlayPauseEpisode,
        isEpisodePlaying,
        isPlaying,
        pause,
        resume,
    };
}

