import { useEffect, useCallback, useRef } from "react";
import { useAudioState, Track } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { audioEngine, detectAudioFormat } from "@/lib/audio-engine";
import { api } from "@/lib/api";

const ARTWORK_SIZES = ["96x96", "128x128", "192x192", "256x256", "384x384", "512x512"] as const;

function buildArtwork(coverUrl: string | undefined): MediaImage[] | undefined {
    if (!coverUrl) return undefined;
    return ARTWORK_SIZES.map((sizes) => ({ src: coverUrl, sizes, type: "image/jpeg" }));
}

// --- Pure helpers for next/prev computation (no React dependency) ---

function computeNextIndex(
    queue: Track[], currentIdx: number,
    isShuffle: boolean, shuffleIndices: number[],
    repeatMode: "off" | "one" | "all"
): number | null {
    if (queue.length === 0) return null;
    if (isShuffle) {
        const pos = shuffleIndices.indexOf(currentIdx);
        if (pos < shuffleIndices.length - 1) return shuffleIndices[pos + 1];
        return repeatMode === "all" ? shuffleIndices[0] : null;
    }
    if (currentIdx < queue.length - 1) return currentIdx + 1;
    return repeatMode === "all" ? 0 : null;
}

function computePrevIndex(
    queue: Track[], currentIdx: number,
    isShuffle: boolean, shuffleIndices: number[]
): number | null {
    if (queue.length === 0) return null;
    if (isShuffle) {
        const pos = shuffleIndices.indexOf(currentIdx);
        return pos > 0 ? shuffleIndices[pos - 1] : null;
    }
    return currentIdx > 0 ? currentIdx - 1 : null;
}

/**
 * Media Session API integration for OS-level media controls
 * (lock screen, media keys, now playing, seek controls)
 *
 * CRITICAL: Handler effect deps must be minimal. The playback context
 * changes identity on every currentTime update (4x/sec). If pause/resume/seek
 * are in the handler effect deps, MediaSession handlers re-register 4x/sec,
 * which breaks MediaSession handlers (lock screen, media keys stop responding).
 *
 * Solution: ALL values and functions accessed inside handlers go through refs.
 * Handler effect depends only on [playbackType] for seek/track button switching.
 */
