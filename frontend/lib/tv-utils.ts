/**
 * Android TV / D-pad Navigation Utilities
 * Provides keyboard navigation support for TV interfaces
 */

import { useEffect, useCallback, useState } from "react";

// Check if running on Android TV
export function isAndroidTV(): boolean {
    if (typeof window === "undefined") return false;
    
    // Check for leanback/TV user agent hints
    const ua = navigator.userAgent.toLowerCase();
    const isTV = ua.includes("android tv") || 
                 ua.includes("googletv") || 
                 ua.includes("aftb") || // Fire TV
                 ua.includes("aftt") || // Fire TV Stick
                 ua.includes("afts") || // Fire TV
                 ua.includes("aftm") || // Fire TV
                 (ua.includes("android") && ua.includes("tv"));
    
    // Also check for large screen with no touch (TV indicator)
    const isLargeScreen = window.innerWidth >= 1920;
    const noTouch = !('ontouchstart' in window);
    
    // Check URL param for testing: ?tv=1
    const urlParams = new URLSearchParams(window.location.search);
    const tvParam = urlParams.get('tv') === '1';
    
    return isTV || tvParam || (isLargeScreen && noTouch && ua.includes("android"));
}

// React hook to detect Android TV (with SSR safety)
export function useIsTV(): boolean {
    const [isTV, setIsTV] = useState(false);

    useEffect(() => {
        setIsTV(isAndroidTV());
    }, []);

    return isTV;
}

// D-pad key codes
export const DPAD_KEYS = {
    UP: "ArrowUp",
    DOWN: "ArrowDown",
    LEFT: "ArrowLeft",
    RIGHT: "ArrowRight",
    CENTER: "Enter",
    BACK: "Escape",
    PLAY_PAUSE: "MediaPlayPause",
    FAST_FORWARD: "MediaFastForward",
    REWIND: "MediaRewind",
    STOP: "MediaStop",
    // Note: Volume keys (AudioVolumeUp, AudioVolumeDown, AudioVolumeMute)
    // are typically handled by the Android system, not the web app
} as const;

// Hook to handle D-pad navigation with custom actions
export function useDpadNavigation(options?: {
    onSelect?: () => void;
    onBack?: () => void;
    onPlayPause?: () => void;
}) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        switch (e.key) {
            case DPAD_KEYS.CENTER:
                options?.onSelect?.();
                break;
            case DPAD_KEYS.BACK:
                options?.onBack?.();
                break;
            case DPAD_KEYS.PLAY_PAUSE:
                e.preventDefault();
                options?.onPlayPause?.();
                break;
        }
    }, [options]);

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);
}

// Get focusable elements within a container
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[role="button"]',
    ].join(', ');

    return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

// Focus management for grid navigation
export function navigateGrid(
    currentElement: HTMLElement,
    direction: 'up' | 'down' | 'left' | 'right',
    container: HTMLElement
): HTMLElement | null {
    const focusables = getFocusableElements(container);
    const currentIndex = focusables.indexOf(currentElement);
    
    if (currentIndex === -1) return null;

    // Simple grid navigation - assumes uniform grid layout
    const rect = currentElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // Estimate items per row
    const itemsPerRow = Math.round(containerRect.width / rect.width);

    let targetIndex: number;
    
    switch (direction) {
        case 'left':
            targetIndex = Math.max(0, currentIndex - 1);
            break;
        case 'right':
            targetIndex = Math.min(focusables.length - 1, currentIndex + 1);
            break;
        case 'up':
            targetIndex = Math.max(0, currentIndex - itemsPerRow);
            break;
        case 'down':
            targetIndex = Math.min(focusables.length - 1, currentIndex + itemsPerRow);
            break;
        default:
            targetIndex = currentIndex;
    }

    return focusables[targetIndex] || null;
}

