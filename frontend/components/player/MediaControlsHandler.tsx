"use client";

import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMediaSession } from "@/hooks/useMediaSession";

/**
 * Invisible component that registers keyboard shortcuts and Media Session API
 * Should be placed at the root level of the app
 */
export function MediaControlsHandler() {
  useKeyboardShortcuts();
  useMediaSession();

  return null; // This component doesn't render anything
}
