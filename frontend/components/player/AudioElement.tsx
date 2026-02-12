"use client";

import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { api } from "@/lib/api";
import { audioEngine, detectAudioFormat } from "@/lib/audio-engine";
import { audioSeekEmitter } from "@/lib/audio-seek-emitter";
import { dispatchQueryEvent } from "@/lib/query-events";
import {
    playbackStateMachine,
    HeartbeatMonitor,
} from "@/lib/audio";
import {
    useEffect,
    useLayoutEffect,
    useRef,
    memo,
    useCallback,
} from "react";

function getNextTrackInfo(
    queue: { id: string; filePath?: string }[],
    currentIndex: number,
    isShuffle: boolean,
    shuffleIndices: number[],
    repeatMode: "off" | "one" | "all"
): { id: string; filePath?: string } | null {
    if (queue.length === 0) return null;

    let nextIndex: number;
    if (isShuffle) {
        const currentShufflePos = shuffleIndices.indexOf(currentIndex);
        if (currentShufflePos < shuffleIndices.length - 1) {
            nextIndex = shuffleIndices[currentShufflePos + 1];
        } else if (repeatMode === "all") {
            nextIndex = shuffleIndices[0];
        } else {
            return null;
        }
    } else {
        if (currentIndex < queue.length - 1) {
            nextIndex = currentIndex + 1;
        } else if (repeatMode === "all") {
            nextIndex = 0;
        } else {
            return null;
        }
    }

    return queue[nextIndex] || null;
}

function podcastDebugEnabled(): boolean {
    try {
        return (
            typeof window !== "undefined" &&
            window.localStorage?.getItem("lidifyPodcastDebug") === "1"
        );
    } catch {
        return false;
    }
}

function podcastDebugLog(message: string, data?: Record<string, unknown>) {
    if (!podcastDebugEnabled()) return;
    console.log(`[PodcastDebug] ${message}`, data || {});
}

/**
 * AudioElement - Unified audio playback using native <audio> elements
 *
 * Handles: web playback, progress saving for audiobooks/podcasts
 * Browser media controls are handled separately by useMediaSession hook
 */
