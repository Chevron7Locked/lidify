import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { UserSettings } from "../types";

const defaultSettings: UserSettings = {
    playbackQuality: "original",
    wifiOnly: false,
    offlineEnabled: false,
    maxCacheSizeMb: 5120,
};

export function useSettingsData() {
    const { isAuthenticated } = useAuth();
    const { toast } = useToast();
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            loadSettings();
        }
    }, [isAuthenticated]);

    const loadSettings = async () => {
        try {
            setIsLoading(true);
            const data = await api.getSettings();
            setSettings(data);
        } catch (error) {
            console.error("Failed to load settings:", error);
            toast.error("Failed to load settings");
        } finally {
            setIsLoading(false);
        }
    };

    const saveSettings = async (newSettings: UserSettings, showToast = false) => {
        try {
            setIsSaving(true);
            await api.updateSettings(newSettings);
            setSettings(newSettings);
            if (showToast) {
                toast.success("Settings saved successfully");
            }
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast.error("Failed to save user settings");
            throw error; // Re-throw so caller knows it failed
        } finally {
            setIsSaving(false);
        }
    };

    const updateSettings = (updates: Partial<UserSettings>) => {
        setSettings((prev) => ({ ...prev, ...updates }));
    };

    return {
        settings,
        isLoading,
        isSaving,
        setSettings,
        updateSettings,
        saveSettings,
        loadSettings,
    };
}
