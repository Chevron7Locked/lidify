import { useRef, useEffect, useCallback } from "react";

/**
 * Hook to handle audio fade in/out effects
 *
 * @param audioElement - The HTML audio element to apply fades to
 * @param isPlaying - Whether audio is currently playing
 * @param volume - Target volume (0-1)
 * @param isMuted - Whether audio is muted
 * @param fadeInDuration - Duration of fade-in in ms (default: 500)
 * @param fadeOutDuration - Duration of fade-out in ms (default: 300)
 */
export function useAudioFade(
    audioElement: HTMLAudioElement | null,
    isPlaying: boolean,
    volume: number,
    isMuted = false,
    fadeInDuration = 500,
    fadeOutDuration = 300
) {
    const fadeIntervalRef = useRef<number | null>(null);
    const targetVolumeRef = useRef(volume);
    const isMutedRef = useRef(isMuted);

    // Update target volume when it changes
    useEffect(() => {
        targetVolumeRef.current = volume;
        isMutedRef.current = isMuted;
    }, [volume, isMuted]);

    // Clear any ongoing fade on unmount
    useEffect(() => {
        return () => {
            if (fadeIntervalRef.current) {
                cancelAnimationFrame(fadeIntervalRef.current);
            }
        };
    }, []);

    const cancelFade = useCallback(() => {
        if (fadeIntervalRef.current) {
            cancelAnimationFrame(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
        }
    }, []);

    const fade = useCallback(
        (
            from: number,
            to: number,
            duration: number,
            onComplete?: () => void
        ) => {
            if (!audioElement) return;

            cancelFade();

            const startTime = performance.now();
            const startVolume = from;
            const volumeDelta = to - from;

            const step = (currentTime: number) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease-in-out curve for smoother transitions
                const easedProgress =
                    progress < 0.5
                        ? 2 * progress * progress
                        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                const newVolume = startVolume + volumeDelta * easedProgress;
                audioElement.volume = Math.max(0, Math.min(1, newVolume));

                if (progress < 1) {
                    fadeIntervalRef.current = requestAnimationFrame(step);
                } else {
                    fadeIntervalRef.current = null;
                    if (onComplete) onComplete();
                }
            };

            fadeIntervalRef.current = requestAnimationFrame(step);
        },
        [audioElement, cancelFade]
    );

    const fadeIn = useCallback(() => {
        if (!audioElement) return;
        // Fade to target volume, or 0 if muted
        const targetVol = isMutedRef.current ? 0 : targetVolumeRef.current;
        fade(0, targetVol, fadeInDuration);
    }, [audioElement, fade, fadeInDuration]);

    const fadeOut = useCallback(
        (onComplete?: () => void) => {
            if (!audioElement) return;
            fade(audioElement.volume, 0, fadeOutDuration, onComplete);
        },
        [audioElement, fade, fadeOutDuration]
    );

    return { fadeIn, fadeOut, cancelFade };
}
