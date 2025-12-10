import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Track } from '../types';
import { howlerEngine } from '@/lib/howler-engine';

export function usePreviewPlayer() {
    const [previewTrack, setPreviewTrack] = useState<string | null>(null);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const mainPlayerWasPausedRef = useRef(false);

    async function handlePreview(track: Track, artistName: string, e: React.MouseEvent) {
        e.stopPropagation();

        // If clicking the same track that's playing, pause it
        if (previewTrack === track.id && previewPlaying) {
            previewAudioRef.current?.pause();
            setPreviewPlaying(false);
            // Resume main player if it was playing before
            if (mainPlayerWasPausedRef.current) {
                howlerEngine.play();
                mainPlayerWasPausedRef.current = false;
            }
            return;
        }

        // If clicking a different track, stop current and play new
        if (previewTrack !== track.id) {
            try {
                const response = await api.getTrackPreview(
                    artistName,
                    track.title
                );
                if (response.previewUrl) {
                    // Stop current preview if any
                    if (previewAudioRef.current) {
                        previewAudioRef.current.pause();
                        previewAudioRef.current = null;
                    }

                    // Pause the main player if it's playing
                    if (howlerEngine.getIsPlaying()) {
                        howlerEngine.pause();
                        mainPlayerWasPausedRef.current = true;
                    }

                    // Create new audio element
                    const audio = new Audio(response.previewUrl);
                    previewAudioRef.current = audio;
                    setPreviewTrack(track.id);

                    audio.onended = () => {
                        setPreviewPlaying(false);
                        setPreviewTrack(null);
                        // Resume main player if it was playing before
                        if (mainPlayerWasPausedRef.current) {
                            howlerEngine.play();
                            mainPlayerWasPausedRef.current = false;
                        }
                    };

                    audio.onerror = () => {
                        toast.error('Failed to load preview');
                        setPreviewPlaying(false);
                        setPreviewTrack(null);
                    };

                    await audio.play();
                    setPreviewPlaying(true);
                } else {
                    toast.error('Preview not available for this track');
                }
            } catch (error) {
                toast.error('Failed to load preview');
                console.error('Preview error:', error);
            }
        } else {
            // Resume paused preview
            previewAudioRef.current?.play();
            setPreviewPlaying(true);
        }
    }

    // Cleanup preview on unmount
    useEffect(() => {
        return () => {
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }
        };
    }, []);

    return { previewTrack, previewPlaying, handlePreview };
}
