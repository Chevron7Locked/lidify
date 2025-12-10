/**
 * Platform detection utilities for Capacitor
 * Includes fallback detection for when Capacitor bridge isn't ready
 */
import { Capacitor } from "@capacitor/core";

/**
 * Check if running in a Capacitor WebView environment using protocol/user-agent fallbacks
 * This helps detect native platform even before Capacitor bridge is fully initialized
 */
const isCapacitorWebView = (): boolean => {
    if (typeof window === "undefined") return false;

    // Check for capacitor:// protocol (Android)
    if (window.location?.protocol === "capacitor:") return true;

    // Check for ionic:// protocol (iOS)
    if (window.location?.protocol === "ionic:") return true;

    // Check for file:// protocol with capacitor in path (older Capacitor versions)
    if (
        window.location?.protocol === "file:" &&
        window.location?.pathname?.includes("capacitor")
    )
        return true;

    // Check user agent for Android WebView indicators
    const ua = navigator?.userAgent?.toLowerCase() || "";
    if (ua.includes("wv") && (ua.includes("android") || ua.includes("iphone")))
        return true;

    // Check for Capacitor-specific window properties
    if ((window as any).Capacitor?.isNativePlatform) return true;

    return false;
};

const hasCapacitorBridge = (): boolean => {
    return typeof window !== "undefined" && !!(window as any).Capacitor;
};

export const isNativePlatform = (): boolean => {
    // First try the Capacitor bridge if available
    if (hasCapacitorBridge()) {
        try {
            const result = Capacitor?.isNativePlatform?.();
            if (result !== undefined) return !!result;
        } catch {
            // Fall through to fallback detection
        }
    }

    // Fallback: detect Capacitor WebView environment
    return isCapacitorWebView();
};

export const isCapacitor = (): boolean => {
    return isNativePlatform();
};

export const isWeb = (): boolean => {
    return !isNativePlatform();
};

export const isAndroid = (): boolean => {
    if (!isNativePlatform()) return false;

    // Try Capacitor API first
    if (hasCapacitorBridge()) {
        try {
            return Capacitor.getPlatform() === "android";
        } catch {
            // Fall through
        }
    }

    // Fallback: check user agent
    const ua = navigator?.userAgent?.toLowerCase() || "";
    return ua.includes("android");
};

export const isIOS = (): boolean => {
    if (!isNativePlatform()) return false;

    // Try Capacitor API first
    if (hasCapacitorBridge()) {
        try {
            return Capacitor.getPlatform() === "ios";
        } catch {
            // Fall through
        }
    }

    // Fallback: check user agent
    const ua = navigator?.userAgent?.toLowerCase() || "";
    return ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
};
