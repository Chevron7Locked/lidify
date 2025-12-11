"use client";

import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { api } from "@/lib/api";
import { howlerEngine } from "@/lib/howler-engine";
import { audioSeekEmitter } from "@/lib/audio-seek-emitter";
import { isNativePlatform } from "@/lib/platform";
import { useEffect, useRef, memo, useCallback } from "react";

// Capacitor imports for native platform
let KeepAwake: any = null;
let CapacitorMusicControls: any = null;
let BackgroundMode: any = null;

// Dynamic import for Capacitor plugins (only on native)
if (typeof window !== "undefined") {
    import("@capacitor-community/keep-awake")
        .then((m) => {
            KeepAwake = m.KeepAwake;
            console.log("[NativeAudio] KeepAwake plugin loaded");
        })
        .catch((err) => {
            console.warn("[NativeAudio] KeepAwake plugin not available:", err);
        });

    import("capacitor-music-controls-plugin")
        .then((m) => {
            CapacitorMusicControls = m.CapacitorMusicControls;
            console.log("[NativeAudio] MusicControls plugin loaded");
        })
        .catch((err) => {
            console.warn("[NativeAudio] MusicControls plugin not available:", err);
        });

    import("@anuradev/capacitor-background-mode")
        .then((m) => {
            BackgroundMode = m.BackgroundMode;
            console.log("[NativeAudio] BackgroundMode plugin loaded");
            // Enable background mode for audio playback
            BackgroundMode.enable()
                .then(() => console.log("[NativeAudio] BackgroundMode enabled successfully"))
                .catch((err: any) => console.warn("[NativeAudio] BackgroundMode enable failed:", err));
            // Disable battery optimizations prompt
            BackgroundMode.disableBatteryOptimizations()
                .then(() => console.log("[NativeAudio] Battery optimizations disabled"))
                .catch((err: any) => console.warn("[NativeAudio] Battery optimization disable failed:", err));
        })
        .catch((err) => {
            console.warn("[NativeAudio] BackgroundMode plugin not available:", err);
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
        setCanSeek,
        setDownloadProgress,
    } = useAudioPlayback();

    // Controls context
    const { pause, next, previous, resume } = useAudioControls();

    // Refs
    const lastTrackIdRef = useRef<string | null>(null);
    const lastPlayingStateRef = useRef<boolean>(false);
    const progressSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastProgressSaveRef = useRef<number>(0);
    const mediaControlsInitialized = useRef<boolean>(false);
    const mediaControlsCreated = useRef<boolean>(false); // Track if create() has been called
    const isNative = useRef<boolean>(false);
    const isUserInitiatedRef = useRef<boolean>(false); // Track if play/pause was user-initiated
    const isLoadingRef = useRef<boolean>(false); // Prevent duplicate loads
    const loadIdRef = useRef<number>(0); // Unique ID for each load to prevent race conditions
    const cachePollingRef = useRef<NodeJS.Timeout | null>(null); // Polling for podcast cache
    const seekCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Seek detection timeout
    const cacheStatusPollingRef = useRef<NodeJS.Timeout | null>(null); // Polling cache status for canSeek
    
    // Background playback recovery refs
    const expectedPlayingRef = useRef<boolean>(false); // What we EXPECT the playback state to be
    const lastKnownPositionRef = useRef<number>(0); // Last known good position for recovery
    const reconnectAttemptsRef = useRef<number>(0); // Track reconnection attempts
    const maxReconnectAttempts = 5; // Max reconnection attempts
    const watchdogIntervalRef = useRef<NodeJS.Timeout | null>(null); // Watchdog for detecting playback interruptions
    const lastPlaybackCheckRef = useRef<number>(0); // Last time we checked playback position

    // Check if native platform on mount
    useEffect(() => {
        isNative.current = isNativePlatform();
    }, []);

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
            return; // Already loaded this track
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
        }

        if (streamUrl) {
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

                // Auto-play if isPlaying was true when we started loading
                // We read the current state, not the closure value
                if (lastPlayingStateRef.current) {
                    howlerEngine.play();
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
    useEffect(() => {
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

                    if (status.cached) {
                        // Cache is ready! Clear polling and reload
                        if (cachePollingRef.current) {
                            clearInterval(cachePollingRef.current);
                            cachePollingRef.current = null;
                        }

                        // Reload the audio (it will now stream from cache)
                        howlerEngine.reload();

                        // Wait for load, then seek and play
                        const onLoad = () => {
                            howlerEngine.off("load", onLoad);

                            howlerEngine.seek(targetTime);
                            setCurrentTime(targetTime);
                            howlerEngine.play();

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
            // Update UI immediately to show target position
            setCurrentTime(time);

            // Perform the seek
            howlerEngine.seek(time);

            // For podcasts, verify seek worked and handle caching if needed
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

                    // If cached, the seek should work - browser will request the range
                    // Give it more time to load (2 seconds for large seeks)
                    if (status.cached) {
                        // For cached files, don't enter buffering mode
                        // Just trust that the seek will work eventually
                        return;
                    }
                } catch (e) {
                    // If we can't check cache status, proceed with seek verification
                    console.warn("[HowlerAudioElement] Could not check cache status:", e);
                }

                // File is NOT cached - check if seek actually worked after a delay
                seekCheckTimeoutRef.current = setTimeout(() => {
                    try {
                        // Use the ACTUAL HTML5 audio position, not Howler's reported position
                        // Howler.js reports the seek target even if the range request failed
                        const actualPos = howlerEngine.getActualCurrentTime();

                        // If seek appears to have failed (actual position is far from target)
                        // This happens when: seek to 7000s but actual audio is at 0-30s
                        const seekFailed = time > 30 && actualPos < 30;

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
            }
        };

        const unsubscribe = audioSeekEmitter.subscribe(handleSeek);
        return unsubscribe;
    }, [setCurrentTime, playbackType, currentPodcast, setIsBuffering, setTargetSeekPosition, setIsPlaying, startCachePolling]);

    // Cleanup cache polling and seek timeout on unmount
    useEffect(() => {
        return () => {
            if (cachePollingRef.current) {
                clearInterval(cachePollingRef.current);
            }
            if (seekCheckTimeoutRef.current) {
                clearTimeout(seekCheckTimeoutRef.current);
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
        if (!isNative.current || !CapacitorMusicControls) return;

        const title =
            currentTrack?.title ||
            currentAudiobook?.title ||
            currentPodcast?.title ||
            "Unknown";
        const artist =
            currentTrack?.artist ||
            currentAudiobook?.author ||
            currentPodcast?.podcastTitle ||
            "";
        const album = currentTrack?.album || "";
        const cover =
            currentTrack?.coverArt ||
            currentAudiobook?.coverUrl ||
            currentPodcast?.coverUrl ||
            "";

        try {
            await CapacitorMusicControls.create({
                track: title,
                artist: artist,
                album: album,
                cover: cover,
                hasPrev: true,
                hasNext: true,
                hasClose: true,
                playIcon: "media_play",
                pauseIcon: "media_pause",
                prevIcon: "media_prev",
                nextIcon: "media_next",
                closeIcon: "media_close",
                notificationIcon: "notification_icon",
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

    // Enable/disable background mode based on playback state
    useEffect(() => {
        if (!isNative.current || !BackgroundMode) return;
        
        if (isPlaying) {
            BackgroundMode.enable()
                .then(() => console.log("[NativeAudio] BackgroundMode enabled for playback"))
                .catch(() => {});
        } else {
            // Keep enabled briefly after pause to allow resume
            const timeout = setTimeout(() => {
                if (!isPlaying && !expectedPlayingRef.current) {
                    BackgroundMode.disable()
                        .then(() => console.log("[NativeAudio] BackgroundMode disabled after timeout"))
                        .catch(() => {});
                }
            }, 60000); // Keep enabled for 60 seconds after pause (increased from 30)
            return () => clearTimeout(timeout);
        }
    }, [isPlaying]);

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
                    
                    // Re-enable background mode
                    if (BackgroundMode) {
                        BackgroundMode.enable().catch(() => {});
                    }
                    
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

            if (isNative.current && BackgroundMode) {
                BackgroundMode.disable().catch(() => {});
            }
        };
    }, []);

    // This component doesn't render anything visible
    // Howler.js manages audio internally
    return null;
});
