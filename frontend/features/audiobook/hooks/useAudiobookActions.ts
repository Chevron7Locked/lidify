"use client";

import { useCallback } from "react";
import { useAudio } from "@/lib/audio-context";
import { useAudioState } from "@/lib/audio-state-context";
import { useToast } from "@/lib/toast-context";
import { api } from "@/lib/api";

export function useAudiobookActions(
  audiobookId: string,
  audiobook: any, // Raw API response
  refetch: () => void
) {
  const {
    currentAudiobook,
    playbackType,
    isPlaying,
    pause,
    resume,
    playAudiobook,
    currentTime,
    updateCurrentTime,
  } = useAudio();
  const { setCurrentAudiobook, setPlaybackType } = useAudioState();
  const { toast } = useToast();

  const isThisBookPlaying =
    currentAudiobook?.id === audiobookId && playbackType === "audiobook";

  const handlePlayPause = useCallback(() => {
    if (!audiobook) return;

    if (!currentAudiobook) {
      // Pass the audiobook directly - it has all required fields
      playAudiobook(audiobook);
    } else if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [audiobook, currentAudiobook, isPlaying, pause, resume, playAudiobook]);

  const handleMarkAsCompleted = useCallback(async () => {
    if (!audiobook) return;

    try {
      const isCurrentlyPlaying =
        currentAudiobook?.id === audiobookId && playbackType === "audiobook";

      if (isCurrentlyPlaying && isPlaying) {
        pause();
      }

      await api.updateAudiobookProgress(
        audiobookId,
        audiobook.duration || 0,
        audiobook.duration || 0,
        true
      );

      if (currentAudiobook?.id === audiobookId) {
        const finalDuration = audiobook.duration || currentAudiobook.duration || 0;
        setCurrentAudiobook({
          ...currentAudiobook,
          progress: {
            currentTime: finalDuration,
            progress: finalDuration > 0 ? 100 : 0,
            isFinished: true,
            lastPlayedAt: new Date(),
          },
        });
      }

      toast.success("Marked as completed");
      refetch();
    } catch (error) {
      console.error("Failed to mark as completed:", error);
      toast.error("Failed to mark as completed");
    }
  }, [
    audiobook,
    audiobookId,
    currentAudiobook,
    playbackType,
    isPlaying,
    pause,
    setCurrentAudiobook,
    toast,
    refetch,
  ]);

  const handleResetProgress = useCallback(async () => {
    try {
      const isCurrentlyPlaying =
        currentAudiobook?.id === audiobookId && playbackType === "audiobook";

      if (isCurrentlyPlaying && isPlaying) {
        pause();
      }

      await api.deleteAudiobookProgress(audiobookId);

      if (currentAudiobook?.id === audiobookId) {
        setCurrentAudiobook(null);
        setPlaybackType(null);
        updateCurrentTime(0);
      }

      toast.success("Progress reset");
      refetch();
    } catch (error) {
      console.error("Failed to reset progress:", error);
      toast.error("Failed to reset progress");
    }
  }, [
    audiobookId,
    currentAudiobook,
    playbackType,
    isPlaying,
    pause,
    setCurrentAudiobook,
    setPlaybackType,
    updateCurrentTime,
    toast,
    refetch,
  ]);

  const seekToChapter = useCallback(
    (startTime: number) => {
      updateCurrentTime(startTime);
    },
    [updateCurrentTime]
  );

  return {
    isThisBookPlaying,
    isPlaying,
    currentTime,
    handlePlayPause,
    handleMarkAsCompleted,
    handleResetProgress,
    seekToChapter,
  };
}
