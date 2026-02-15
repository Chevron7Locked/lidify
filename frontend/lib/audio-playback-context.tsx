"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    useCallback,
    ReactNode,
    useMemo,
} from "react";
import { useAudioState } from "./audio-state-context";

interface AudioPlaybackContextType {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    isBuffering: boolean;
    canSeek: boolean;
    downloadProgress: number | null;
    audioError: string | null;
    setIsPlaying: (playing: boolean) => void;
    setCurrentTime: (time: number) => void;
    setCurrentTimeFromEngine: (time: number) => void;
    setDuration: (duration: number) => void;
    setIsBuffering: (buffering: boolean) => void;
    setTargetSeekPosition: (position: number | null) => void;
    setCanSeek: (canSeek: boolean) => void;
    setDownloadProgress: (progress: number | null) => void;
    setAudioError: (error: string | null) => void;
    clearAudioError: () => void;
}

const AudioPlaybackContext = createContext<AudioPlaybackContextType | undefined>(undefined);

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isBuffering, setIsBuffering] = useState(false);
    const setTargetSeekPosition = useCallback((_position: number | null) => {}, []);
    const [canSeek, setCanSeek] = useState(true);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [isHydrated] = useState(() => typeof window !== "undefined");

    // Timestamp of last seek - used to debounce stale timeupdate values
    const lastSeekTimeRef = useRef(0);

    const clearAudioError = useCallback(() => {
        setAudioError(null);
    }, []);

    // setCurrentTimeFromEngine - filters stale values near a seek
    const setCurrentTimeFromEngine = useCallback((time: number) => {
        // Skip timeupdate events that arrive within 300ms of a seek
        // to prevent stale position values from causing UI flicker
        if (Date.now() - lastSeekTimeRef.current < 300) return;
        setCurrentTime(time);
    }, []);

    // setCurrentTime marks seek timestamp to debounce stale engine updates.
    // Controls context calls this for optimistic updates,
    // and the engine calls setCurrentTimeFromEngine which respects the debounce.
    const setCurrentTimeWithSeekMark = useCallback((time: number) => {
        lastSeekTimeRef.current = Date.now();
        setCurrentTime(time);
    }, []);

    // Sync currentTime from audiobook/podcast progress when not playing
    const state = useAudioState();
    const progressKey = isHydrated && !isPlaying
        ? `${state.playbackType}-${state.currentAudiobook?.progress?.currentTime}-${state.currentPodcast?.progress?.currentTime}`
        : null;
    const [prevProgressKey, setPrevProgressKey] = useState<string | null>(progressKey);

    if (progressKey !== prevProgressKey) {
        setPrevProgressKey(progressKey);
        if (progressKey !== null) {
            if (state.playbackType === "audiobook" && state.currentAudiobook?.progress?.currentTime) {
                setCurrentTime(state.currentAudiobook.progress.currentTime);
            } else if (state.playbackType === "podcast" && state.currentPodcast?.progress?.currentTime) {
                setCurrentTime(state.currentPodcast.progress.currentTime);
            }
        }
    }

    const value = useMemo(
        () => ({
            isPlaying,
            currentTime,
            duration,
            isBuffering,
            canSeek,
            downloadProgress,
            audioError,
            setIsPlaying,
            setCurrentTime: setCurrentTimeWithSeekMark,
            setCurrentTimeFromEngine,
            setDuration,
            setIsBuffering,
            setTargetSeekPosition,
            setCanSeek,
            setDownloadProgress,
            setAudioError,
            clearAudioError,
        }),
        [
            isPlaying,
            currentTime,
            duration,
            isBuffering,
            canSeek,
            downloadProgress,
            audioError,
            setCurrentTimeWithSeekMark,
            setCurrentTimeFromEngine,
            setTargetSeekPosition,
            clearAudioError,
        ]
    );

    return (
        <AudioPlaybackContext.Provider value={value}>
            {children}
        </AudioPlaybackContext.Provider>
    );
}

export function useAudioPlayback() {
    const context = useContext(AudioPlaybackContext);
    if (!context) {
        throw new Error("useAudioPlayback must be used within AudioPlaybackProvider");
    }
    return context;
}
