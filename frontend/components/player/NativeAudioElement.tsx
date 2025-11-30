"use client";

import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { api } from "@/lib/api";
import { useState, useRef, useEffect, memo, useCallback } from "react";
import { audioSeekEmitter } from "@/lib/audio-seek-emitter";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { CapacitorMusicControls } from "capacitor-music-controls-plugin";
import { isNativePlatform } from "@/lib/platform";

/**
 * NativeAudioElement - Native audio playback for Capacitor mobile apps
 * Replaces HTML5 audio with native Android/iOS audio player
 * Provides: OS media controls, background playback, wake lock
 */
export const NativeAudioElement = memo(function NativeAudioElement() {
    const {
        currentTrack,
        currentAudiobook,
        currentPodcast,
        playbackType,
        volume,
        isMuted,
        repeatMode,
    } = useAudioState();

    const { isPlaying, setCurrentTime, setDuration, setIsPlaying } =
        useAudioPlayback();
    const { pause, resume, next, previous } = useAudioControls();

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [hasRestoredTime, setHasRestoredTime] = useState(false);
    const lastSeekTimeRef = useRef<number>(-1);
    const progressSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastProgressSaveRef = useRef<number>(0);
    const isRestoringProgressRef = useRef<boolean>(false);
    const errorCountRef = useRef<number>(0);
    const lastErrorTimeRef = useRef<number>(0);
    const lastPlayingStateRef = useRef<boolean>(false);
    const lastTrackIdRef = useRef<string | null>(null);
    const mediaControlsInitialized = useRef<boolean>(false);

    // Use refs to access latest values in media control callbacks
    const isPlayingRef = useRef(isPlaying);
    const playbackTypeRef = useRef(playbackType);
    const pauseRef = useRef(pause);
    const resumeRef = useRef(resume);
    const nextRef = useRef(next);
    const previousRef = useRef(previous);

    // Keep refs in sync
    useEffect(() => {
        isPlayingRef.current = isPlaying;
        playbackTypeRef.current = playbackType;
        pauseRef.current = pause;
        resumeRef.current = resume;
        nextRef.current = next;
        previousRef.current = previous;
    }, [isPlaying, playbackType, pause, resume, next, previous]);

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

    // Reset duration when nothing is loaded
    useEffect(() => {
        if (!currentTrack && !currentAudiobook && !currentPodcast) {
            setDuration(0);
        }
    }, [currentTrack, currentAudiobook, currentPodcast, setDuration]);

    // ========== WEB MEDIASESSION API (Primary - More Reliable) ==========
    // The Web MediaSession API is natively supported in Android WebView and is more reliable
    // than third-party Capacitor plugins. We use this as our primary media control method.

    // Check if MediaSession API is available
    const hasMediaSession =
        typeof navigator !== "undefined" && "mediaSession" in navigator;

    // Setup Web MediaSession action handlers (runs once)
    useEffect(() => {
        if (!hasMediaSession) return;

        const handlePlay = () => {
            const audio = audioRef.current;
            if (audio && audio.src) {
                audio
                    .play()
                    .then(() => {
                        if (!isPlayingRef.current) {
                            resumeRef.current();
                        }
                    })
                    .catch(console.error);
            }
        };

        const handlePause = () => {
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
            }
            if (isPlayingRef.current) {
                pauseRef.current();
            }
        };

        const handlePreviousTrack = () => {
            if (playbackTypeRef.current === "track") {
                previousRef.current();
            } else {
                const audio = audioRef.current;
                if (audio) {
                    audio.currentTime = Math.max(audio.currentTime - 30, 0);
                }
            }
        };

        const handleNextTrack = () => {
            if (playbackTypeRef.current === "track") {
                nextRef.current();
            } else {
                const audio = audioRef.current;
                if (audio) {
                    audio.currentTime = Math.min(
                        audio.currentTime + 30,
                        audio.duration || 0
                    );
                }
            }
        };

        const handleSeekBackward = () => {
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = Math.max(audio.currentTime - 10, 0);
            }
        };

        const handleSeekForward = () => {
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = Math.min(
                    audio.currentTime + 10,
                    audio.duration || 0
                );
            }
        };

        const handleSeekTo = (details: MediaSessionActionDetails) => {
            const audio = audioRef.current;
            if (audio && details.seekTime !== undefined) {
                audio.currentTime = details.seekTime;
            }
        };

        const handleStop = () => {
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
            if (isPlayingRef.current) {
                pauseRef.current();
            }
        };

        // Register all action handlers
        try {
            navigator.mediaSession.setActionHandler("play", handlePlay);
            navigator.mediaSession.setActionHandler("pause", handlePause);
            navigator.mediaSession.setActionHandler(
                "previoustrack",
                handlePreviousTrack
            );
            navigator.mediaSession.setActionHandler(
                "nexttrack",
                handleNextTrack
            );
            navigator.mediaSession.setActionHandler(
                "seekbackward",
                handleSeekBackward
            );
            navigator.mediaSession.setActionHandler(
                "seekforward",
                handleSeekForward
            );
            navigator.mediaSession.setActionHandler("seekto", handleSeekTo);
            navigator.mediaSession.setActionHandler("stop", handleStop);
        } catch (err) {
            // MediaSession setup failed - controls may not work
        }

        return () => {
            // Cleanup handlers
            try {
                navigator.mediaSession.setActionHandler("play", null);
                navigator.mediaSession.setActionHandler("pause", null);
                navigator.mediaSession.setActionHandler("previoustrack", null);
                navigator.mediaSession.setActionHandler("nexttrack", null);
                navigator.mediaSession.setActionHandler("seekbackward", null);
                navigator.mediaSession.setActionHandler("seekforward", null);
                navigator.mediaSession.setActionHandler("seekto", null);
                navigator.mediaSession.setActionHandler("stop", null);
            } catch (err) {
                // Ignore cleanup errors
            }
        };
    }, [hasMediaSession]);

    // Update MediaSession metadata when track changes
    useEffect(() => {
        if (!hasMediaSession) return;

        if (!currentTrack && !currentAudiobook && !currentPodcast) {
            // Clear metadata when nothing is playing
            navigator.mediaSession.metadata = null;
            return;
        }

        let title = "";
        let artist = "";
        let album = "";
        let cover = "";

        if (playbackType === "track" && currentTrack) {
            title = currentTrack.title;
            artist = currentTrack.artist?.name || "Unknown Artist";
            album = currentTrack.album?.title || "";
            cover = currentTrack.album?.coverArt
                ? api.getCoverArtUrl(currentTrack.album.coverArt, 512)
                : "";
        } else if (playbackType === "audiobook" && currentAudiobook) {
            title = currentAudiobook.title;
            artist = currentAudiobook.author || "Unknown Author";
            album = "Audiobook";
            cover = currentAudiobook.coverUrl
                ? api.getCoverArtUrl(currentAudiobook.coverUrl, 512)
                : "";
        } else if (playbackType === "podcast" && currentPodcast) {
            title = currentPodcast.title;
            artist = currentPodcast.podcastTitle || "Podcast";
            album = "";
            cover = currentPodcast.coverUrl
                ? api.getCoverArtUrl(currentPodcast.coverUrl, 512)
                : "";
        }

        const safeTitle = title || "Unknown";
        const safeArtist = artist || "Unknown";
        const safeAlbum = album || "";

        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: safeTitle,
                artist: safeArtist,
                album: safeAlbum,
                artwork: cover
                    ? [
                          { src: cover, sizes: "96x96", type: "image/png" },
                          { src: cover, sizes: "128x128", type: "image/png" },
                          { src: cover, sizes: "192x192", type: "image/png" },
                          { src: cover, sizes: "256x256", type: "image/png" },
                          { src: cover, sizes: "384x384", type: "image/png" },
                          { src: cover, sizes: "512x512", type: "image/png" },
                      ]
                    : [],
            });
        } catch (err) {
            console.error(
                "[NativeAudio] Error setting MediaSession metadata:",
                err
            );
        }
    }, [currentTrack, currentAudiobook, currentPodcast, playbackType, hasMediaSession]);

    // Update MediaSession playback state
    useEffect(() => {
        if (!hasMediaSession) return;

        try {
            navigator.mediaSession.playbackState = isPlaying
                ? "playing"
                : "paused";
        } catch (err) {
            // Ignore
        }
    }, [isPlaying, hasMediaSession]);

    // Update MediaSession position state (for seek bar in notification)
    useEffect(() => {
        if (!hasMediaSession) return;
        const audio = audioRef.current;
        if (!audio) return;

        const updatePosition = () => {
            try {
                if (audio.duration && Number.isFinite(audio.duration)) {
                    navigator.mediaSession.setPositionState({
                        duration: audio.duration,
                        playbackRate: audio.playbackRate,
                        position: audio.currentTime,
                    });
                }
            } catch (err) {
                // Ignore position state errors
            }
        };

        // Update position periodically while playing
        const interval = isPlaying ? setInterval(updatePosition, 1000) : null;
        updatePosition(); // Update immediately

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isPlaying, hasMediaSession]);

    // ========== CAPACITOR MUSIC CONTROLS (Fallback for older Android) ==========
    // When MediaSession isn't supported, we need the plugin for both notifications AND event handling
    const mediaControlsCreatedRef = useRef(false);
    const lastMediaIdRef = useRef<string | null>(null);
    const pluginListenerSetupRef = useRef(false);

    // Set up Capacitor Music Controls event listener - ALWAYS set up on native
    useEffect(() => {
        if (!isNativePlatform()) return;
        if (pluginListenerSetupRef.current) return;

        const handleControlEvent = (action: any) => {
            const message = action?.message || action;
            const audio = audioRef.current;

            if (message === "music-controls-play" || message === "play") {
                if (audio && audio.src) {
                    audio
                        .play()
                        .then(() => {
                            if (!isPlayingRef.current) resumeRef.current();
                        })
                        .catch(() => {});
                }
            } else if (
                message === "music-controls-pause" ||
                message === "pause"
            ) {
                if (audio) audio.pause();
                if (isPlayingRef.current) pauseRef.current();
            } else if (
                message === "music-controls-next" ||
                message === "next"
            ) {
                nextRef.current();
            } else if (
                message === "music-controls-previous" ||
                message === "previous"
            ) {
                previousRef.current();
            } else if (message === "music-controls-toggle-play-pause") {
                if (isPlayingRef.current) {
                    if (audio) audio.pause();
                    pauseRef.current();
                } else {
                    if (audio && audio.src) {
                        audio
                            .play()
                            .then(() => resumeRef.current())
                            .catch(() => {});
                    }
                }
            }
        };

        // DOM event (used by some plugin versions)
        const handleDOMEvent = (event: Event) => {
            const customEvent = event as CustomEvent;
            handleControlEvent(customEvent.detail || event);
        };
        document.addEventListener("controlsNotification", handleDOMEvent);

        // Capacitor plugin listener
        CapacitorMusicControls.addListener(
            "controlsNotification",
            handleControlEvent
        ).catch(() => {});

        pluginListenerSetupRef.current = true;

        return () => {
            document.removeEventListener(
                "controlsNotification",
                handleDOMEvent
            );
        };
    }, []); // Empty deps - set up once on mount

    // Create Capacitor media controls for notification
    useEffect(() => {
        if (!isNativePlatform()) return;

        const createMediaControls = async () => {
            const currentMediaId =
                currentTrack?.id ||
                currentAudiobook?.id ||
                currentPodcast?.id ||
                null;

            if (!currentTrack && !currentAudiobook && !currentPodcast) {
                if (mediaControlsCreatedRef.current) {
                    try {
                        await CapacitorMusicControls.destroy();
                        mediaControlsCreatedRef.current = false;
                        lastMediaIdRef.current = null;
                    } catch (err) {
                        // Ignore destroy errors
                    }
                }
                return;
            }

            if (
                currentMediaId === lastMediaIdRef.current &&
                mediaControlsCreatedRef.current
            ) {
                return;
            }

            let title = "";
            let artist = "";
            let album = "";
            let cover = "";

            if (playbackType === "track" && currentTrack) {
                title = currentTrack.title;
                artist = currentTrack.artist?.name || "Unknown Artist";
                album = currentTrack.album?.title || "";
                cover = currentTrack.album?.coverArt
                    ? api.getCoverArtUrl(currentTrack.album.coverArt, 512)
                    : "";
            } else if (playbackType === "audiobook" && currentAudiobook) {
                title = currentAudiobook.title;
                artist = currentAudiobook.author || "Unknown Author";
                album = "Audiobook";
                cover = currentAudiobook.coverUrl
                    ? api.getCoverArtUrl(currentAudiobook.coverUrl, 512)
                    : "";
            } else if (playbackType === "podcast" && currentPodcast) {
                title = currentPodcast.title;
                artist = currentPodcast.podcastTitle || "Podcast";
                album = "";
                cover = currentPodcast.coverUrl
                    ? api.getCoverArtUrl(currentPodcast.coverUrl, 512)
                    : "";
            }

            try {
                await CapacitorMusicControls.create({
                    track: title || "Unknown",
                    artist: artist || "Unknown",
                    album: album || "",
                    cover: cover || "",
                    isPlaying: isPlayingRef.current,
                    dismissable: true,
                    hasPrev: true,
                    hasNext: true,
                    hasClose: false,
                    ticker: `Now playing: ${title || "Unknown"}`,
                    notificationId: 1,
                    playIcon: "ic_media_play",
                    pauseIcon: "ic_media_pause",
                    prevIcon: "ic_media_previous",
                    nextIcon: "ic_media_next",
                    closeIcon: "ic_menu_close_clear_cancel",
                    notificationIcon: "ic_stat_icon",
                });

                mediaControlsCreatedRef.current = true;
                lastMediaIdRef.current = currentMediaId;
            } catch (err) {
                // Capacitor controls creation failed
            }
        };

        createMediaControls();
    }, [currentTrack, currentAudiobook, currentPodcast, playbackType, hasMediaSession]);

    // Update Capacitor plugin isPlaying state
    useEffect(() => {
        if (!isNativePlatform()) return;
        if (!mediaControlsCreatedRef.current) return;

        const updatePlayingState = async () => {
            try {
                await CapacitorMusicControls.updateIsPlaying({
                    isPlaying: isPlaying,
                });
            } catch (err) {
                // Ignore update errors
            }
        };

        updatePlayingState();
    }, [isPlaying]);

    // Keep device awake during playback (Capacitor only)
    useEffect(() => {
        if (!isNativePlatform()) return;

        const manageWakeLock = async () => {
            try {
                if (isPlaying) {
                    await KeepAwake.keepAwake();
                } else {
                    await KeepAwake.allowSleep();
                }
            } catch (err: any) {
                // Wake lock not available - ignore
            }
        };

        manageWakeLock();

        return () => {
            if (isNativePlatform()) {
                KeepAwake.allowSleep().catch(console.error);
            }
        };
    }, [isPlaying]);

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
                setHasRestoredTime(true);
                setTimeout(() => {
                    isRestoringProgressRef.current = false;
                }, 500);
            }
        };

        audio.addEventListener("loadeddata", handleLoadedData);
        return () => audio.removeEventListener("loadeddata", handleLoadedData);
    }, [hasRestoredTime, playbackType, currentPodcast, currentAudiobook, currentTrack, setDuration]);

    // Reset restoration flag when media changes
    useEffect(() => {
        setHasRestoredTime(false);
        errorCountRef.current = 0;
        lastErrorTimeRef.current = 0;
    }, [currentTrack?.id, currentAudiobook?.id, currentPodcast?.id]);

    // Setup audio element event listeners
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => {
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
                } catch (err) {
                    // Failed to save progress
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
                    // Failed to save progress
                }
            }

            if (playbackType === "track") {
                next();
            } else {
                pause();
            }
        };

        const handleError = () => {
            const error = (audio as HTMLAudioElement).error;
            const now = Date.now();

            if (now - lastErrorTimeRef.current > 10000) {
                errorCountRef.current = 0;
            }

            errorCountRef.current++;
            lastErrorTimeRef.current = now;

            if (errorCountRef.current > 3) {
                pause();
                errorCountRef.current = 0;
                return;
            }

            // Retry on network or decode errors
            if (error?.code === 4 || error?.code === 2) {
                setTimeout(() => audio.load(), 1000);
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
    }, [playbackType, next, pause, setCurrentTime, currentAudiobook, currentPodcast]);

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
                audio.volume = isMuted ? 0 : volume;
                audio.play().catch((err) => {
                    if (err.name === "AbortError") return;
                    if (err.name === "NotAllowedError") pause();
                });
            }
        }
    }, [playbackType, currentTrack, currentAudiobook, currentPodcast, setDuration, isPlaying, isMuted, pause, volume]);

    // Handle play/pause
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!currentTrack && !currentAudiobook && !currentPodcast) return;
        if (!audio.src || audio.src === "") return;

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
            audio.volume = isMuted ? 0 : volume;
            audio.play().catch((err) => {
                if (err.name === "AbortError") return;
                if (err.name === "NotAllowedError") pause();
            });
        } else {
            if (!audio.paused) {
                audio.pause();
            }
        }
    }, [isPlaying, currentTrack, currentAudiobook, currentPodcast, pause, volume, isMuted]);

    // Handle seeking
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleSeek = (time: number) => {
            if (isRestoringProgressRef.current) return;

            audio.currentTime = time;
            lastSeekTimeRef.current = time;

            if (isPlaying && audio.paused) {
                audio.play()?.catch(() => {});
            }
        };

        const unsubscribe = audioSeekEmitter.subscribe(handleSeek);
        return unsubscribe;
    }, [isPlaying]);

    // Handle volume changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = isMuted ? 0 : volume;
    }, [volume, isMuted]);

    // Periodic progress saving for audiobooks and podcasts
    useEffect(() => {
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

            lastProgressSaveRef.current = audio.currentTime;

            if (playbackType === "audiobook" && currentAudiobook) {
                try {
                    await api.updateAudiobookProgress(
                        currentAudiobook.id,
                        audio.currentTime,
                        audio.duration || currentAudiobook.duration,
                        false
                    );
                } catch (err) {
                    // Failed to save progress
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
                    // Failed to save progress
                }
            }
        };

        if (!isPlaying) {
            saveProgress();
        }

        if (isPlaying) {
            progressSaveIntervalRef.current = setInterval(saveProgress, 30000);
        }

        return () => {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
                progressSaveIntervalRef.current = null;
            }
        };
    }, [playbackType, isPlaying, currentAudiobook, currentPodcast]);

    if (!currentTrack && !currentAudiobook && !currentPodcast) return null;

    // Still using HTML5 audio for now, but with native controls integrated
    // In the future, this could be replaced with a fully native audio player
    return <audio ref={audioRef} crossOrigin="use-credentials" />;
});
