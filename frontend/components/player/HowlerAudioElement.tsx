"use client";

import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { api } from "@/lib/api";
import { howlerEngine } from "@/lib/howler-engine";
import { audioSeekEmitter } from "@/lib/audio-seek-emitter";
import { isCapacitorShell } from "@/lib/platform";
import { useEffect, useLayoutEffect, useRef, memo, useCallback } from "react";

// Capacitor imports for native platform
let KeepAwake: any = null;
let CapacitorMusicControls: any = null;

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
    // eslint-disable-next-line no-console
    console.log(`[PodcastDebug] ${message}`, data || {});
}

// Dynamic import for Capacitor plugins (only when Capacitor native bridge is present).
// IMPORTANT: The SDK navigates to a remote server origin inside the WebView. We must still
// load native plugins in that case, otherwise media controls/background mode won't work.
//
// Log platform detection at module load
if (typeof window !== "undefined") {
    const shellCheck = isCapacitorShell();
    console.log("[NativeAudio] Module init - isCapacitorShell:", shellCheck, "URL:", window.location.href);
}

const hasNativeBridge =
    typeof window !== "undefined" &&
    !!((window as any).Capacitor?.isNativePlatform?.() || (window as any).Capacitor);

if (typeof window !== "undefined" && hasNativeBridge) {
    console.log("[NativeAudio] Loading native plugins...");
    
    import("@capacitor-community/keep-awake")
        .then((m) => {
            KeepAwake = m.KeepAwake;
            console.log("[NativeAudio] KeepAwake plugin loaded successfully");
        })
        .catch((err) => {
            console.warn("[NativeAudio] KeepAwake plugin not available:", err);
        });

    import("capacitor-music-controls-plugin")
        .then((m) => {
            CapacitorMusicControls = m.CapacitorMusicControls;
            console.log("[NativeAudio] MusicControls plugin loaded successfully");
        })
        .catch((err) => {
            console.warn("[NativeAudio] MusicControls plugin not available:", err);
        });
}

/**
 * HowlerAudioElement - Unified audio playback using Howler.js
 *
 * Replaces both AudioElement.tsx and NativeAudioElement.tsx
 * Handles: web playback, Capacitor native controls, progress saving
 */
