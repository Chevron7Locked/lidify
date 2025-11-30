"use client";

import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { api } from "@/lib/api";
import { useState, useRef, useEffect, memo, useCallback } from "react";
import { useAudioFade } from "@/hooks/useAudioFade";
import { audioSeekEmitter } from "@/lib/audio-seek-emitter";

/**
 * AudioElement - The single source of truth for audio playback
 * This component manages the actual <audio> element and syncs with the audio context.
 * It's always rendered once, regardless of which player UI is visible.
 *
 * IMPORTANT: Uses split contexts to minimize re-renders:
 * - useAudioState: Only re-renders when track/media changes
 * - useAudioPlayback: Only re-renders when isPlaying/currentTime changes
 * - useAudioControls: Never re-renders (actions only)
 *
 * Wrapped in React.memo to prevent re-renders from parent component
 */
export const AudioElement = memo(function AudioElement() {
    // State context - only re-renders when track changes
    const {
        currentTrack,
        currentAudiobook,
        currentPodcast,
        playbackType,
        volume,
        isMuted,
        repeatMode,
        setCurrentAudiobook,
    } = useAudioState();

    // Playback context - only get isPlaying and setCurrentTime
    // We'll use a ref for savedTime to avoid re-renders
    const { isPlaying, setCurrentTime, setDuration } = useAudioPlayback();

    // Controls context - never re-renders
    const { pause, next } = useAudioControls();

    const audioRef = useRef<HTMLAudioElement>(null);
    const [hasRestoredTime, setHasRestoredTime] = useState(false);
    const lastSeekTimeRef = useRef<number>(-1);
    const lastSeekTimestampRef = useRef<number>(0);
    const progressSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastProgressSaveRef = useRef<number>(0);
    const isRestoringProgressRef = useRef<boolean>(false);
    const errorCountRef = useRef<number>(0);
    const lastErrorTimeRef = useRef<number>(0);
    const lastPlayingStateRef = useRef<boolean>(false);
    const lastTrackIdRef = useRef<string | null>(null);

    // Audio fade effects
    const { fadeIn, fadeOut } = useAudioFade(
        audioRef.current,
        isPlaying,
        volume,
        isMuted
    );

    // Reset duration when nothing is playing
    useEffect(() => {
        if (!currentTrack && !currentAudiobook && !currentPodcast) {
            setDuration(0);
        }
    }, [currentTrack, currentAudiobook, currentPodcast, setDuration]);

    // Keep duration in sync with the actual media element
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const syncDuration = () => {
            const fallbackDuration =
                currentTrack?.duration ||
                currentAudiobook?.duration ||
                currentPodcast?.duration ||
                0;
            const resolvedDuration =
                typeof audio.duration === "number" &&
                Number.isFinite(audio.duration) &&
                audio.duration > 0
                    ? audio.duration
                    : fallbackDuration;
            setDuration(resolvedDuration);
        };

        audio.addEventListener("loadedmetadata", syncDuration);
        audio.addEventListener("durationchange", syncDuration);

        syncDuration();

        return () => {
            audio.removeEventListener("loadedmetadata", syncDuration);
            audio.removeEventListener("durationchange", syncDuration);
        };
    }, [currentTrack, currentAudiobook, currentPodcast, setDuration]);

    // Restore saved playback position on load
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || hasRestoredTime) return;

        const handleLoadedData = () => {
            let timeToRestore = 0;
            const fallbackDuration =
                currentTrack?.duration ||
                currentAudiobook?.duration ||
                currentPodcast?.duration ||
                0;
            const resolvedDuration =
                audio.duration && Number.isFinite(audio.duration)
                    ? audio.duration
                    : fallbackDuration;
            setDuration(resolvedDuration);

            // For podcasts, prioritize the progress from the podcast object
            if (
                playbackType === "podcast" &&
                currentPodcast?.progress?.currentTime
            ) {
                timeToRestore = currentPodcast.progress.currentTime;
            } else if (
                playbackType === "audiobook" &&
                currentAudiobook?.progress?.currentTime
            ) {
                timeToRestore = currentAudiobook.progress.currentTime;
            }

            if (timeToRestore && timeToRestore > 0) {
                isRestoringProgressRef.current = true;
                audio.currentTime = timeToRestore;
                lastSeekTimeRef.current = timeToRestore;
                lastSeekTimestampRef.current = Date.now();
                setHasRestoredTime(true);
                // Clear the flag after a short delay to allow the seek to complete
                setTimeout(() => {
                    isRestoringProgressRef.current = false;
                }, 500);
            }
        };

        audio.addEventListener("loadeddata", handleLoadedData);
        return () => audio.removeEventListener("loadeddata", handleLoadedData);
    }, [hasRestoredTime, playbackType, currentPodcast, currentAudiobook, currentTrack, setDuration]);

    // Reset restoration flag and error count when media changes
    useEffect(() => {
        setHasRestoredTime(false);
        errorCountRef.current = 0; // Reset error count for new track
        lastErrorTimeRef.current = 0;
    }, [currentTrack?.id, currentAudiobook?.id, currentPodcast?.id]);

    // Setup audio element event listeners
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => {
            // Skip time updates immediately after seeking to prevent bouncing
            if (Date.now() - lastSeekTimestampRef.current < 500) {
                return;
            }
            setCurrentTime(audio.currentTime);
        };

        const handleEnded = async () => {

            // Save progress when media ends
            if (playbackType === "audiobook" && currentAudiobook) {
                try {
                    await api.updateAudiobookProgress(
                        currentAudiobook.id,
                        audio.duration,
                        audio.duration,
                        true
                    );
                    const finishedDuration =
                        audio.duration || currentAudiobook.duration || 0;
                    setCurrentAudiobook({
                        ...currentAudiobook,
                        progress: {
                            currentTime: finishedDuration,
                            progress: finishedDuration > 0 ? 100 : 0,
                            isFinished: true,
                            lastPlayedAt: new Date(),
                        },
                    });
                } catch (err) {
                    console.error("Failed to save audiobook progress:", err);
                }
            } else if (playbackType === "podcast" && currentPodcast) {
                try {
                    const [podcastId, episodeId] = currentPodcast.id.split(":");
                    await api.updatePodcastProgress(
                        podcastId,
                        episodeId,
                        audio.duration,
                        audio.duration,
                        true
                    );
                } catch (err) {
                    console.error("Failed to save podcast progress:", err);
                }
            }

            if (playbackType === "track") {
                // Just call next() - it will handle all repeat logic
                next();
            } else {
                pause();
            }
        };

        const handleError = (e: Event) => {
            const error = (e.target as HTMLAudioElement).error;
            const now = Date.now();

            // Reset error count if it's been more than 10 seconds since last error
            if (now - lastErrorTimeRef.current > 10000) {
                errorCountRef.current = 0;
            }

            errorCountRef.current++;
            lastErrorTimeRef.current = now;

            console.error("[AudioElement] Audio error:", {
                code: error?.code,
                message: error?.message,
                src: audio.src,
                networkState: audio.networkState,
                readyState: audio.readyState,
                errorCount: errorCountRef.current,
            });

            // Prevent infinite retry loop - max 3 retries
            if (errorCountRef.current > 3) {
                console.error(
                    "[AudioElement] Too many errors - stopping playback to prevent infinite loop"
                );
                pause();
                errorCountRef.current = 0; // Reset for next track
                return;
            }

            // Error codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
            if (error?.code === 4 || error?.code === 2) {
                console.warn(
                    `[AudioElement] Stream error (code ${error?.code}) - retrying (attempt ${errorCountRef.current}/3)`
                );
                // Add a small delay before retrying to avoid hammering the server
                setTimeout(() => {
                    audio.load();
                }, 1000);
            }
        };

        audio.addEventListener("timeupdate", updateTime);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);

        return () => {
            audio.removeEventListener("timeupdate", updateTime);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("error", handleError);
        };
    }, [playbackType, next, pause, setCurrentTime, currentAudiobook, currentPodcast, repeatMode]);

    const startPlayback = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!currentTrack && !currentAudiobook && !currentPodcast) return;
        if (!audio.src || audio.src === "") return;

        audio.volume = 0;
        audio
            .play()
            .then(() => {
                fadeIn();
            })
            .catch((err) => {
                if (err.name === "AbortError") return;
                if (err.name === "NotAllowedError") {
                    pause();
                } else {
                    console.error("[AudioElement] Play failed:", err);
                }
            });
    }, [currentTrack, currentAudiobook, currentPodcast, fadeIn, pause]);

    // Update audio src when media changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        let streamUrl: string | null = null;

        if (playbackType === "track" && currentTrack) {
            streamUrl = api.getStreamUrl(currentTrack.id);
        } else if (playbackType === "audiobook" && currentAudiobook) {
            streamUrl = api.getAudiobookStreamUrl(currentAudiobook.id);
        } else if (playbackType === "podcast" && currentPodcast) {
            const [podcastId, episodeId] = currentPodcast.id.split(":");
            streamUrl = api.getPodcastEpisodeStreamUrl(podcastId, episodeId);
        }

        if (streamUrl && audio.src !== streamUrl) {
            audio.src = streamUrl;
            audio.load();
            const fallbackDuration =
                currentTrack?.duration ||
                currentAudiobook?.duration ||
                currentPodcast?.duration ||
                0;
            setDuration(fallbackDuration || 0);
            if (isPlaying) {
                startPlayback();
            }
        }
    }, [playbackType, currentTrack, currentAudiobook, currentPodcast, setDuration, isPlaying, startPlayback]);

    // Handle play/pause with fade effects
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const currentMediaId =
            currentTrack?.id || currentAudiobook?.id || currentPodcast?.id;
        const playingStateChanged = isPlaying !== lastPlayingStateRef.current;
        const trackChanged = currentMediaId !== lastTrackIdRef.current;

        if (!playingStateChanged && !trackChanged) {
            return;
        }

        lastPlayingStateRef.current = isPlaying;
        lastTrackIdRef.current = currentMediaId || null;

        if (isPlaying) {
            startPlayback();
        } else {
            if (!audio.paused) {
                audio.pause();
            }
            fadeOut();
        }
    }, [isPlaying, currentTrack, currentAudiobook, currentPodcast, fadeOut, startPlayback]);

    // Handle seeking via event emitter (prevents re-renders)
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleSeek = (time: number) => {
            // Don't interfere if we're currently restoring from progress
            if (isRestoringProgressRef.current) {
                return;
            }

            // Immediately update currentTime in context to show the seek target
            setCurrentTime(time);

            // Then seek the audio element
            audio.currentTime = time;
            lastSeekTimeRef.current = time;
            lastSeekTimestampRef.current = Date.now();

            if (isPlaying) {
                if (audio.paused) {
                    startPlayback();
                } else {
                    const playPromise = audio.play();
                    if (playPromise?.catch) {
                        playPromise.catch((err) => {
                            if (err.name === "AbortError") return;
                            console.warn(
                                "[AudioElement] Seek play failed:",
                                err
                            );
                        });
                    }
                }
            }
        };

        const unsubscribe = audioSeekEmitter.subscribe(handleSeek);
        return unsubscribe;
    }, [isPlaying, setCurrentTime, startPlayback]);

    // Handle volume changes - apply immediately even during playback
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        // Apply volume changes immediately, whether playing or paused
        // This allows real-time volume adjustments during playback
        audio.volume = isMuted ? 0 : volume;
    }, [volume, isMuted]);

    // Periodic progress saving for audiobooks and podcasts
    useEffect(() => {
        // Only save progress for audiobooks and podcasts
        if (playbackType !== "audiobook" && playbackType !== "podcast") {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
                progressSaveIntervalRef.current = null;
            }
            return;
        }

        const audio = audioRef.current;
        if (!audio) return;

        const saveProgress = async () => {
            if (!audio || audio.currentTime === lastProgressSaveRef.current)
                return;

            if (
                playbackType === "audiobook" &&
                currentAudiobook?.progress?.isFinished
            ) {
                return;
            }

            lastProgressSaveRef.current = audio.currentTime;

            if (playbackType === "audiobook" && currentAudiobook) {
                try {
                    await api.updateAudiobookProgress(
                        currentAudiobook.id,
                        audio.currentTime,
                        audio.duration || currentAudiobook.duration,
                        false
                    );
                    const durationForProgress =
                        audio.duration || currentAudiobook.duration || 0;
                    setCurrentAudiobook({
                        ...currentAudiobook,
                        progress: {
                            currentTime: audio.currentTime,
                            progress:
                                durationForProgress > 0
                                    ? (audio.currentTime /
                                          durationForProgress) *
                                      100
                                    : 0,
                            isFinished: false,
                            lastPlayedAt: new Date(),
                        },
                    });
                } catch (err) {
                    console.error("[AudioElement] Failed to save audiobook progress:", err);
                }
            } else if (playbackType === "podcast" && currentPodcast) {
                try {
                    const [podcastId, episodeId] = currentPodcast.id.split(":");
                    await api.updatePodcastProgress(
                        podcastId,
                        episodeId,
                        audio.currentTime,
                        audio.duration || currentPodcast.duration,
                        false
                    );
                } catch (err) {
                    console.error("[AudioElement] Failed to save podcast progress:", err);
                }
            }
        };

        // Save immediately when paused
        if (!isPlaying) {
            saveProgress();
        }

        // Set up interval when playing
        if (isPlaying) {
            progressSaveIntervalRef.current = setInterval(saveProgress, 30000); // Save every 30 seconds
        }

        // Cleanup
        return () => {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
                progressSaveIntervalRef.current = null;
            }
        };
    }, [playbackType, isPlaying, currentAudiobook, currentPodcast]);

    if (!currentTrack && !currentAudiobook && !currentPodcast) return null;

    return <audio ref={audioRef} crossOrigin="use-credentials" />;
});
