"use client";

import {
    createContext,
    useContext,
    useCallback,
    useRef,
    useEffect,
    ReactNode,
    useMemo,
} from "react";
import {
    useAudioState,
    Track,
    Audiobook,
    Podcast,
    PlayerMode,
} from "./audio-state-context";
import { useAudioPlayback } from "./audio-playback-context";
import { preloadImages } from "@/utils/imageCache";
import { api } from "@/lib/api";
import { audioSeekEmitter } from "./audio-seek-emitter";

function queueDebugEnabled(): boolean {
    try {
        return (
            typeof window !== "undefined" &&
            window.localStorage?.getItem("lidifyQueueDebug") === "1"
        );
    } catch {
        return false;
    }
}

function queueDebugLog(message: string, data?: Record<string, unknown>) {
    if (!queueDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log(`[QueueDebug] ${message}`, data || {});
}

interface AudioControlsContextType {
    // Track methods
    playTrack: (track: Track) => void;
    playTracks: (tracks: Track[], startIndex?: number) => void;

    // Audiobook methods
    playAudiobook: (audiobook: Audiobook) => void;

    // Podcast methods
    playPodcast: (podcast: Podcast) => void;

    // Playback controls
    pause: () => void;
    resume: () => void;
    play: () => void;
    next: () => void;
    previous: () => void;

    // Queue controls
    addToQueue: (track: Track) => void;
    removeFromQueue: (index: number) => void;
    clearQueue: () => void;

    // Playback modes
    toggleShuffle: () => void;
    toggleRepeat: () => void;

    // Time controls
    updateCurrentTime: (time: number) => void;
    seek: (time: number) => void;
    skipForward: (seconds?: number) => void;
    skipBackward: (seconds?: number) => void;

    // Player mode controls
    setPlayerMode: (mode: PlayerMode) => void;
    returnToPreviousMode: () => void;

    // Volume controls
    setVolume: (volume: number) => void;
    toggleMute: () => void;
}

const AudioControlsContext = createContext<
    AudioControlsContextType | undefined
>(undefined);

export function AudioControlsProvider({ children }: { children: ReactNode }) {
    const state = useAudioState();
    const playback = useAudioPlayback();
    const upNextInsertRef = useRef<number>(0);
    const shuffleInsertPosRef = useRef<number>(0);
    const lastQueueInsertAtRef = useRef<number | null>(null);
    const lastCursorTrackIndexRef = useRef<number | null>(null);
    const lastCursorIsShuffleRef = useRef<boolean | null>(null);

    // Ref to track repeat-one timeout for cleanup
    const repeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup timeout on unmount
    useEffect(() => {
        queueDebugLog("AudioControlsProvider mounted");
        return () => {
            if (repeatTimeoutRef.current) {
                clearTimeout(repeatTimeoutRef.current);
            }
            queueDebugLog("AudioControlsProvider unmounted");
        };
    }, []);

    // Keep a stable "Up Next" insertion cursor like Spotify:
    // - When the current track changes, reset to "right after current"
    // - Each addToQueue inserts at the cursor and advances it
    useEffect(() => {
        if (state.playbackType !== "track") {
            upNextInsertRef.current = 0;
            shuffleInsertPosRef.current = 0;
            lastCursorTrackIndexRef.current = null;
            lastCursorIsShuffleRef.current = null;
            return;
        }
        const prevIdx = lastCursorTrackIndexRef.current;
        const prevShuffle = lastCursorIsShuffleRef.current;
        const trackChanged = prevIdx !== state.currentIndex;
        const shuffleToggled = prevShuffle !== state.isShuffle;

        // Up-next cursor should never move backwards unless track changes / shuffle toggles
        const baseUpNext = state.currentIndex + 1;
        upNextInsertRef.current =
            trackChanged || shuffleToggled
                ? baseUpNext
                : Math.max(upNextInsertRef.current, baseUpNext);

        if (state.isShuffle) {
            const currentShufflePos = state.shuffleIndices.indexOf(
                state.currentIndex
            );
            const baseShufflePos =
                currentShufflePos >= 0 ? currentShufflePos + 1 : 0;
            // Do NOT reset to base on every shuffleIndices update; only move forward.
            shuffleInsertPosRef.current =
                trackChanged || shuffleToggled
                    ? baseShufflePos
                    : Math.max(shuffleInsertPosRef.current, baseShufflePos);
        } else {
            shuffleInsertPosRef.current = 0;
        }

        lastCursorTrackIndexRef.current = state.currentIndex;
        lastCursorIsShuffleRef.current = state.isShuffle;
        queueDebugLog("Cursor updated", {
            currentIndex: state.currentIndex,
            isShuffle: state.isShuffle,
            upNextCursor: upNextInsertRef.current,
            shuffleCursor: shuffleInsertPosRef.current,
            shuffleIndicesLen: state.shuffleIndices?.length || 0,
            queueLen: state.queue?.length || 0,
        });
    }, [
        state.currentIndex,
        state.playbackType,
        state.isShuffle,
        state.shuffleIndices,
        state.queue.length,
    ]);

    // Generate shuffled indices
    const generateShuffleIndices = useCallback(
        (length: number, currentIdx: number) => {
            const indices = Array.from({ length }, (_, i) => i).filter(
                (i) => i !== currentIdx
            );
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            return [currentIdx, ...indices];
        },
        []
    );

    const playTrack = useCallback(
        (track: Track) => {
            state.setPlaybackType("track");
            state.setCurrentTrack(track);
            state.setCurrentAudiobook(null);
            state.setCurrentPodcast(null);
            state.setQueue([track]);
            state.setCurrentIndex(0);
            playback.setIsPlaying(true);
            playback.setCurrentTime(0);
            state.setShuffleIndices([0]);
            state.setRepeatOneCount(0);
        },
        [state, playback]
    );

    const playTracks = useCallback(
        (tracks: Track[], startIndex = 0) => {
            if (tracks.length === 0) {
                return;
            }
            queueDebugLog("playTracks()", {
                tracksLen: tracks.length,
                startIndex,
                firstTrackId: tracks[0]?.id,
                startTrackId: tracks[startIndex]?.id,
            });

            state.setPlaybackType("track");
            state.setCurrentAudiobook(null);
            state.setCurrentPodcast(null);
            state.setQueue(tracks);
            state.setCurrentIndex(startIndex);
            state.setCurrentTrack(tracks[startIndex]);
            playback.setIsPlaying(true);
            playback.setCurrentTime(0);
            state.setRepeatOneCount(0);
            state.setShuffleIndices(
                generateShuffleIndices(tracks.length, startIndex)
            );

            // Preload cover art
            const coverUrls = tracks
                .map((t) =>
                    t.album?.coverArt
                        ? api.getCoverArtUrl(t.album.coverArt, 100)
                        : null
                )
                .filter(Boolean) as string[];
            preloadImages(coverUrls).catch(() => {});
        },
        [state, playback, generateShuffleIndices]
    );

    const playAudiobook = useCallback(
        (audiobook: Audiobook) => {
            state.setPlaybackType("audiobook");
            state.setCurrentAudiobook(audiobook);
            state.setCurrentTrack(null);
            state.setCurrentPodcast(null);
            state.setQueue([]);
            state.setCurrentIndex(0);
            playback.setIsPlaying(true);
            state.setShuffleIndices([]);

            if (audiobook.progress?.currentTime) {
                playback.setCurrentTime(audiobook.progress.currentTime);
            } else {
                playback.setCurrentTime(0);
            }
        },
        [state, playback]
    );

    const playPodcast = useCallback(
        (podcast: Podcast) => {
            state.setPlaybackType("podcast");
            state.setCurrentPodcast(podcast);
            state.setCurrentTrack(null);
            state.setCurrentAudiobook(null);
            state.setQueue([]);
            state.setCurrentIndex(0);
            playback.setIsPlaying(true);
            state.setShuffleIndices([]);

            if (podcast.progress?.currentTime) {
                playback.setCurrentTime(podcast.progress.currentTime);
            } else {
                playback.setCurrentTime(0);
            }
        },
        [state, playback]
    );

    const pause = useCallback(() => {
        playback.setIsPlaying(false);
    }, [playback]);

    const resume = useCallback(() => {
        playback.setIsPlaying(true);
    }, [playback]);

    const play = useCallback(() => {
        playback.setIsPlaying(true);
    }, [playback]);

    const next = useCallback(() => {
        if (state.queue.length === 0) return;

        // Handle repeat one
        if (state.repeatMode === "one" && state.repeatOneCount === 0) {
            state.setRepeatOneCount(1);
            playback.setCurrentTime(0);
            playback.setIsPlaying(false);
            // Clear any existing timeout before setting a new one
            if (repeatTimeoutRef.current) {
                clearTimeout(repeatTimeoutRef.current);
            }
            // Short delay for audio element state synchronization
            repeatTimeoutRef.current = setTimeout(
                () => playback.setIsPlaying(true),
                10
            );
            return;
        }

        state.setRepeatOneCount(0);

        let nextIndex: number;
        if (state.isShuffle) {
            const currentShufflePos = state.shuffleIndices.indexOf(
                state.currentIndex
            );
            queueDebugLog("next() shuffle", {
                currentIndex: state.currentIndex,
                currentShufflePos,
                shuffleIndicesLen: state.shuffleIndices.length,
            });
            if (currentShufflePos < state.shuffleIndices.length - 1) {
                nextIndex = state.shuffleIndices[currentShufflePos + 1];
            } else {
                if (state.repeatMode === "all") {
                    nextIndex = state.shuffleIndices[0];
                } else {
                    return;
                }
            }
        } else {
            if (state.currentIndex < state.queue.length - 1) {
                nextIndex = state.currentIndex + 1;
            } else {
                if (state.repeatMode === "all") {
                    nextIndex = 0;
                } else {
                    return;
                }
            }
        }

        queueDebugLog("next() chosen", {
            isShuffle: state.isShuffle,
            nextIndex,
            nextTrackId: state.queue[nextIndex]?.id,
            queueLen: state.queue.length,
        });
        state.setCurrentIndex(nextIndex);
        state.setCurrentTrack(state.queue[nextIndex]);
        playback.setCurrentTime(0);
        playback.setIsPlaying(true);
    }, [state, playback]);

    const previous = useCallback(() => {
        if (state.queue.length === 0) return;

        state.setRepeatOneCount(0);

        let prevIndex: number;
        if (state.isShuffle) {
            const currentShufflePos = state.shuffleIndices.indexOf(
                state.currentIndex
            );
            if (currentShufflePos > 0) {
                prevIndex = state.shuffleIndices[currentShufflePos - 1];
            } else {
                return;
            }
        } else {
            if (state.currentIndex > 0) {
                prevIndex = state.currentIndex - 1;
            } else {
                return;
            }
        }

        state.setCurrentIndex(prevIndex);
        state.setCurrentTrack(state.queue[prevIndex]);
        playback.setCurrentTime(0);
        playback.setIsPlaying(true);
    }, [state, playback]);

    const addToQueue = useCallback(
        (track: Track) => {
            queueDebugLog("addToQueue() entry", {
                trackId: track?.id,
                queueLen: state.queue.length,
                currentIndex: state.currentIndex,
                playbackType: state.playbackType,
                isShuffle: state.isShuffle,
                upNextCursor: upNextInsertRef.current,
                shuffleCursor: shuffleInsertPosRef.current,
            });
            // If no tracks are playing (empty queue or non-track playback), start fresh
            if (state.queue.length === 0 || state.playbackType !== "track") {
                state.setPlaybackType("track");
                state.setQueue([track]);
                state.setCurrentIndex(0);
                state.setCurrentTrack(track);
                state.setCurrentAudiobook(null);
                state.setCurrentPodcast(null);
                playback.setIsPlaying(true);
                playback.setCurrentTime(0);
                state.setShuffleIndices([0]);
                queueDebugLog("addToQueue() started fresh queue", {
                    trackId: track?.id,
                });
                return;
            }

            // Spotify-style: "Add to queue" should add to the Up Next list.
            // Maintain a cursor so multiple adds preserve order and don't all land in the same slot.
            const playingIdx = state.currentIndex;
            const plannedInsertAt = upNextInsertRef.current;

            state.setQueue((prevQueue) => {
                const insertAt = Math.min(
                    Math.max(0, plannedInsertAt),
                    prevQueue.length
                );
                // Keep existing log payload shape: it expects insertAt === currentIdx + 1.
                const currentIdx = insertAt - 1;
                const newQueue = [...prevQueue];
                newQueue.splice(insertAt, 0, track);
                upNextInsertRef.current = insertAt + 1;
                lastQueueInsertAtRef.current = insertAt;
                queueDebugLog("addToQueue() applied", {
                    plannedInsertAt,
                    insertAt,
                    playingIdx,
                    prevLen: prevQueue.length,
                    newLen: newQueue.length,
                    insertedTrackId: track?.id,
                    nextUpSliceIds: newQueue
                        .slice(state.currentIndex + 1, state.currentIndex + 6)
                        .map((t) => t?.id),
                });

                return newQueue;
            });

            // Update shuffle indices if shuffle is on - use functional update
            if (state.isShuffle) {
                state.setShuffleIndices((prevIndices) => {
                    if (prevIndices.length === 0) return prevIndices;
                    // Shuffle mode: still support "Up Next" by inserting into the shuffle order
                    // right after the current shuffle position, preserving add order.
                    // We cannot perfectly know the queue insertAt here without atomically coupling
                    // queue+shuffle state; we approximate using the planned insert index and adjust.
                    const insertAtCandidate =
                        lastQueueInsertAtRef.current ?? plannedInsertAt;
                    const insertAt = Math.min(
                        Math.max(0, insertAtCandidate),
                        state.queue.length
                    );
                    const shifted = prevIndices.map((i) =>
                        i >= insertAt ? i + 1 : i
                    );
                    const currentShufflePos = shifted.indexOf(playingIdx);
                    const baseInsertPos =
                        currentShufflePos >= 0 ? currentShufflePos + 1 : 0;
                    const insertPos = Math.min(
                        Math.max(baseInsertPos, shuffleInsertPosRef.current),
                        shifted.length
                    );
                    const newIndices = [...shifted];
                    newIndices.splice(insertPos, 0, insertAt);
                    shuffleInsertPosRef.current = insertPos + 1;
                    const newIndex = insertAt;
                    const currentIdx = playingIdx;
                    queueDebugLog("addToQueue() shuffleIndices updated", {
                        currentIdx,
                        insertAt,
                        insertPos,
                        prevIndicesLen: prevIndices.length,
                        newIndicesLen: newIndices.length,
                        nextShuffleSlice: newIndices.slice(
                            Math.max(0, insertPos - 2),
                            insertPos + 3
                        ),
                    });

                    return newIndices;
                });
            }
        },
        [state, playback]
    );

    const removeFromQueue = useCallback(
        (index: number) => {
            state.setQueue((prev) => {
                const newQueue = [...prev];
                newQueue.splice(index, 1);

                if (index < state.currentIndex) {
                    state.setCurrentIndex((prevIndex) => prevIndex - 1);
                } else if (
                    index === state.currentIndex &&
                    index === newQueue.length
                ) {
                    state.setCurrentIndex(0);
                    if (newQueue.length > 0) {
                        state.setCurrentTrack(newQueue[0]);
                    } else {
                        state.setCurrentTrack(null);
                        playback.setIsPlaying(false);
                    }
                }

                return newQueue;
            });
        },
        [state, playback]
    );

    const clearQueue = useCallback(() => {
        state.setQueue([]);
        state.setCurrentIndex(0);
        state.setCurrentTrack(null);
        playback.setIsPlaying(false);
        state.setShuffleIndices([]);
    }, [state, playback]);

    const toggleShuffle = useCallback(() => {
        state.setIsShuffle((prev) => {
            const newShuffle = !prev;
            if (newShuffle && state.queue.length > 0) {
                state.setShuffleIndices(
                    generateShuffleIndices(
                        state.queue.length,
                        state.currentIndex
                    )
                );
            }
            return newShuffle;
        });
    }, [state, generateShuffleIndices]);

    const toggleRepeat = useCallback(() => {
        state.setRepeatMode((prev) => {
            if (prev === "off") return "all";
            if (prev === "all") return "one";
            return "off";
        });
        state.setRepeatOneCount(0);
    }, [state]);

    const updateCurrentTime = useCallback(
        (time: number) => {
            playback.setCurrentTime(time);
        },
        [playback]
    );

    const seek = useCallback(
        (time: number) => {
            // Prefer canonical durations for long-form media. If both exist, take the safer minimum.
            const mediaDuration =
                state.playbackType === "podcast"
                    ? state.currentPodcast?.duration || 0
                    : state.playbackType === "audiobook"
                    ? state.currentAudiobook?.duration || 0
                    : state.currentTrack?.duration || 0;
            const maxDuration =
                mediaDuration > 0 && playback.duration > 0
                    ? Math.min(mediaDuration, playback.duration)
                    : mediaDuration || playback.duration || 0;
            const clampedTime =
                maxDuration > 0
                    ? Math.min(Math.max(time, 0), maxDuration)
                    : Math.max(time, 0);

            // Optimistically update local playback time for instant UI feedback
            playback.setCurrentTime(clampedTime);

            // Keep audiobook/podcast progress in sync locally so detail pages reflect scrubs
            if (state.playbackType === "audiobook" && state.currentAudiobook) {
                // IMPORTANT: use functional update to avoid stale-closure overwrites
                // (seeking must never be able to swap the currently-playing audiobook)
                state.setCurrentAudiobook((prev) => {
                    if (!prev) return prev;
                    const duration = prev.duration || 0;
                    const progressPercent =
                        duration > 0 ? (clampedTime / duration) * 100 : 0;
                    return {
                        ...prev,
                        progress: {
                            currentTime: clampedTime,
                            progress: progressPercent,
                            isFinished: false,
                            lastPlayedAt: new Date(),
                        },
                    };
                });
            } else if (
                state.playbackType === "podcast" &&
                state.currentPodcast
            ) {
                // IMPORTANT: use functional update to avoid stale-closure overwrites
                // (seeking must never be able to swap the currently-playing episode)
                state.setCurrentPodcast((prev) => {
                    if (!prev) return prev;
                    const duration = prev.duration || 0;
                    const progressPercent =
                        duration > 0 ? (clampedTime / duration) * 100 : 0;
                    return {
                        ...prev,
                        progress: {
                            currentTime: clampedTime,
                            progress: progressPercent,
                            isFinished: false,
                            lastPlayedAt: new Date(),
                        },
                    };
                });
            }

            audioSeekEmitter.emit(clampedTime);
        },
        [playback, state]
    );

    const skipForward = useCallback(
        (seconds: number = 30) => {
            seek(playback.currentTime + seconds);
        },
        [playback.currentTime, seek]
    );

    const skipBackward = useCallback(
        (seconds: number = 30) => {
            seek(playback.currentTime - seconds);
        },
        [playback.currentTime, seek]
    );

    const setPlayerModeWithHistory = useCallback(
        (mode: PlayerMode) => {
            state.setPreviousPlayerMode(state.playerMode);
            state.setPlayerMode(mode);
        },
        [state]
    );

    const returnToPreviousMode = useCallback(() => {
        const targetMode =
            state.playerMode === "overlay" ? "mini" : state.previousPlayerMode;
        const temp = state.playerMode;
        state.setPlayerMode(targetMode);
        state.setPreviousPlayerMode(temp);
    }, [state]);

    const setVolumeControl = useCallback(
        (newVolume: number) => {
            const clampedVolume = Math.max(0, Math.min(1, newVolume));
            state.setVolume(clampedVolume);
            if (clampedVolume > 0) {
                state.setIsMuted(false);
            }
        },
        [state]
    );

    const toggleMute = useCallback(() => {
        state.setIsMuted((prev) => !prev);
    }, [state]);

    // Memoize the entire context value
    const value = useMemo(
        () => ({
            playTrack,
            playTracks,
            playAudiobook,
            playPodcast,
            pause,
            resume,
            play,
            next,
            previous,
            addToQueue,
            removeFromQueue,
            clearQueue,
            toggleShuffle,
            toggleRepeat,
            updateCurrentTime,
            seek,
            skipForward,
            skipBackward,
            setPlayerMode: setPlayerModeWithHistory,
            returnToPreviousMode,
            setVolume: setVolumeControl,
            toggleMute,
        }),
        [
            playTrack,
            playTracks,
            playAudiobook,
            playPodcast,
            pause,
            resume,
            play,
            next,
            previous,
            addToQueue,
            removeFromQueue,
            clearQueue,
            toggleShuffle,
            toggleRepeat,
            updateCurrentTime,
            seek,
            skipForward,
            skipBackward,
            setPlayerModeWithHistory,
            returnToPreviousMode,
            setVolumeControl,
            toggleMute,
        ]
    );

    return (
        <AudioControlsContext.Provider value={value}>
            {children}
        </AudioControlsContext.Provider>
    );
}

export function useAudioControls() {
    const context = useContext(AudioControlsContext);
    if (!context) {
        throw new Error(
            "useAudioControls must be used within AudioControlsProvider"
        );
    }
    return context;
}