export const HowlerAudioElement = memo(function HowlerAudioElement() {
    // State context
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
    } = useAudioState();

    // Playback context
    const {
        isPlaying,
        setCurrentTime,
        setDuration,
        setIsPlaying,
        isBuffering,
        setIsBuffering,
        targetSeekPosition,
        setTargetSeekPosition,
        canSeek,
        setCanSeek,
        setDownloadProgress,
    } = useAudioPlayback();

    // Controls context
    const { pause, next, previous, resume } = useAudioControls();

    // Refs
    const lastTrackIdRef = useRef<string | null>(null);
    // Initialize to current isPlaying state to handle remounts correctly
    const lastPlayingStateRef = useRef<boolean>(isPlaying);
    const progressSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastProgressSaveRef = useRef<number>(0);
    const mediaControlsInitialized = useRef<boolean>(false);
    const mediaControlsCreated = useRef<boolean>(false); // Track if create() has been called
    // Check native status synchronously to avoid timing race conditions
    // The Capacitor bridge is available as soon as the page loads in the WebView
    const isNative = useRef<boolean>(
        typeof window !== "undefined" &&
        (isCapacitorShell() ||
            !!((window as any).Capacitor?.isNativePlatform?.() ||
                (window as any).Capacitor))
    );
    // One-time permission prompt guard (Android 13+ notifications)
    const notificationsPermissionRequestedRef = useRef<boolean>(false);
    const isUserInitiatedRef = useRef<boolean>(false); // Track if play/pause was user-initiated
    const isLoadingRef = useRef<boolean>(false); // Prevent duplicate loads
    const loadIdRef = useRef<number>(0); // Unique ID for each load to prevent race conditions
    const cachePollingRef = useRef<NodeJS.Timeout | null>(null); // Polling for podcast cache
    const seekCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Seek detection timeout
    const cacheStatusPollingRef = useRef<NodeJS.Timeout | null>(null); // Polling cache status for canSeek
    const seekReloadListenerRef = useRef<(() => void) | null>(null); // Track current seek-reload listener to prevent stacking
    const seekReloadInProgressRef = useRef<boolean>(false); // Guard against pause events during seek-reload
    
    // Background playback recovery refs
    const expectedPlayingRef = useRef<boolean>(false); // What we EXPECT the playback state to be
    const lastKnownPositionRef = useRef<number>(0); // Last known good position for recovery
    const reconnectAttemptsRef = useRef<number>(0); // Track reconnection attempts
    const maxReconnectAttempts = 5; // Max reconnection attempts
    const watchdogIntervalRef = useRef<NodeJS.Timeout | null>(null); // Watchdog for detecting playback interruptions
    const lastPlaybackCheckRef = useRef<number>(0); // Last time we checked playback position

    // Reset duration when nothing is playing
    useEffect(() => {
        if (!currentTrack && !currentAudiobook && !currentPodcast) {
            setDuration(0);
        }
    }, [currentTrack, currentAudiobook, currentPodcast, setDuration]);

    // Subscribe to Howler events
    useEffect(() => {
        const handleTimeUpdate = (data: { time: number }) => {
            setCurrentTime(data.time);
        };

        const handleLoad = (data: { duration: number }) => {
            const fallbackDuration =
                currentTrack?.duration ||
                currentAudiobook?.duration ||
                currentPodcast?.duration ||
                0;
            setDuration(data.duration || fallbackDuration);
        };

        const handleEnd = () => {
            // Save final progress for audiobooks/podcasts
            if (playbackType === "audiobook" && currentAudiobook) {
                saveAudiobookProgress(true);
            } else if (playbackType === "podcast" && currentPodcast) {
                savePodcastProgress(true);
            }

            // Handle track advancement based on repeat mode
            if (playbackType === "track") {
                if (repeatMode === "one") {
                    // Repeat current track
                    howlerEngine.seek(0);
                    howlerEngine.play();
                } else {
                    // Move to next track (queue handles repeat-all)
                    next();
                }
            } else {
                // For audiobooks/podcasts, just pause
                pause();
            }
        };

        const handleError = (data: { error: any }) => {
            console.error("[HowlerAudioElement] Playback error:", data.error);
            setIsPlaying(false);
            isUserInitiatedRef.current = false;
            
            // Clear the failed track and try to play the next one
            // This prevents infinite retry loops on deleted/missing files
            if (playbackType === "track") {
                // If there are more tracks in the queue, try the next one
                if (queue.length > 1) {
                    console.log("[HowlerAudioElement] Track failed, trying next in queue");
                    // Clear refs to allow loading next track
                    lastTrackIdRef.current = null;
                    isLoadingRef.current = false;
                    // Move to next track
                    next();
                } else {
                    // No more tracks - clear everything
                    console.log("[HowlerAudioElement] Track failed, no more in queue - clearing");
                    lastTrackIdRef.current = null;
                    isLoadingRef.current = false;
                    setCurrentTrack(null);
                    setPlaybackType(null);
                }
            } else if (playbackType === "audiobook") {
                // For audiobooks, clear it so user can try again
                setCurrentAudiobook(null);
                setPlaybackType(null);
            } else if (playbackType === "podcast") {
                setCurrentPodcast(null);
                setPlaybackType(null);
            }
        };

        const handlePlay = () => {
            if (!isUserInitiatedRef.current) {
                setIsPlaying(true);
            }
            isUserInitiatedRef.current = false;

            // Keep screen awake on native
            if (isNative.current && KeepAwake) {
                KeepAwake.keepAwake().catch(() => {});
            }
        };

        const handlePause = () => {
            // Ignore pause events while loading a new track
            // (loading a new track stops the old one, triggering 'pause')
            if (isLoadingRef.current) {
                return;
            }
            
            // Ignore pause events during seek-reload operations
            // (reload() calls cleanup() which stops the Howl, triggering 'pause')
            if (seekReloadInProgressRef.current) {
                return;
            }
            
            if (!isUserInitiatedRef.current) {
                setIsPlaying(false);
            }
            isUserInitiatedRef.current = false;

            // Allow screen to sleep on native
            if (isNative.current && KeepAwake) {
                KeepAwake.allowSleep().catch(() => {});
            }
        };

        howlerEngine.on("timeupdate", handleTimeUpdate);
        howlerEngine.on("load", handleLoad);
        howlerEngine.on("end", handleEnd);
        howlerEngine.on("loaderror", handleError);
        howlerEngine.on("playerror", handleError);
        howlerEngine.on("play", handlePlay);
        howlerEngine.on("pause", handlePause);

        return () => {
            howlerEngine.off("timeupdate", handleTimeUpdate);
            howlerEngine.off("load", handleLoad);
            howlerEngine.off("end", handleEnd);
            howlerEngine.off("loaderror", handleError);
            howlerEngine.off("playerror", handleError);
            howlerEngine.off("play", handlePlay);
            howlerEngine.off("pause", handlePause);
        };
    }, [playbackType, currentTrack, currentAudiobook, currentPodcast, repeatMode, next, pause, setCurrentTime, setDuration, setIsPlaying, queue, setCurrentTrack, setCurrentAudiobook, setCurrentPodcast, setPlaybackType]);

    // Save audiobook progress
    const saveAudiobookProgress = useCallback(
        async (isFinished: boolean = false) => {
            if (!currentAudiobook) return;

            const currentTime = howlerEngine.getCurrentTime();
            const duration =
                howlerEngine.getDuration() || currentAudiobook.duration;

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
            } catch (err) {
                console.error(
                    "[HowlerAudioElement] Failed to save audiobook progress:",
                    err
                );
            }
        },
        [currentAudiobook, setCurrentAudiobook]
    );

    // Save podcast progress
    const savePodcastProgress = useCallback(
        async (isFinished: boolean = false) => {
            if (!currentPodcast) return;

            // Don't save progress while buffering
            if (isBuffering && !isFinished) {
                return;
            }

            const currentTime = howlerEngine.getCurrentTime();
            const duration =
                howlerEngine.getDuration() || currentPodcast.duration;

            // Don't save 0 progress unless explicitly finishing
            if (currentTime <= 0 && !isFinished) {
                return;
            }

            try {
                const [podcastId, episodeId] = currentPodcast.id.split(":");
                await api.updatePodcastProgress(
                    podcastId,
                    episodeId,
                    isFinished ? duration : currentTime,
                    duration,
                    isFinished
                );
            } catch (err) {
                console.error(
                    "[HowlerAudioElement] Failed to save podcast progress:",
                    err
                );
            }
        },
        [currentPodcast, isBuffering]
    );

    // Load and play audio when track changes
    useEffect(() => {
        const currentMediaId =
            currentTrack?.id ||
            currentAudiobook?.id ||
            currentPodcast?.id ||
            null;

        if (!currentMediaId) {
            howlerEngine.stop();
            lastTrackIdRef.current = null;
            isLoadingRef.current = false;
            return;
        }

        // Prevent duplicate loads - check both the ref AND loading state
        if (currentMediaId === lastTrackIdRef.current) {
            // Track is already loaded, but we might need to restart playback
            // Check both React state (lastPlayingStateRef) AND current isPlaying prop
            // The isPlaying prop handles the case where next() just set it to true
            const shouldPlay = lastPlayingStateRef.current || isPlaying;
            const isCurrentlyPlaying = howlerEngine.isPlaying();
            
            
            if (shouldPlay && !isCurrentlyPlaying) {
                howlerEngine.seek(0);
                howlerEngine.play();
            }
            return;
        }

        if (isLoadingRef.current) {
            return;
        }

        // Set loading guard IMMEDIATELY before any async operations
        isLoadingRef.current = true;
        lastTrackIdRef.current = currentMediaId;
        loadIdRef.current += 1;
        const thisLoadId = loadIdRef.current;

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
            // Capture Howler playing state BEFORE load() stops it
            // This handles HMR/remount case where React state is reset but Howler was playing
            const wasHowlerPlayingBeforeLoad = howlerEngine.isPlaying();
            
            // Set fallback duration immediately
            const fallbackDuration =
                currentTrack?.duration ||
                currentAudiobook?.duration ||
                currentPodcast?.duration ||
                0;
            setDuration(fallbackDuration);

            // Determine format based on file extension (if available) or use mp3 as default
            // The backend transcodes to mp3, or serves original (flac, mp3, etc.)
            let format = "mp3"; // Default to mp3 (transcoded format)
            const filePath = currentTrack?.filePath || "";
            if (filePath) {
                const ext = filePath.split(".").pop()?.toLowerCase();
                if (ext === "flac") format = "flac";
                else if (ext === "m4a" || ext === "aac") format = "mp4";
                else if (ext === "ogg" || ext === "opus") format = "webm";
                else if (ext === "wav") format = "wav";
                // mp3 stays as default
            }

            // Load the audio - DON'T pass isPlaying here, handle autoplay separately
            howlerEngine.load(streamUrl, false, format);
            if (playbackType === "podcast" && currentPodcast) {
                podcastDebugLog("howlerEngine.load()", {
                    url: streamUrl,
                    format,
                    loadId: thisLoadId,
                });
            }

            // Wait for load to complete, then handle autoplay and seeking
            const handleLoaded = () => {
                // Check if this load is still relevant
                if (loadIdRef.current !== thisLoadId) {
                    return;
                }

                isLoadingRef.current = false;

                // Restore position for audiobooks/podcasts
                if (startTime > 0) {
                    howlerEngine.seek(startTime);
                }
                if (playbackType === "podcast" && currentPodcast) {
                    podcastDebugLog("loaded", {
                        loadId: thisLoadId,
                        durationHowler: howlerEngine.getDuration(),
                        howlerTime: howlerEngine.getCurrentTime(),
                        actualTime: howlerEngine.getActualCurrentTime(),
                        startTime,
                        canSeek,
                    });
                }


                // Auto-play if:
                // 1. isPlaying state was true (normal case)
                // 2. OR Howler was playing before we loaded (handles HMR/remount case)
                const shouldAutoPlay = lastPlayingStateRef.current || wasHowlerPlayingBeforeLoad;
                
                
                if (shouldAutoPlay) {
                    howlerEngine.play();
                    // Sync React state if Howler was playing but state was false
                    if (!lastPlayingStateRef.current) {
                        setIsPlaying(true);
                    }
                }

                howlerEngine.off("load", handleLoaded);
            };

            const handleLoadError = () => {
                isLoadingRef.current = false;
                howlerEngine.off("load", handleLoaded);
                howlerEngine.off("loaderror", handleLoadError);
            };

            howlerEngine.on("load", handleLoaded);
            howlerEngine.on("loaderror", handleLoadError);
        } else {
            isLoadingRef.current = false;
        }
    }, [currentTrack, currentAudiobook, currentPodcast, playbackType, setDuration]);

    // Check podcast cache status and control canSeek
    useEffect(() => {
        // Reset canSeek when switching media types
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

        // Check cache status immediately
        const checkCacheStatus = async () => {
            try {
                const status = await api.getPodcastEpisodeCacheStatus(
                    podcastId,
                    episodeId
                );

                if (status.cached) {
                    setCanSeek(true);
                    setDownloadProgress(null);
                    // Stop polling if cached
                    if (cacheStatusPollingRef.current) {
                        clearInterval(cacheStatusPollingRef.current);
                        cacheStatusPollingRef.current = null;
                    }
                } else {
                    setCanSeek(false);
                    // Show download progress if available, otherwise just show downloading state
                    setDownloadProgress(
                        status.downloadProgress ??
                            (status.downloading ? 0 : null)
                    );
                }

                return status.cached;
            } catch (err) {
                console.error(
                    "[HowlerAudioElement] Failed to check cache status:",
                    err
                );
                // Default to allowing seek on error
                setCanSeek(true);
                return true;
            }
        };

        // Initial check
        checkCacheStatus();

        // Start polling if not cached
        cacheStatusPollingRef.current = setInterval(async () => {
            const isCached = await checkCacheStatus();
            if (isCached && cacheStatusPollingRef.current) {
                clearInterval(cacheStatusPollingRef.current);
                cacheStatusPollingRef.current = null;
            }
        }, 5000); // Check every 5 seconds

        return () => {
            if (cacheStatusPollingRef.current) {
                clearInterval(cacheStatusPollingRef.current);
                cacheStatusPollingRef.current = null;
            }
        };
    }, [currentPodcast, playbackType, setCanSeek, setDownloadProgress]);

    // Keep lastPlayingStateRef always in sync (for use by track loading effect)
    // Using useLayoutEffect to ensure this runs BEFORE the track loading effect
    useLayoutEffect(() => {
        lastPlayingStateRef.current = isPlaying;
    }, [isPlaying]);

    // Handle play/pause changes from UI
    useEffect(() => {
        // Don't control playback while loading a new track - the load handler will do it
        if (isLoadingRef.current) return;

        // Mark this as user-initiated to prevent circular updates
        isUserInitiatedRef.current = true;

        if (isPlaying) {
            howlerEngine.play();
        } else {
            howlerEngine.pause();
        }

        // Update native media controls (only if create() has been called)
        if (isNative.current && CapacitorMusicControls && mediaControlsCreated.current) {
            CapacitorMusicControls.updateIsPlaying({ isPlaying }).catch(
                () => {}
            );
        }
    }, [isPlaying]);

    // Handle volume changes
    useEffect(() => {
        howlerEngine.setVolume(volume);
    }, [volume]);

    // Handle mute changes
    useEffect(() => {
        howlerEngine.setMuted(isMuted);
    }, [isMuted]);

    // Poll for podcast cache and reload when ready
    // (Defined before the seek handler that uses it)
    const startCachePolling = useCallback(
        (podcastId: string, episodeId: string, targetTime: number) => {
            // Clear any existing polling
            if (cachePollingRef.current) {
                clearInterval(cachePollingRef.current);
            }

            let pollCount = 0;
            const maxPolls = 60; // 2 minutes max (2s intervals)

            cachePollingRef.current = setInterval(async () => {
                pollCount++;

                try {
                    const status = await api.getPodcastEpisodeCacheStatus(
                        podcastId,
                        episodeId
                    );
                    podcastDebugLog("cache poll", {
                        podcastId,
                        episodeId,
                        pollCount,
                        cached: status.cached,
                        downloading: status.downloading,
                        downloadProgress: status.downloadProgress,
                        targetTime,
                    });

                    if (status.cached) {
                        // Cache is ready! Clear polling and reload
                        if (cachePollingRef.current) {
                            clearInterval(cachePollingRef.current);
                            cachePollingRef.current = null;
                        }

                        // Reload the audio (it will now stream from cache)
                        podcastDebugLog("cache ready -> howlerEngine.reload()", {
                            podcastId,
                            episodeId,
                            targetTime,
                        });
                        howlerEngine.reload();

                        // Wait for load, then seek and play
                        const onLoad = () => {
                            howlerEngine.off("load", onLoad);

                            howlerEngine.seek(targetTime);
                            setCurrentTime(targetTime);
                            howlerEngine.play();
                            podcastDebugLog("post-reload seek+play", {
                                podcastId,
                                episodeId,
                                targetTime,
                                howlerTime: howlerEngine.getCurrentTime(),
                                actualTime: howlerEngine.getActualCurrentTime(),
                            });

                            // Clear buffering state
                            setIsBuffering(false);
                            setTargetSeekPosition(null);
                            setIsPlaying(true);
                        };

                        howlerEngine.on("load", onLoad);
                    } else if (pollCount >= maxPolls) {
                        // Timeout - stop polling
                        if (cachePollingRef.current) {
                            clearInterval(cachePollingRef.current);
                            cachePollingRef.current = null;
                        }

                        console.warn(
                            "[HowlerAudioElement] Cache polling timeout"
                        );
                        setIsBuffering(false);
                        setTargetSeekPosition(null);
                    }
                } catch (error) {
                    console.error(
                        "[HowlerAudioElement] Cache polling error:",
                        error
                    );
                }
            }, 2000); // Poll every 2 seconds
        },
        [setCurrentTime, setIsBuffering, setTargetSeekPosition, setIsPlaying]
    );

    // Handle seeking via event emitter
    useEffect(() => {
        const handleSeek = async (time: number) => {
            // CRITICAL: Capture playing state FIRST, before ANY operations
            const wasPlayingAtSeekStart = howlerEngine.isPlaying();
            
            // Update UI immediately to show target position
            setCurrentTime(time);

            // For podcasts, use the reload+seek pattern (don't call howlerEngine.seek directly)
            // Direct seek causes browser to send conflicting range requests
            if (playbackType === "podcast" && currentPodcast) {
                // Clear any pending seek check
                if (seekCheckTimeoutRef.current) {
                    clearTimeout(seekCheckTimeoutRef.current);
                }

                // First check if file is already cached - if so, trust the seek
                const [podcastId, episodeId] = currentPodcast.id.split(":");
                try {
                    const status = await api.getPodcastEpisodeCacheStatus(
                        podcastId,
                        episodeId
                    );

                    // If cached, Howler.seek() is unreliable for streaming audio.
                    // The browser often sends BOTH a range request at the seek position AND
                    // a reload from bytes=0-, causing playback to restart from the beginning.
                    // 
                    // The ONLY reliable way to seek in streaming audio is to reload the source
                    // and seek AFTER load completes (same pattern as cache-ready polling).
                    if (status.cached) {
                        podcastDebugLog("seek: cached=true, using reload+seek pattern", {
                            time,
                            podcastId,
                            episodeId,
                        });
                        
                        // Clean up any previous seek-reload listener to prevent stacking
                        if (seekReloadListenerRef.current) {
                            howlerEngine.off("load", seekReloadListenerRef.current);
                            seekReloadListenerRef.current = null;
                        }
                        
                        // Mark seek-reload in progress to prevent pause handler from firing
                        seekReloadInProgressRef.current = true;
                        
                        // Reload the audio source, then seek after load
                        howlerEngine.reload();
                        
                        const onLoad = () => {
                            howlerEngine.off("load", onLoad);
                            seekReloadListenerRef.current = null;
                            seekReloadInProgressRef.current = false;
                            
                            howlerEngine.seek(time);
                            setCurrentTime(time);
                            
                            // Resume playback if it was playing before the seek started
                            if (wasPlayingAtSeekStart) {
                                howlerEngine.play();
                                setIsPlaying(true);
                            }
                        };
                        
                        seekReloadListenerRef.current = onLoad;
                        howlerEngine.on("load", onLoad);
                        return;
                    }
                } catch (e) {
                    // If we can't check cache status, proceed with seek verification
                    console.warn("[HowlerAudioElement] Could not check cache status:", e);
                }

                // File is NOT cached - try direct seek and verify it worked
                howlerEngine.seek(time);
                
                seekCheckTimeoutRef.current = setTimeout(() => {
                    try {
                        // Use the ACTUAL HTML5 audio position, not Howler's reported position
                        // Howler.js reports the seek target even if the range request failed
                        const actualPos = howlerEngine.getActualCurrentTime();

                        // If seek appears to have failed (actual position is far from target)
                        // This happens when: seek to 7000s but actual audio is at 0-30s
                        const seekFailed = time > 30 && actualPos < 30;
                        podcastDebugLog("seek check", {
                            time,
                            actualPos,
                            seekFailed,
                            podcastId,
                            episodeId,
                        });

                        if (seekFailed) {
                            // Pause playback while we wait for cache
                            howlerEngine.pause();

                            // Enter buffering mode
                            setIsBuffering(true);
                            setTargetSeekPosition(time);
                            setIsPlaying(false);

                            // Start polling for cache
                            startCachePolling(podcastId, episodeId, time);
                        }
                    } catch (e) {
                        console.error(
                            "[HowlerAudioElement] Seek check error:",
                            e
                        );
                    }
                }, 1000); // Increased from 500ms to 1000ms for streaming seeks
                return;
            }
            
            // For non-podcast types (tracks, audiobooks), use direct seek
            howlerEngine.seek(time);
        };

        const unsubscribe = audioSeekEmitter.subscribe(handleSeek);
        return unsubscribe;
    }, [setCurrentTime, playbackType, currentPodcast, setIsBuffering, setTargetSeekPosition, setIsPlaying, startCachePolling]);

    // Cleanup cache polling, seek timeout, and seek-reload listener on unmount
    useEffect(() => {
        return () => {
            if (cachePollingRef.current) {
                clearInterval(cachePollingRef.current);
            }
            if (seekCheckTimeoutRef.current) {
                clearTimeout(seekCheckTimeoutRef.current);
            }
            if (seekReloadListenerRef.current) {
                howlerEngine.off("load", seekReloadListenerRef.current);
                seekReloadListenerRef.current = null;
            }
        };
    }, []);

    // Periodic progress saving for audiobooks and podcasts
    useEffect(() => {
        if (playbackType !== "audiobook" && playbackType !== "podcast") {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
                progressSaveIntervalRef.current = null;
            }
            return;
        }

        // Save immediately when paused
        if (!isPlaying) {
            if (playbackType === "audiobook") {
                saveAudiobookProgress();
            } else if (playbackType === "podcast") {
                savePodcastProgress();
            }
        }

        // Set up interval when playing
        if (isPlaying) {
            progressSaveIntervalRef.current = setInterval(() => {
                if (playbackType === "audiobook") {
                    saveAudiobookProgress();
                } else if (playbackType === "podcast") {
                    savePodcastProgress();
                }
            }, 30000); // Save every 30 seconds
        }

        return () => {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
                progressSaveIntervalRef.current = null;
            }
        };
    }, [playbackType, isPlaying, saveAudiobookProgress, savePodcastProgress]);

    // Native media controls setup callback
    const updateNativeMediaControls = useCallback(async () => {
        console.log("[NativeAudio] updateNativeMediaControls called", {
            isNative: isNative.current,
            hasPlugin: !!CapacitorMusicControls,
            hasTrack: !!(currentTrack || currentAudiobook || currentPodcast),
        });
        
        if (!isNative.current || !CapacitorMusicControls) {
            console.log("[NativeAudio] Skipping media controls - not native or plugin not loaded");
            return;
        }

        const title =
            currentTrack?.title ||
            currentAudiobook?.title ||
            currentPodcast?.title ||
            "Unknown";
        const artist =
            currentTrack?.artist?.name ||
            currentAudiobook?.author ||
            currentPodcast?.podcastTitle ||
            "";
        const album = currentTrack?.album?.title || "";
        
        // Build full cover URL - the plugin needs a complete HTTP URL, not just an ID
        const coverUrl = currentTrack?.album?.coverArt
            ? api.getCoverArtUrl(currentTrack.album.coverArt, 256)
            : currentAudiobook?.coverUrl
              ? api.getCoverArtUrl(currentAudiobook.coverUrl, 256)
              : currentPodcast?.coverUrl
                ? api.getCoverArtUrl(currentPodcast.coverUrl, 256)
                : "";

        try {
            console.log("[NativeAudio] Creating/updating media notification", {
                title,
                artist,
                album,
                hasCover: Boolean(coverUrl),
                isPlaying,
            });
            await CapacitorMusicControls.create({
                track: title,
                artist: artist,
                album: album,
                cover: coverUrl,
                hasPrev: true,
                hasNext: true,
                hasClose: true,
                playIcon: "media_play",
                pauseIcon: "media_pause",
                prevIcon: "media_prev",
                nextIcon: "media_next",
                closeIcon: "media_close",
                // Must match an existing Android drawable resource name.
                // This project already ships `ic_stat_icon.png` in res/drawable-*dpi.
                notificationIcon: "ic_stat_icon",
                isPlaying: isPlaying,
            });

            // Mark that create() has completed - safe to call updateIsPlaying now
            mediaControlsCreated.current = true;

            // Set up control event listeners (only once)
            if (!mediaControlsInitialized.current) {
                mediaControlsInitialized.current = true;

                CapacitorMusicControls.addListener(
                    "controlsNotification",
                    (action: any) => {
                        switch (action.message) {
                            case "music-controls-play":
                                resume();
                                break;
                            case "music-controls-pause":
                                pause();
                                break;
                            case "music-controls-next":
                                next();
                                break;
                            case "music-controls-previous":
                                previous();
                                break;
                            case "music-controls-destroy":
                                pause();
                                break;
                        }
                    }
                );
            }
        } catch (err) {
            console.error(
                "[HowlerAudioElement] Failed to update media controls:",
                err
            );
        }
    }, [
        currentTrack,
        currentAudiobook,
        currentPodcast,
        isPlaying,
        pause,
        resume,
        next,
        previous,
    ]);

    // Update native media controls when track changes
    useEffect(() => {
        updateNativeMediaControls();
    }, [updateNativeMediaControls]);

    // On Android 13+, request POST_NOTIFICATIONS permission (via LocalNotifications) on first user-initiated playback.
    // We trigger this on playback start (not at app boot) to avoid early-start permission hangs on some devices.
    useEffect(() => {
        if (!isNative.current) return;
        if (!isPlaying) return;
        if (notificationsPermissionRequestedRef.current) return;

        notificationsPermissionRequestedRef.current = true;

        (async () => {
            try {
                const { LocalNotifications } = await import(
                    "@capacitor/local-notifications"
                );
                const checked = await LocalNotifications.checkPermissions();
                // eslint-disable-next-line no-console
                console.log(
                    "[NativeAudio] LocalNotifications checkPermissions:",
                    checked
                );
                const display = (checked as any)?.display;
                if (display !== "granted") {
                    // eslint-disable-next-line no-console
                    console.log(
                        "[NativeAudio] Requesting LocalNotifications permissions (Android 13+)..."
                    );
                    const status = await LocalNotifications.requestPermissions();
                    // eslint-disable-next-line no-console
                    console.log(
                        "[NativeAudio] LocalNotifications requestPermissions result:",
                        status
                    );
                }
            } catch (e) {
                console.warn(
                    "[NativeAudio] LocalNotifications permission request failed:",
                    e
                );
            }
        })();
    }, [isPlaying]);

    // Ensure the native media notification exists while playing (not just on track change).
    useEffect(() => {
        if (!isNative.current) return;
        if (!isPlaying) return;
        updateNativeMediaControls();
    }, [isPlaying, updateNativeMediaControls]);

    // Background playback watchdog - detects and recovers from stream interruptions
    useEffect(() => {
        if (!isNative.current) return;

        // Start watchdog when we expect playback
        if (expectedPlayingRef.current && (currentTrack || currentPodcast || currentAudiobook)) {
            // Clear existing watchdog
            if (watchdogIntervalRef.current) {
                clearInterval(watchdogIntervalRef.current);
            }

            watchdogIntervalRef.current = setInterval(() => {
                const currentTime = howlerEngine.getCurrentTime();
                const engineState = howlerEngine.getState();
                
                // Update last known position if playback is progressing
                if (currentTime > lastKnownPositionRef.current) {
                    lastKnownPositionRef.current = currentTime;
                    lastPlaybackCheckRef.current = Date.now();
                    reconnectAttemptsRef.current = 0; // Reset on successful playback
                }
                
                // Detect stalled playback: we expect playing but position hasn't changed
                const timeSinceLastProgress = Date.now() - lastPlaybackCheckRef.current;
                const isStalled = expectedPlayingRef.current && 
                                  !engineState.isPlaying && 
                                  timeSinceLastProgress > 5000; // 5 seconds with no progress
                
                if (isStalled && reconnectAttemptsRef.current < maxReconnectAttempts) {
                    console.log(`[NativeAudio] Playback stalled, attempting reconnection (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
                    console.log(`[NativeAudio] Last position: ${lastKnownPositionRef.current}s`);
                    
                    reconnectAttemptsRef.current++;
                    
                    // Try to resume playback from last known position
                    const position = lastKnownPositionRef.current;
                    
                    // Get the current source URL
                    const state = howlerEngine.getState();
                    if (state.currentSrc) {
                        // Reload and seek to position
                        setTimeout(() => {
                            howlerEngine.load(state.currentSrc!, true);
                            // Seek after a short delay to let it load
                            setTimeout(() => {
                                if (position > 0) {
                                    howlerEngine.seek(position);
                                }
                            }, 1000);
                        }, 500 * reconnectAttemptsRef.current); // Exponential backoff
                    }
                    
                    lastPlaybackCheckRef.current = Date.now(); // Reset timer
                }
            }, 3000); // Check every 3 seconds

            return () => {
                if (watchdogIntervalRef.current) {
                    clearInterval(watchdogIntervalRef.current);
                    watchdogIntervalRef.current = null;
                }
            };
        } else {
            // Stop watchdog when not expecting playback
            if (watchdogIntervalRef.current) {
                clearInterval(watchdogIntervalRef.current);
                watchdogIntervalRef.current = null;
            }
        }
    }, [currentTrack, currentPodcast, currentAudiobook]);

    // Track expected playback state
    useEffect(() => {
        expectedPlayingRef.current = isPlaying;
        if (isPlaying) {
            lastPlaybackCheckRef.current = Date.now();
        }
    }, [isPlaying]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Stop audio playback and free resources
            howlerEngine.stop();

            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
            }
            
            if (watchdogIntervalRef.current) {
                clearInterval(watchdogIntervalRef.current);
            }

            if (isNative.current && KeepAwake) {
                KeepAwake.allowSleep().catch(() => {});
            }

            if (isNative.current && CapacitorMusicControls) {
                mediaControlsCreated.current = false;
                CapacitorMusicControls.destroy().catch(() => {});
            }
        };
    }, []);

    // This component doesn't render anything visible
    // Howler.js manages audio internally
    return null;
});
