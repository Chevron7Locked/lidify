"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    ReactNode,
    useMemo,
} from "react";

interface AudioPlaybackContextType {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    isBuffering: boolean;
    targetSeekPosition: number | null;
    canSeek: boolean;
    downloadProgress: number | null; // 0-100 for downloading, null for not downloading
    setIsPlaying: (playing: boolean) => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    setIsBuffering: (buffering: boolean) => void;
    setTargetSeekPosition: (position: number | null) => void;
    setCanSeek: (canSeek: boolean) => void;
    setDownloadProgress: (progress: number | null) => void;
}

const AudioPlaybackContext = createContext<
    AudioPlaybackContextType | undefined
>(undefined);

// LocalStorage keys
const STORAGE_KEYS = {
    IS_PLAYING: "lidify_is_playing",
    CURRENT_TIME: "lidify_current_time",
};

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isBuffering, setIsBuffering] = useState(false);
    const [targetSeekPosition, setTargetSeekPosition] = useState<number | null>(null);
    const [canSeek, setCanSeek] = useState(true); // Default true for music, false for uncached podcasts
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const lastSaveTimeRef = useRef<number>(0);

    // Restore currentTime from localStorage on mount
    // NOTE: Do NOT touch isPlaying here - let user actions control it
    useEffect(() => {
        if (typeof window === "undefined") return;

        try {
            const savedTime = localStorage.getItem(STORAGE_KEYS.CURRENT_TIME);
            if (savedTime) setCurrentTime(parseFloat(savedTime));
            // Don't force pause - this was causing immediate pause after play!
        } catch (error) {
            console.error("[AudioPlayback] Failed to restore state:", error);
        }
        setIsHydrated(true);
    }, []);

    // Save currentTime to localStorage (throttled to avoid excessive writes)
    useEffect(() => {
        if (!isHydrated || typeof window === "undefined") return;

        // Throttle saves to every 5 seconds using timestamp comparison
        const now = Date.now();
        if (now - lastSaveTimeRef.current < 5000) return;

        lastSaveTimeRef.current = now;
        try {
            localStorage.setItem(
                STORAGE_KEYS.CURRENT_TIME,
                currentTime.toString()
            );
        } catch (error) {
            console.error("[AudioPlayback] Failed to save currentTime:", error);
        }
    }, [currentTime, isHydrated]);

    // Memoize to prevent re-renders when values haven't changed
    const value = useMemo(
        () => ({
            isPlaying,
            currentTime,
            duration,
            isBuffering,
            targetSeekPosition,
            canSeek,
            downloadProgress,
            setIsPlaying,
            setCurrentTime,
            setDuration,
            setIsBuffering,
            setTargetSeekPosition,
            setCanSeek,
            setDownloadProgress,
        }),
        [isPlaying, currentTime, duration, isBuffering, targetSeekPosition, canSeek, downloadProgress]
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
        throw new Error(
            "useAudioPlayback must be used within AudioPlaybackProvider"
        );
    }
    return context;
}
