import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Track } from "../types";
import { howlerEngine } from "@/lib/howler-engine";

export function useTrackPreview() {
    const [previewTrack, setPreviewTrack] = useState<string | null>(null);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const mainPlayerWasPausedRef = useRef(false);
    const previewRequestIdRef = useRef(0);
    const noPreviewTrackIdsRef = useRef<Set<string>>(new Set());
    const toastShownForNoPreviewRef = useRef<Set<string>>(new Set());
    const inFlightTrackIdRef = useRef<string | null>(null);

    const isAbortError = (err: unknown) => {
        if (!err || typeof err !== "object") return false;
        const e = err as Record<string, unknown>;
        const name = typeof e.name === "string" ? e.name : "";
        const code = typeof e.code === "number" ? e.code : undefined;
        const message = typeof e.message === "string" ? e.message : "";
        return (
            name === "AbortError" ||
            code === 20 ||
            message.includes("interrupted by a call to pause")
        );
    };

    const showNoPreviewToast = (trackId: string) => {
        if (toastShownForNoPreviewRef.current.has(trackId)) return;
        toastShownForNoPreviewRef.current.add(trackId);
        // Small, out-of-the-way notification (not an "error" state)
        toast("No Deezer preview available", { duration: 1500 });
    };

    const handlePreview = async (
        track: Track,
        artistName: string,
        e: React.MouseEvent
    ) => {
        e.stopPropagation();

        // If the same track is playing, pause it
        if (previewTrack === track.id && previewPlaying) {
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                setPreviewPlaying(false);
                // Don't auto-resume main player - let user manually click play
                // This prevents the "pop in" effect when spam-clicking preview
            }
            return;
        }

        // If a different track is playing, stop it first
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }

        try {
            if (inFlightTrackIdRef.current === track.id) return;
            if (noPreviewTrackIdsRef.current.has(track.id)) {
                showNoPreviewToast(track.id);
                return;
            }

            const requestId = ++previewRequestIdRef.current;
            inFlightTrackIdRef.current = track.id;

            // Fetch preview URL
            const response = await api.getTrackPreview(artistName, track.title);
            if (requestId !== previewRequestIdRef.current) return;

            if (!response.previewUrl) {
                noPreviewTrackIdsRef.current.add(track.id);
                showNoPreviewToast(track.id);
                return;
            }

            // Pause the main player if it's playing
            if (howlerEngine.isPlaying()) {
                howlerEngine.pause();
                mainPlayerWasPausedRef.current = true;
            }

            // Create new audio element
            const audio = new Audio(response.previewUrl);
            previewAudioRef.current = audio;

            // Set up event handlers
            audio.onended = () => {
                setPreviewPlaying(false);
                setPreviewTrack(null);
                // Don't auto-resume main player - let user manually click play
                mainPlayerWasPausedRef.current = false;
            };

            audio.onerror = () => {
                toast.error("Failed to play preview");
                setPreviewPlaying(false);
                setPreviewTrack(null);
            };

            // Play audio
            try {
                await audio.play();
            } catch (err: unknown) {
                if (isAbortError(err)) return;
                throw err;
            }
            setPreviewTrack(track.id);
            setPreviewPlaying(true);
        } catch (error: unknown) {
            if (isAbortError(error)) return;
            if (
                typeof error === "object" &&
                error !== null &&
                (((error as Record<string, unknown>).error as unknown) ===
                    "Preview not found" ||
                    /preview not found/i.test(
                        String((error as Record<string, unknown>).message || "")
                    ))
            ) {
                noPreviewTrackIdsRef.current.add(track.id);
                showNoPreviewToast(track.id);
                return;
            }
            console.error("Failed to play preview:", error);
            toast.error("Failed to play preview");
            setPreviewPlaying(false);
            setPreviewTrack(null);
        } finally {
            if (inFlightTrackIdRef.current === track.id) {
                inFlightTrackIdRef.current = null;
            }
        }
    };

    // Stop preview when main player starts playing
    useEffect(() => {
        const stopPreview = () => {
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
                setPreviewPlaying(false);
                setPreviewTrack(null);
                // Don't resume main player - it's already playing
                mainPlayerWasPausedRef.current = false;
            }
        };

        howlerEngine.on("play", stopPreview);
        return () => {
            howlerEngine.off("play", stopPreview);
        };
    }, []);

    // Cleanup effect: Stop audio on unmount
    useEffect(() => {
        return () => {
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }
            // Don't auto-resume main player on unmount
            mainPlayerWasPausedRef.current = false;
        };
    }, []);

    return {
        previewTrack,
        previewPlaying,
        handlePreview,
    };
}
