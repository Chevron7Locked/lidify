import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        // Only run on client side
        if (typeof window === "undefined") return;

        const media = window.matchMedia(query);

        // Set initial value
        setMatches(media.matches);

        // Create listener
        const listener = (e: MediaQueryListEvent) => setMatches(e.matches);

        // Add listener
        if (media.addEventListener) {
            media.addEventListener("change", listener);
        } else {
            // Fallback for older browsers
            media.addListener(listener);
        }

        // Cleanup
        return () => {
            if (media.removeEventListener) {
                media.removeEventListener("change", listener);
            } else {
                media.removeListener(listener);
            }
        };
    }, [query]);

    return matches;
}

// Common breakpoints
export const useIsMobile = () => useMediaQuery("(max-width: 768px)");
export const useIsTablet = () => useMediaQuery("(min-width: 769px) and (max-width: 1024px)");
export const useIsDesktop = () => useMediaQuery("(min-width: 1025px)");
export const useIsTV = () => useMediaQuery("(min-width: 1920px)");
export const useIsLargeTV = () => useMediaQuery("(min-width: 2560px)");
