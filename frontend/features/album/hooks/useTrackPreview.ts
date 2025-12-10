import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Track } from '../types';
import { howlerEngine } from '@/lib/howler-engine';

export function useTrackPreview() {
  const [previewTrack, setPreviewTrack] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainPlayerWasPausedRef = useRef(false);

  const handlePreview = async (track: Track, artistName: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // If the same track is playing, pause it
    if (previewTrack === track.id && previewPlaying) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        setPreviewPlaying(false);
        // Resume main player if it was playing before
        if (mainPlayerWasPausedRef.current) {
          howlerEngine.play();
          mainPlayerWasPausedRef.current = false;
        }
      }
      return;
    }

    // If a different track is playing, stop it first
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    try {
      // Fetch preview URL
      const response = await api.getTrackPreview(artistName, track.title);

      if (!response.previewUrl) {
        toast.error('Preview not available for this track');
        return;
      }

      // Pause the main player if it's playing
      if (howlerEngine.getIsPlaying()) {
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
        // Resume main player if it was playing before
        if (mainPlayerWasPausedRef.current) {
          howlerEngine.play();
          mainPlayerWasPausedRef.current = false;
        }
      };

      audio.onerror = () => {
        toast.error('Failed to play preview');
        setPreviewPlaying(false);
        setPreviewTrack(null);
      };

      // Play audio
      await audio.play();
      setPreviewTrack(track.id);
      setPreviewPlaying(true);
    } catch (error) {
      console.error('Failed to play preview:', error);
      toast.error('Failed to play preview');
      setPreviewPlaying(false);
      setPreviewTrack(null);
    }
  };

  // Cleanup effect: Stop audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      // Resume main player if needed
      if (mainPlayerWasPausedRef.current) {
        howlerEngine.play();
        mainPlayerWasPausedRef.current = false;
      }
    };
  }, []);

  return {
    previewTrack,
    previewPlaying,
    handlePreview,
  };
}
