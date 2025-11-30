/**
 * Audio Context Re-exports
 *
 * All functionality is split into three separate contexts for better performance:
 *
 * - audio-state-context.tsx - Rarely changing data (currentTrack, queue, etc.)
 * - audio-playback-context.tsx - Frequently changing data (currentTime, isPlaying)
 * - audio-controls-context.tsx - Actions only (play, pause, next, etc.)
 *
 * Import from these files directly for optimal performance.
 * This file provides convenient re-exports for backward compatibility.
 */

// Re-export types
export type { PlayerMode, Track, Audiobook, Podcast } from "./audio-state-context";

// Re-export providers
export { AudioStateProvider } from "./audio-state-context";
export { AudioPlaybackProvider } from "./audio-playback-context";
export { AudioControlsProvider } from "./audio-controls-context";

// Re-export individual hooks
export { useAudioState } from "./audio-state-context";
export { useAudioPlayback } from "./audio-playback-context";
export { useAudioControls } from "./audio-controls-context";

// Re-export the unified hook (backward compatibility)
export { useAudio } from "./audio-hooks";
