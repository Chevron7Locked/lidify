"use client";

import { useAudio } from "@/lib/audio-context";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { MiniPlayer } from "./MiniPlayer";
import { FullPlayer } from "./FullPlayer";
import { OverlayPlayer } from "./OverlayPlayer";
import { useEffect, useRef } from "react";

/**
 * UniversalPlayer - Manages player UI rendering based on mode and device
 * NOTE: The AudioElement is rendered by ConditionalAudioProvider, NOT here
 * This component only handles the UI (MiniPlayer, FullPlayer, OverlayPlayer)
 *
 * Mobile/Tablet behavior:
 * - Defaults to overlay mode when new media starts
 * - If user closes overlay, shows mini player at bottom
 * - No full-width player on mobile
 */
export function UniversalPlayer() {
    const { playerMode, setPlayerMode, currentTrack, currentAudiobook, currentPodcast, isPlaying } =
        useAudio();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const isMobileOrTablet = isMobile || isTablet;
    const lastMediaIdRef = useRef<string | null>(null);
    const hasAutoSwitchedRef = useRef(false);

    // Auto-switch to overlay mode on mobile/tablet when user starts playing new media
    useEffect(() => {
        if (!isMobileOrTablet) return;

        const currentMediaId =
            currentTrack?.id ||
            currentAudiobook?.id ||
            currentPodcast?.id ||
            null;

        // Only switch to overlay if:
        // 1. Media changed to a new track
        // 2. User is actively playing (not just page load with paused track)
        // 3. We haven't already auto-switched for this track
        const mediaChanged = currentMediaId && currentMediaId !== lastMediaIdRef.current;

        if (mediaChanged && isPlaying && !hasAutoSwitchedRef.current) {
            setPlayerMode("overlay");
            hasAutoSwitchedRef.current = true;
        }

        // Reset flag when media changes
        if (currentMediaId !== lastMediaIdRef.current) {
            hasAutoSwitchedRef.current = false;
        }

        lastMediaIdRef.current = currentMediaId;
    }, [currentTrack?.id, currentAudiobook?.id, currentPodcast?.id, isPlaying, isMobileOrTablet, setPlayerMode]);

    const hasMedia = !!(currentTrack || currentAudiobook || currentPodcast);

    return (
        <>
            {/* Conditional UI rendering based on mode and device */}
            {/* Note: AudioElement is rendered by ConditionalAudioProvider */}
            {/* Always show player UI (like Spotify), even when no media is playing */}
            {playerMode === "overlay" && hasMedia ? (
                <OverlayPlayer />
            ) : isMobileOrTablet ? (
                /* On mobile/tablet: only mini player (no full player) */
                <MiniPlayer />
            ) : (
                /* Desktop: always show full-width bottom player */
                <FullPlayer />
            )}
        </>
    );
}