export const AudioElement = memo(function AudioElement() {
    const {
        currentTrack,
        currentAudiobook,
        currentPodcast,
        playbackType,
        volume,
        isMuted,
        repeatMode,
        setCurrentAudiobook,
        setCurrentTrack,
        setCurrentPodcast,
        setPlaybackType,
        queue,
        currentIndex,
        isShuffle,
        shuffleIndices,
    } = useAudioState();

    const {
        isPlaying,
        setCurrentTimeFromEngine,
        setDuration,
        setIsPlaying,
        isBuffering,
        setIsBuffering,
        canSeek,
        setCanSeek,
        setDownloadProgress,
    } = useAudioPlayback();

    const { pause, next, nextPodcastEpisode } = useAudioControls();

    const lastTrackIdRef = useRef<string | null>(null);
    const lastPlayingStateRef = useRef<boolean>(isPlaying);
    const progressSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastProgressSaveRef = useRef<number>(0);
    const isUserInitiatedRef = useRef<boolean>(false);
    const isLoadingRef = useRef<boolean>(false);
    const loadIdRef = useRef<number>(0);
    const cachePollingRef = useRef<NodeJS.Timeout | null>(null);
    const seekCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const cacheStatusPollingRef = useRef<NodeJS.Timeout | null>(null);
    const seekReloadListenerRef = useRef<(() => void) | null>(null);
    const seekReloadInProgressRef = useRef<boolean>(false);
    const isSeekingRef = useRef<boolean>(false);
    const loadListenerRef = useRef<(() => void) | null>(null);
    const loadErrorListenerRef = useRef<(() => void) | null>(null);
    const cachePollingLoadListenerRef = useRef<(() => void) | null>(null);
    const seekOperationIdRef = useRef<number>(0);
    const seekDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const pendingSeekTimeRef = useRef<number | null>(null);
    const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastPreloadedTrackIdRef = useRef<string | null>(null);
    const heartbeatRef = useRef<HeartbeatMonitor | null>(null);

    useEffect(() => {
        heartbeatRef.current = new HeartbeatMonitor({
            onStall: () => {
                console.warn("[AudioElement] Heartbeat detected stall");
                playbackStateMachine.transition("BUFFERING");
                setIsBuffering(true);
                heartbeatRef.current?.startBufferTimeout();
            },
            onUnexpectedStop: () => {
                console.warn("[AudioElement] Heartbeat detected unexpected stop");
                if (playbackStateMachine.isPlaying) {
                    setIsPlaying(false);
                    playbackStateMachine.forceTransition("READY");
                }
            },
            onBufferTimeout: () => {
                console.error("[AudioElement] Buffer timeout - connection may be lost");
                playbackStateMachine.transition("ERROR", {
                    error: "Connection lost - audio stream timed out",
                    errorCode: 408,
                });
                setIsPlaying(false);
                setIsBuffering(false);
            },
            onRecovery: () => {
                console.log("[AudioElement] Recovered from stall");
                if (playbackStateMachine.isBuffering) {
                    playbackStateMachine.transition("PLAYING");
                    setIsBuffering(false);
                }
            },
            getCurrentTime: () => audioEngine.getCurrentTime(),
            isActuallyPlaying: () => audioEngine.isPlaying(),
        });

        return () => {
            heartbeatRef.current?.destroy();
            heartbeatRef.current = null;
        };
    }, [setIsBuffering, setIsPlaying]);

    useEffect(() => {
        if (isPlaying && !isBuffering) {
            heartbeatRef.current?.start();
        } else {
            heartbeatRef.current?.stop();
        }
    }, [isPlaying, isBuffering]);

    useEffect(() => {
        audioEngine.initializeFromStorage();
    }, []);

    useEffect(() => {
        if (!currentTrack && !currentAudiobook && !currentPodcast) {
            setDuration(0);
        }
    }, [currentTrack, currentAudiobook, currentPodcast, setDuration]);

    const saveAudiobookProgress = useCallback(
        async (isFinished: boolean = false) => {
            if (!currentAudiobook) return;

            const currentTime = audioEngine.getCurrentTime();
            const duration =
                audioEngine.getDuration() || currentAudiobook.duration;

            if (currentTime === lastProgressSaveRef.current && !isFinished)
                return;
            lastProgressSaveRef.current = currentTime;

            try {
                await api.updateAudiobookProgress(
                    currentAudiobook.id,
                    isFinished ? duration : currentTime,
                    duration,
                    isFinished
                );

                setCurrentAudiobook({
                    ...currentAudiobook,
                    progress: {
                        currentTime: isFinished ? duration : currentTime,
                        progress:
                            duration > 0
                                ? ((isFinished ? duration : currentTime) /
                                      duration) *
                                  100
                                : 0,
                        isFinished,
                        lastPlayedAt: new Date(),
                    },
                });

                dispatchQueryEvent("audiobook-progress-updated");
            } catch (err) {
                console.error(
                    "[AudioElement] Failed to save audiobook progress:",
                    err
                );
            }
        },
        [currentAudiobook, setCurrentAudiobook]
    );

    const savePodcastProgress = useCallback(
        async (isFinished: boolean = false) => {
            if (!currentPodcast) return;

            if (isBuffering && !isFinished) return;

            const currentTime = audioEngine.getCurrentTime();
            const duration =
                audioEngine.getDuration() || currentPodcast.duration;

            if (currentTime <= 0 && !isFinished) return;

            try {
                const [podcastId, episodeId] = currentPodcast.id.split(":");
                await api.updatePodcastProgress(
                    podcastId,
                    episodeId,
                    isFinished ? duration : currentTime,
                    duration,
                    isFinished
                );

                dispatchQueryEvent("podcast-progress-updated");
            } catch (err) {
                console.error(
                    "[AudioElement] Failed to save podcast progress:",
                    err
                );
            }
        },
        [currentPodcast, isBuffering]
    );

    useEffect(() => {
        const handleTimeUpdate = (data: { time: number }) => {
            setCurrentTimeFromEngine(data.time);
            heartbeatRef.current?.notifyProgress(data.time);
        };

        const handleLoad = (data: { duration: number }) => {
            const fallbackDuration =
                currentTrack?.duration ||
                currentAudiobook?.duration ||
                currentPodcast?.duration ||
                0;
            setDuration(data.duration || fallbackDuration);

            if (playbackStateMachine.getState() === "LOADING") {
                playbackStateMachine.transition("READY");
            }
        };

        const handleEnd = () => {
            if (playbackType === "audiobook" && currentAudiobook) {
                saveAudiobookProgress(true);
            } else if (playbackType === "podcast" && currentPodcast) {
                savePodcastProgress(true);
            }

            if (playbackType === "podcast") {
                nextPodcastEpisode();
            } else if (playbackType === "audiobook") {
                pause();
            } else if (playbackType === "track") {
                if (repeatMode === "one") {
                    audioEngine.seek(0);
                    audioEngine.play();
                } else {
                    next();
                }
            } else {
                pause();
            }
        };

        const handleError = (data: { error: unknown }) => {
            console.error("[AudioElement] Playback error:", data.error);

            const errorMessage = data.error instanceof Error
                ? data.error.message
                : String(data.error);
            playbackStateMachine.forceTransition("ERROR", { error: errorMessage });

            setIsPlaying(false);
            setIsBuffering(false);
            isUserInitiatedRef.current = false;
            heartbeatRef.current?.stop();

            if (playbackType === "track") {
                lastTrackIdRef.current = null;
                isLoadingRef.current = false;
                if (queue.length > 1) {
                    next();
                } else {
                    setCurrentTrack(null);
                    setPlaybackType(null);
                }
            } else if (playbackType === "audiobook") {
                setCurrentAudiobook(null);
                setPlaybackType(null);
            } else if (playbackType === "podcast") {
                setCurrentPodcast(null);
                setPlaybackType(null);
            }
        };

        const handlePlay = () => {
            playbackStateMachine.transition("PLAYING");

            if (!isUserInitiatedRef.current) {
                setIsPlaying(true);
            }
            isUserInitiatedRef.current = false;
        };

        const handlePause = () => {
            if (isLoadingRef.current) return;
            if (seekReloadInProgressRef.current) return;

            if (playbackStateMachine.isPlaying) {
                playbackStateMachine.transition("READY");
            }

            if (!isUserInitiatedRef.current) {
                setIsPlaying(false);
            }
            isUserInitiatedRef.current = false;
        };

        audioEngine.on("timeupdate", handleTimeUpdate);
        audioEngine.on("load", handleLoad);
        audioEngine.on("end", handleEnd);
        audioEngine.on("loaderror", handleError);
        audioEngine.on("playerror", handleError);
        audioEngine.on("play", handlePlay);
        audioEngine.on("pause", handlePause);

        return () => {
            audioEngine.off("timeupdate", handleTimeUpdate);
            audioEngine.off("load", handleLoad);
            audioEngine.off("end", handleEnd);
            audioEngine.off("loaderror", handleError);
            audioEngine.off("playerror", handleError);
            audioEngine.off("play", handlePlay);
            audioEngine.off("pause", handlePause);
        };
    }, [playbackType, currentTrack, currentAudiobook, currentPodcast, repeatMode, next, nextPodcastEpisode, pause, setCurrentTimeFromEngine, setDuration, setIsPlaying, setIsBuffering, queue, setCurrentTrack, setCurrentAudiobook, setCurrentPodcast, setPlaybackType, saveAudiobookProgress, savePodcastProgress]);

    useEffect(() => {
        const currentMediaId =
            currentTrack?.id ||
            currentAudiobook?.id ||
            currentPodcast?.id ||
            null;

        if (!currentMediaId) {
            audioEngine.stop();
            lastTrackIdRef.current = null;
            isLoadingRef.current = false;
            playbackStateMachine.forceTransition("IDLE");
            heartbeatRef.current?.stop();
            return;
        }

        if (currentMediaId === lastTrackIdRef.current) {
            if (isSeekingRef.current) {
                return;
            }

            const shouldPlay = lastPlayingStateRef.current || isPlaying;
            const isCurrentlyPlaying = audioEngine.isPlaying();

            if (shouldPlay && !isCurrentlyPlaying) {
                audioEngine.seek(0);
                audioEngine.play();
            }
            return;
        }

        if (isLoadingRef.current) return;

        // Check if the engine already has this track loaded (e.g., MediaSession
        // handler loaded it directly in the background). Skip the load to
        // prevent double-load that causes choppy audio.
        const engineSrc = audioEngine.getState().currentSrc;
        if (engineSrc && playbackType === "track" && currentTrack) {
            const expectedSrc = api.getStreamUrl(currentTrack.id);
            if (engineSrc === expectedSrc) {
                lastTrackIdRef.current = currentMediaId;
                return;
            }
        }

        isLoadingRef.current = true;
        lastTrackIdRef.current = currentMediaId;
        loadIdRef.current += 1;
        const thisLoadId = loadIdRef.current;

        playbackStateMachine.forceTransition("LOADING");

        let streamUrl: string | null = null;
        let startTime = 0;

        if (playbackType === "track" && currentTrack) {
            streamUrl = api.getStreamUrl(currentTrack.id);
        } else if (playbackType === "audiobook" && currentAudiobook) {
            streamUrl = api.getAudiobookStreamUrl(currentAudiobook.id);
            startTime = currentAudiobook.progress?.currentTime || 0;
        } else if (playbackType === "podcast" && currentPodcast) {
            const [podcastId, episodeId] = currentPodcast.id.split(":");
            streamUrl = api.getPodcastEpisodeStreamUrl(podcastId, episodeId);
            startTime = currentPodcast.progress?.currentTime || 0;
            podcastDebugLog("load podcast", {
                currentPodcastId: currentPodcast.id,
                podcastId,
                episodeId,
                title: currentPodcast.title,
                podcastTitle: currentPodcast.podcastTitle,
                startTime,
                loadId: thisLoadId,
            });
        }

        if (streamUrl) {
            const wasPlayingBeforeLoad = audioEngine.isPlaying();

            const fallbackDuration =
                currentTrack?.duration ||
                currentAudiobook?.duration ||
                currentPodcast?.duration ||
                0;
            setDuration(fallbackDuration);

            const format = detectAudioFormat(currentTrack?.filePath);

            audioEngine.load(streamUrl, false, format);
            if (playbackType === "podcast" && currentPodcast) {
                podcastDebugLog("audioEngine.load()", {
                    url: streamUrl,
                    format,
                    loadId: thisLoadId,
                });
            }

            if (loadListenerRef.current) {
                audioEngine.off("load", loadListenerRef.current);
                loadListenerRef.current = null;
            }
            if (loadErrorListenerRef.current) {
                audioEngine.off("loaderror", loadErrorListenerRef.current);
                loadErrorListenerRef.current = null;
            }

            const handleLoaded = () => {
                if (loadIdRef.current !== thisLoadId) return;

                isLoadingRef.current = false;

                if (startTime > 0) {
                    audioEngine.seek(startTime);
                }
                if (playbackType === "podcast" && currentPodcast) {
                    podcastDebugLog("loaded", {
                        loadId: thisLoadId,
                        duration: audioEngine.getDuration(),
                        currentTime: audioEngine.getCurrentTime(),
                        actualTime: audioEngine.getActualCurrentTime(),
                        startTime,
                        canSeek,
                    });
                }

                const shouldAutoPlay =
                    lastPlayingStateRef.current || wasPlayingBeforeLoad;

                if (shouldAutoPlay) {
                    audioEngine.play();
                    if (!lastPlayingStateRef.current) {
                        setIsPlaying(true);
                    }
                }

                audioEngine.off("load", handleLoaded);
                audioEngine.off("loaderror", handleLoadError);
                loadListenerRef.current = null;
                loadErrorListenerRef.current = null;
            };

            const handleLoadError = () => {
                isLoadingRef.current = false;
                audioEngine.off("load", handleLoaded);
                audioEngine.off("loaderror", handleLoadError);
                loadListenerRef.current = null;
                loadErrorListenerRef.current = null;
            };

            loadListenerRef.current = handleLoaded;
            loadErrorListenerRef.current = handleLoadError;

            audioEngine.on("load", handleLoaded);
            audioEngine.on("loaderror", handleLoadError);
        } else {
            isLoadingRef.current = false;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canSeek/isPlaying/setIsPlaying intentionally excluded: adding them would re-trigger audio loading on play/pause or seek state changes, breaking playback
    }, [currentTrack, currentAudiobook, currentPodcast, playbackType, setDuration]);

    useEffect(() => {
        if (playbackType !== "track" || !currentTrack || !isPlaying) {
            return;
        }

        if (preloadTimeoutRef.current) {
            clearTimeout(preloadTimeoutRef.current);
            preloadTimeoutRef.current = null;
        }

        const nextTrack = getNextTrackInfo(
            queue,
            currentIndex,
            isShuffle,
            shuffleIndices,
            repeatMode
        );

        if (!nextTrack || nextTrack.id === lastPreloadedTrackIdRef.current) {
            return;
        }

        preloadTimeoutRef.current = setTimeout(() => {
            const streamUrl = api.getStreamUrl(nextTrack.id);
            audioEngine.preload(streamUrl, detectAudioFormat(nextTrack.filePath));
            lastPreloadedTrackIdRef.current = nextTrack.id;
        }, 2000);

        return () => {
            if (preloadTimeoutRef.current) {
                clearTimeout(preloadTimeoutRef.current);
                preloadTimeoutRef.current = null;
            }
        };
    }, [playbackType, currentTrack, isPlaying, queue, currentIndex, isShuffle, shuffleIndices, repeatMode]);

    useEffect(() => {
        if (playbackType !== "podcast") {
            setCanSeek(true);
            setDownloadProgress(null);
            if (cacheStatusPollingRef.current) {
                clearInterval(cacheStatusPollingRef.current);
                cacheStatusPollingRef.current = null;
            }
            return;
        }

        if (!currentPodcast) {
            setCanSeek(true);
            return;
        }

        const [podcastId, episodeId] = currentPodcast.id.split(":");

        const checkCacheStatus = async () => {
            try {
                const status = await api.getPodcastEpisodeCacheStatus(
                    podcastId,
                    episodeId
                );

                if (status.cached) {
                    setCanSeek(true);
                    setDownloadProgress(null);
                    if (cacheStatusPollingRef.current) {
                        clearInterval(cacheStatusPollingRef.current);
                        cacheStatusPollingRef.current = null;
                    }
                } else {
                    setCanSeek(false);
                    setDownloadProgress(
                        status.downloadProgress ??
                            (status.downloading ? 0 : null)
                    );
                }

                return status.cached;
            } catch (err) {
                console.error(
                    "[AudioElement] Failed to check cache status:",
                    err
                );
                setCanSeek(true);
                return true;
            }
        };

        checkCacheStatus();

        cacheStatusPollingRef.current = setInterval(async () => {
            const isCached = await checkCacheStatus();
            if (isCached && cacheStatusPollingRef.current) {
                clearInterval(cacheStatusPollingRef.current);
                cacheStatusPollingRef.current = null;
            }
        }, 5000);

        return () => {
            if (cacheStatusPollingRef.current) {
                clearInterval(cacheStatusPollingRef.current);
                cacheStatusPollingRef.current = null;
            }
        };
    }, [currentPodcast, playbackType, setCanSeek, setDownloadProgress]);

    useLayoutEffect(() => {
        lastPlayingStateRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
        if (isLoadingRef.current) return;

        isUserInitiatedRef.current = true;

        if (isPlaying) {
            audioEngine.play();
        } else {
            audioEngine.pause();
        }
    }, [isPlaying]);

    useEffect(() => {
        audioEngine.setVolume(volume);
    }, [volume]);

    useEffect(() => {
        audioEngine.setMuted(isMuted);
    }, [isMuted]);

    // Handle seeking via event emitter
    useEffect(() => {
        let previousTime = audioEngine.getCurrentTime();

        const handleSeek = async (time: number) => {
            seekOperationIdRef.current += 1;
            const thisSeekId = seekOperationIdRef.current;

            const wasPlayingAtSeekStart = audioEngine.isPlaying();

            const timeDelta = Math.abs(time - previousTime);
            const isLargeSkip = timeDelta >= 10;
            previousTime = time;

            if (playbackType === "podcast" && currentPodcast) {
                if (seekCheckTimeoutRef.current) {
                    clearTimeout(seekCheckTimeoutRef.current);
                    seekCheckTimeoutRef.current = null;
                }

                if (cachePollingRef.current) {
                    clearInterval(cachePollingRef.current);
                    cachePollingRef.current = null;
                }

                if (seekReloadListenerRef.current) {
                    audioEngine.off("load", seekReloadListenerRef.current);
                    seekReloadListenerRef.current = null;
                }

                if (cachePollingLoadListenerRef.current) {
                    audioEngine.off(
                        "load",
                        cachePollingLoadListenerRef.current
                    );
                    cachePollingLoadListenerRef.current = null;
                }

                if (seekDebounceRef.current) {
                    clearTimeout(seekDebounceRef.current);
                    seekDebounceRef.current = null;
                }

                pendingSeekTimeRef.current = time;

                const [podcastId, episodeId] = currentPodcast.id.split(":");

                const executeSeek = async () => {
                    const seekTime = pendingSeekTimeRef.current ?? time;
                    pendingSeekTimeRef.current = null;

                    if (seekOperationIdRef.current !== thisSeekId) {
                        return;
                    }

                    try {
                        const status = await api.getPodcastEpisodeCacheStatus(
                            podcastId,
                            episodeId
                        );

                        if (seekOperationIdRef.current !== thisSeekId) {
                            podcastDebugLog("seek: aborted (stale operation)", {
                                thisSeekId,
                                currentId: seekOperationIdRef.current,
                            });
                            return;
                        }

                        if (status.cached) {
                            podcastDebugLog(
                                "seek: cached=true, trying direct seek first",
                                {
                                    time: seekTime,
                                    podcastId,
                                    episodeId,
                                }
                            );

                            audioEngine.seek(seekTime);

                            setTimeout(() => {
                                if (seekOperationIdRef.current !== thisSeekId) {
                                    return;
                                }

                                const actualPos =
                                    audioEngine.getActualCurrentTime();
                                const seekSucceeded =
                                    Math.abs(actualPos - seekTime) < 5;

                                podcastDebugLog("seek: direct seek result", {
                                    seekTime,
                                    actualPos,
                                    seekSucceeded,
                                });

                                if (!seekSucceeded) {
                                    podcastDebugLog(
                                        "seek: direct seek failed, falling back to reload"
                                    );
                                    seekReloadInProgressRef.current = true;

                                    audioEngine.reload();

                                    const onLoad = () => {
                                        audioEngine.off("load", onLoad);
                                        seekReloadListenerRef.current = null;
                                        seekReloadInProgressRef.current = false;

                                        if (
                                            seekOperationIdRef.current !==
                                            thisSeekId
                                        ) {
                                            return;
                                        }

                                        audioEngine.seek(seekTime);

                                        if (wasPlayingAtSeekStart) {
                                            audioEngine.play();
                                            setIsPlaying(true);
                                        }
                                    };

                                    seekReloadListenerRef.current = onLoad;
                                    audioEngine.on("load", onLoad);
                                } else {
                                    if (
                                        wasPlayingAtSeekStart &&
                                        !audioEngine.isPlaying()
                                    ) {
                                        audioEngine.play();
                                    }
                                }
                            }, 150);

                            return;
                        }
                    } catch (e) {
                        console.warn(
                            "[AudioElement] Could not check cache status:",
                            e
                        );
                    }

                    if (seekOperationIdRef.current !== thisSeekId) {
                        return;
                    }

                    audioEngine.seek(seekTime);

                    seekCheckTimeoutRef.current = setTimeout(() => {
                        if (seekOperationIdRef.current !== thisSeekId) {
                            return;
                        }

                        try {
                            const actualPos =
                                audioEngine.getActualCurrentTime();
                            const seekFailed =
                                Math.abs(actualPos - seekTime) > 5;

                            podcastDebugLog("seek check (streaming)", {
                                time: seekTime,
                                actualPos,
                                seekFailed,
                                podcastId,
                                episodeId,
                            });
                        } catch (e) {
                            console.error(
                                "[AudioElement] Seek check error:",
                                e
                            );
                        }
                    }, 2000);
                };

                if (isLargeSkip) {
                    podcastDebugLog("seek: large skip, executing immediately", {
                        timeDelta,
                        time,
                    });
                    executeSeek();
                } else {
                    podcastDebugLog("seek: fine scrub, debouncing", {
                        timeDelta,
                        time,
                    });
                    seekDebounceRef.current = setTimeout(executeSeek, 150);
                }

                return;
            }

            isSeekingRef.current = true;
            audioEngine.seek(time);

            setTimeout(() => {
                isSeekingRef.current = false;
            }, 100);
        };

        const unsubscribe = audioSeekEmitter.subscribe(handleSeek);
        return unsubscribe;
    }, [playbackType, currentPodcast, setIsBuffering, setIsPlaying]);

    useEffect(() => {
        return () => {
            if (cachePollingRef.current) {
                clearInterval(cachePollingRef.current);
            }
            if (seekCheckTimeoutRef.current) {
                clearTimeout(seekCheckTimeoutRef.current);
            }
            if (seekReloadListenerRef.current) {
                audioEngine.off("load", seekReloadListenerRef.current);
                seekReloadListenerRef.current = null;
            }
            if (seekDebounceRef.current) {
                clearTimeout(seekDebounceRef.current);
                seekDebounceRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (playbackType !== "audiobook" && playbackType !== "podcast") {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
                progressSaveIntervalRef.current = null;
            }
            return;
        }

        if (!isPlaying) {
            if (playbackType === "audiobook") {
                saveAudiobookProgress();
            } else if (playbackType === "podcast") {
                savePodcastProgress();
            }
        }

        if (isPlaying) {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
            }
            progressSaveIntervalRef.current = setInterval(() => {
                if (playbackType === "audiobook") {
                    saveAudiobookProgress();
                } else if (playbackType === "podcast") {
                    savePodcastProgress();
                }
            }, 30000);
        }

        return () => {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
                progressSaveIntervalRef.current = null;
            }
        };
    }, [playbackType, isPlaying, saveAudiobookProgress, savePodcastProgress]);

    useEffect(() => {
        return () => {
            audioEngine.stop();

            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
            }
            if (loadListenerRef.current) {
                audioEngine.off("load", loadListenerRef.current);
                loadListenerRef.current = null;
            }
            if (loadErrorListenerRef.current) {
                audioEngine.off("loaderror", loadErrorListenerRef.current);
                loadErrorListenerRef.current = null;
            }
            if (cachePollingLoadListenerRef.current) {
                audioEngine.off("load", cachePollingLoadListenerRef.current);
                cachePollingLoadListenerRef.current = null;
            }
            if (preloadTimeoutRef.current) {
                clearTimeout(preloadTimeoutRef.current);
            }
            lastPreloadedTrackIdRef.current = null;
        };
    }, []);

    return null;
});
