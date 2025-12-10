import { useEffect } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useIsTV } from '@/lib/tv-utils';

/**
 * Global keyboard shortcuts for media playback
 *
 * Shortcuts:
 * - Space: Play/Pause
 * - Arrow Right: Seek forward 10s
 * - Arrow Left: Seek backward 10s
 * - Arrow Up: Volume up 10%
 * - Arrow Down: Volume down 10%
 * - M: Toggle mute
 * - N: Next track
 * - P: Previous track
 * - S: Toggle shuffle
 */
export function useKeyboardShortcuts() {
  const isTV = useIsTV();
  const {
    isPlaying,
    resume,
    pause,
    next,
    previous,
    seek,
    currentTime,
    setVolume,
    volume,
    toggleMute,
    toggleShuffle,
    playbackType,
    currentTrack,
    currentAudiobook,
    currentPodcast,
  } = useAudio();

  useEffect(() => {
    // Disable keyboard shortcuts on TV - use remote's media keys instead
    if (isTV) return;

    // Don't add shortcuts if nothing is loaded
    if (!playbackType) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Prevent default for media keys to avoid conflicts
      if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key.toLowerCase()) {
        case ' ': // Space - Play/Pause
          if (isPlaying) {
            pause();
          } else {
            resume();
          }
          break;

        case 'arrowright': // Right arrow - Seek forward 10s
          if (playbackType === 'track' || playbackType === 'audiobook' || playbackType === 'podcast') {
            const duration = currentTrack?.duration || currentAudiobook?.duration || currentPodcast?.duration || 0;
            seek(Math.min(currentTime + 10, duration));
          }
          break;

        case 'arrowleft': // Left arrow - Seek backward 10s
          if (playbackType === 'track' || playbackType === 'audiobook' || playbackType === 'podcast') {
            seek(Math.max(currentTime - 10, 0));
          }
          break;

        case 'arrowup': // Up arrow - Volume up 10%
          setVolume(Math.min(volume + 0.1, 1));
          break;

        case 'arrowdown': // Down arrow - Volume down 10%
          setVolume(Math.max(volume - 0.1, 0));
          break;

        case 'm': // M - Toggle mute
          toggleMute();
          break;

        case 'n': // N - Next track
          if (playbackType === 'track') {
            next();
          }
          break;

        case 'p': // P - Previous track
          if (playbackType === 'track' && !e.shiftKey) { // Avoid conflict with Shift+P
            previous();
          }
          break;

        case 's': // S - Toggle shuffle
          if (playbackType === 'track') {
            toggleShuffle();
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    isTV,
    isPlaying,
    pause,
    resume,
    next,
    previous,
    seek,
    currentTime,
    setVolume,
    volume,
    toggleMute,
    toggleShuffle,
    playbackType,
    currentTrack,
    currentAudiobook,
    currentPodcast,
  ]);
}
