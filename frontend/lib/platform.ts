/**
 * Platform detection utilities for Capacitor
 */
import { Capacitor } from "@capacitor/core";

const hasCapacitorBridge = (): boolean => {
    return typeof window !== "undefined" && !!(window as any).Capacitor;
};

export const isNativePlatform = (): boolean => {
    if (!hasCapacitorBridge()) return false;
    try {
        return !!Capacitor?.isNativePlatform?.();
    } catch {
        return false;
    }
};

export const isCapacitor = (): boolean => {
    return isNativePlatform();
};

export const isWeb = (): boolean => {
    return !isNativePlatform();
};

export const isAndroid = (): boolean => {
    if (!isNativePlatform()) return false;
    return Capacitor.getPlatform() === "android";
};

export const isIOS = (): boolean => {
    if (!isNativePlatform()) return false;
    return Capacitor.getPlatform() === "ios";
};