export function useMediaSession() {
    const state = useAudioState();
    const playback = useAudioPlayback();
    const controls = useAudioControls();

    const {
        currentTrack,
        currentAudiobook,
        currentPodcast,
        playbackType,
        queue,
        currentIndex,
        isShuffle,
        shuffleIndices,
        repeatMode,
    } = state;

    const { isPlaying, currentTime } = playback;
    const { pause, resume, seek } = controls;

    // Track if this device has initiated playback locally
    // Prevents cross-device media session interference from state sync
    const hasPlayedLocallyRef = useRef(false);

    // Deduplicates identical consecutive MediaSession actions — some platforms
    // queue handlers while JS is suspended and fire them all at once on resume.
    const lastActionRef = useRef<string | null>(null);
    const lastActionTimeRef = useRef(0);
    const ACTION_DEBOUNCE_MS = 300;

    // --- Stable refs for ALL values accessed inside handlers ---
    // This prevents handler re-registration when context objects change identity.
    const currentTimeRef = useRef(currentTime);
    const currentTrackRef = useRef(currentTrack);
    const currentAudiobookRef = useRef(currentAudiobook);
    const currentPodcastRef = useRef(currentPodcast);
    const playbackTypeRef = useRef(playbackType);

    // Queue/navigation refs — handlers read these directly so they work
    // even when React is suspended (e.g. background PWA)
    const queueRef = useRef<Track[]>([]);
    const currentIndexRef = useRef(0);
    const isShuffleRef = useRef(false);
    const shuffleIndicesRef = useRef<number[]>([]);
    const repeatModeRef = useRef<"off" | "one" | "all">("off");

    // Control function refs — the playback context changes on every currentTime
    // update, which recreates pause/resume/seek. Accessing them through refs
    // keeps the handler effect stable.
    const pauseRef = useRef(pause);
    const resumeRef = useRef(resume);
    const seekRef = useRef(seek);

    // State/playback setter refs for syncReactState
    const stateRef = useRef(state);
    const playbackRef = useRef(playback);

    useEffect(() => {
        currentTimeRef.current = currentTime;
        currentTrackRef.current = currentTrack;
        currentAudiobookRef.current = currentAudiobook;
        currentPodcastRef.current = currentPodcast;
        playbackTypeRef.current = playbackType;
    }, [currentTime, currentTrack, currentAudiobook, currentPodcast, playbackType]);

    useEffect(() => {
        queueRef.current = queue;
        currentIndexRef.current = currentIndex;
        isShuffleRef.current = isShuffle;
        shuffleIndicesRef.current = shuffleIndices;
        repeatModeRef.current = repeatMode;
    }, [queue, currentIndex, isShuffle, shuffleIndices, repeatMode]);

    useEffect(() => {
        pauseRef.current = pause;
        resumeRef.current = resume;
        seekRef.current = seek;
    }, [pause, resume, seek]);

    useEffect(() => {
        stateRef.current = state;
        playbackRef.current = playback;
    }, [state, playback]);

    // Set flag when playback starts on this device
    useEffect(() => {
        if (isPlaying) {
            hasPlayedLocallyRef.current = true;
        }
    }, [isPlaying]);

    // Reset flag when all media is cleared
    useEffect(() => {
        if (!currentTrack && !currentAudiobook && !currentPodcast) {
            hasPlayedLocallyRef.current = false;
        }
    }, [currentTrack, currentAudiobook, currentPodcast]);

    // Convert relative URLs to absolute (required for MediaSession artwork)
    const getAbsoluteUrl = useCallback((url: string): string => {
        if (!url) return "";
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        return `${window.location.origin}${url}`;
    }, []);

    // Update MediaSession metadata for a track (used by skip handlers)
    const updateTrackMetadata = useCallback((track: Track) => {
        if (!("mediaSession" in navigator)) return;
        const coverUrl = track.album?.coverArt
            ? getAbsoluteUrl(api.getCoverArtUrl(track.album.coverArt, 512))
            : undefined;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist?.name || "Unknown Artist",
            album: track.album?.title || "Unknown Album",
            artwork: buildArtwork(coverUrl),
        });
    }, [getAbsoluteUrl]);

    // Ref for updateTrackMetadata so handler effect doesn't depend on it
    const updateTrackMetadataRef = useRef(updateTrackMetadata);
    useEffect(() => { updateTrackMetadataRef.current = updateTrackMetadata; }, [updateTrackMetadata]);

    // Bridge back to React — used by skip handlers where intent is always
    // "play this new track from the start". Uses refs so it has stable identity.
    const syncReactState = useCallback((track: Track, index: number) => {
        stateRef.current.setCurrentTrack(track);
        stateRef.current.setCurrentIndex(index);
        playbackRef.current.setCurrentTime(0);
        playbackRef.current.setIsPlaying(true);
    }, []);

    // Metadata effect — updates lock screen info when track changes.
    // This CAN depend on frequently-changing values since it only sets metadata,
    // it doesn't register handlers.
    useEffect(() => {
        if (!("mediaSession" in navigator)) return;

        if (!hasPlayedLocallyRef.current) {
            navigator.mediaSession.metadata = null;
            return;
        }

        if (playbackType === "track" && currentTrack) {
            updateTrackMetadata(currentTrack);
        } else if (playbackType === "audiobook" && currentAudiobook) {
            const coverUrl = currentAudiobook.coverUrl
                ? getAbsoluteUrl(api.getCoverArtUrl(currentAudiobook.coverUrl, 512))
                : undefined;

            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentAudiobook.title,
                artist: currentAudiobook.author,
                album: currentAudiobook.narrator
                    ? `Narrated by ${currentAudiobook.narrator}`
                    : "Audiobook",
                artwork: buildArtwork(coverUrl),
            });
        } else if (playbackType === "podcast" && currentPodcast) {
            const coverUrl = currentPodcast.coverUrl
                ? getAbsoluteUrl(api.getCoverArtUrl(currentPodcast.coverUrl, 512))
                : undefined;

            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentPodcast.title,
                artist: currentPodcast.podcastTitle,
                album: "Podcast",
                artwork: buildArtwork(coverUrl),
            });
        } else {
            navigator.mediaSession.metadata = null;
        }

        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }, [
        currentTrack,
        currentAudiobook,
        currentPodcast,
        playbackType,
        isPlaying,
        getAbsoluteUrl,
        updateTrackMetadata,
    ]);

    // --- Handler registration effect ---
    // CRITICAL: Only depends on [playbackType] so handlers register ONCE
    // and only re-register when switching between music/audiobook/podcast
    // (needed for seek vs track button switching on lock screen).
    useEffect(() => {
        if (!("mediaSession" in navigator)) return;

        function debounced(action: string, fn: () => void): void {
            const now = Date.now();
            if (lastActionRef.current === action && now - lastActionTimeRef.current < ACTION_DEBOUNCE_MS) return;
            lastActionRef.current = action;
            lastActionTimeRef.current = now;
            fn();
        }

        // Play/pause — ONLY call audioEngine directly. Do NOT set React
        // state here. When backgrounded, React setState may not trigger effects
        // and causes redundant engine calls when the app resumes.
        // React state is synced via: (1) engine onplay/onpause events →
        // handlePlay/handlePause in AudioElement, and (2) the
        // visibilitychange handler below when the app returns to foreground.
        navigator.mediaSession.setActionHandler("play", () => {
            debounced("play", () => {
                audioEngine.resumeAudioContext(); // fire-and-forget
                audioEngine.forcePlay();
                navigator.mediaSession.playbackState = "playing";
            });
        });

        navigator.mediaSession.setActionHandler("pause", () => {
            debounced("pause", () => {
                audioEngine.pause();
                navigator.mediaSession.playbackState = "paused";
            });
        });

        // Previous track — drives audioEngine directly for background reliability
        navigator.mediaSession.setActionHandler("previoustrack", () => {
            debounced("previoustrack", () => {
                if (playbackTypeRef.current === "track") {
                    const q = queueRef.current;
                    const idx = currentIndexRef.current;
                    const prevIdx = computePrevIndex(
                        q, idx, isShuffleRef.current, shuffleIndicesRef.current
                    );
                    if (prevIdx !== null && q[prevIdx]) {
                        const prevTrack = q[prevIdx];
                        const streamUrl = api.getStreamUrl(prevTrack.id);
                        // Update refs immediately (before the OS suspends JS)
                        currentIndexRef.current = prevIdx;
                        currentTrackRef.current = prevTrack;
                        // load() with autoplay=true handles both preloaded
                        // (synchronous play) and non-preloaded (play on load).
                        // Do NOT call forcePlay() after — it would create a
                        // second Sound instance, causing overlapping audio.
                        audioEngine.load(streamUrl, true, detectAudioFormat(prevTrack.filePath));
                        updateTrackMetadataRef.current(prevTrack);
                        syncReactState(prevTrack, prevIdx);
                    }
                } else {
                    seekRef.current(Math.max(currentTimeRef.current - 30, 0));
                }
            });
        });

        // Next track — drives audioEngine directly for background reliability
        navigator.mediaSession.setActionHandler("nexttrack", () => {
            debounced("nexttrack", () => {
                if (playbackTypeRef.current === "track") {
                    const q = queueRef.current;
                    const idx = currentIndexRef.current;
                    const nextIdx = computeNextIndex(
                        q, idx, isShuffleRef.current,
                        shuffleIndicesRef.current, repeatModeRef.current
                    );
                    if (nextIdx !== null && q[nextIdx]) {
                        const nextTrack = q[nextIdx];
                        const streamUrl = api.getStreamUrl(nextTrack.id);
                        // Update refs immediately (before the OS suspends JS)
                        currentIndexRef.current = nextIdx;
                        currentTrackRef.current = nextTrack;
                        audioEngine.load(streamUrl, true, detectAudioFormat(nextTrack.filePath));
                        updateTrackMetadataRef.current(nextTrack);
                        syncReactState(nextTrack, nextIdx);
                    }
                } else {
                    const duration =
                        currentAudiobookRef.current?.duration ||
                        currentPodcastRef.current?.duration ||
                        0;
                    seekRef.current(Math.min(currentTimeRef.current + 30, duration));
                }
            });
        });

        // Lock screen UIs typically have two button slots flanking play/pause.
        // If seekforward/seekbackward are registered, they take those slots
        // and nexttrack/previoustrack disappear (platform behavior).
        // Switch based on playbackType: music gets track buttons, long-form gets seek.
        const isLongForm = playbackType === "audiobook" || playbackType === "podcast";

        try {
            if (isLongForm) {
                // Audiobooks/podcasts: show seek buttons on lock screen
                navigator.mediaSession.setActionHandler(
                    "seekbackward",
                    (details) => {
                        debounced("seekbackward", () => {
                            const skipTime = details.seekOffset || 10;
                            seekRef.current(Math.max(currentTimeRef.current - skipTime, 0));
                        });
                    }
                );

                navigator.mediaSession.setActionHandler(
                    "seekforward",
                    (details) => {
                        debounced("seekforward", () => {
                            const skipTime = details.seekOffset || 10;
                            const duration =
                                currentAudiobookRef.current?.duration ||
                                currentPodcastRef.current?.duration ||
                                0;
                            seekRef.current(Math.min(currentTimeRef.current + skipTime, duration));
                        });
                    }
                );
            } else {
                // Music tracks: null out seek handlers so lock screen shows track buttons
                navigator.mediaSession.setActionHandler("seekbackward", null);
                navigator.mediaSession.setActionHandler("seekforward", null);
            }

            // seekto is always registered — used by the lock screen scrubber
            navigator.mediaSession.setActionHandler("seekto", (details) => {
                if (details.seekTime !== undefined) {
                    seekRef.current(details.seekTime);
                }
            });
        } catch {
            // Seek actions not supported on this platform
        }

        return () => {
            if ("mediaSession" in navigator) {
                navigator.mediaSession.setActionHandler("play", null);
                navigator.mediaSession.setActionHandler("pause", null);
                navigator.mediaSession.setActionHandler("previoustrack", null);
                navigator.mediaSession.setActionHandler("nexttrack", null);
                try {
                    navigator.mediaSession.setActionHandler("seekbackward", null);
                    navigator.mediaSession.setActionHandler("seekforward", null);
                    navigator.mediaSession.setActionHandler("seekto", null);
                } catch {
                    // Ignore cleanup errors
                }
            }
        };
        // ONLY playbackType — controls seek vs track button switching on lock screen.
        // All other values accessed via refs. syncReactState has stable identity ([] deps).
    }, [playbackType, syncReactState]);

    // Re-sync React state when app returns to foreground.
    // Reads actual engine state — prevents unwanted resume when user
    // paused on lock screen then unlocked the phone.
    useEffect(() => {
        function handleVisibilityChange() {
            if (document.hidden) return;
            const track = currentTrackRef.current;
            const idx = currentIndexRef.current;
            if (track && playbackTypeRef.current === "track") {
                stateRef.current.setCurrentTrack(track);
                stateRef.current.setCurrentIndex(idx);
                playbackRef.current.setCurrentTime(audioEngine.getCurrentTime());
                // Use isPlaying() (checks audio.paused) instead of getState().isPlaying
                // which may be stale after iOS background suspension
                playbackRef.current.setIsPlaying(audioEngine.isPlaying());
            }
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, []);

    // Throttled position state updates (5s)
    const lastPositionUpdateRef = useRef(0);

    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        if (!("setPositionState" in navigator.mediaSession)) return;

        const duration =
            currentTrack?.duration ||
            currentAudiobook?.duration ||
            currentPodcast?.duration;

        if (duration && currentTime !== undefined) {
            const now = Date.now();
            const elapsed = now - lastPositionUpdateRef.current;

            if (elapsed < 5000 && lastPositionUpdateRef.current !== 0) return;

            lastPositionUpdateRef.current = now;
            try {
                navigator.mediaSession.setPositionState({
                    duration,
                    playbackRate: 1,
                    position: Math.min(currentTime, duration),
                });
            } catch (error) {
                console.warn("[MediaSession] Failed to set position state:", error);
            }
        }
    }, [currentTime, currentTrack, currentAudiobook, currentPodcast]);
}
