import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { SystemSettings } from "../types";

const defaultSystemSettings: SystemSettings = {
    lidarrEnabled: true,
    lidarrUrl: "http://localhost:8686",
    lidarrApiKey: "",
    openaiEnabled: false,
    openaiApiKey: "",
    openaiModel: "gpt-4",
    fanartEnabled: false,
    fanartApiKey: "",
    audiobookshelfEnabled: false,
    audiobookshelfUrl: "http://localhost:13378",
    audiobookshelfApiKey: "",
    slskdEnabled: false,
    slskdUrl: "http://localhost:5030",
    soulseekUsername: "",
    soulseekPassword: "",
    musicPath: "/music",
    downloadPath: "/downloads",
    transcodeCacheMaxGb: 10,
    maxCacheSizeMb: 10240,
    autoSync: true,
    autoEnrichMetadata: true,
};

export function useSystemSettings() {
    const { isAuthenticated, user } = useAuth();
    const { toast } = useToast();
    const [systemSettings, setSystemSettings] = useState<SystemSettings>(
        defaultSystemSettings
    );
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [changedServices, setChangedServices] = useState<string[]>([]);
    const [originalSettings, setOriginalSettings] = useState<SystemSettings>(
        defaultSystemSettings
    );

    const isAdmin = user?.role === "admin";

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            loadSystemSettings();
        }
    }, [isAuthenticated, isAdmin]);

    const loadSystemSettings = async () => {
        try {
            setIsLoading(true);
            const [sysData, userData] = await Promise.all([
                api.getSystemSettings(),
                api.getSettings(),
            ]);

            // Sanitize null values to empty strings for controlled inputs
            const sanitizeSettings = (settings: any): SystemSettings => {
                const sanitized: any = {};
                for (const key in settings) {
                    const value = settings[key];
                    // Convert null to empty string for string fields
                    if (value === null && typeof defaultSystemSettings[key as keyof SystemSettings] === 'string') {
                        sanitized[key] = '';
                    } else {
                        sanitized[key] = value;
                    }
                }
                return sanitized;
            };

            const combinedSettings = {
                ...sanitizeSettings(sysData),
                maxCacheSizeMb: userData.maxCacheSizeMb,
            };

            setSystemSettings(combinedSettings);
            setOriginalSettings(combinedSettings);
        } catch (error) {
            console.error("Failed to load system settings:", error);
            toast.error("Failed to load system settings");
        } finally {
            setIsLoading(false);
        }
    };

    const saveSystemSettings = async (settingsToSave: SystemSettings, showToast = false) => {
        try {
            setIsSaving(true);

            // Save system settings
            await api.updateSystemSettings(settingsToSave);

            // Also save user cache setting
            await api.updateSettings({
                maxCacheSizeMb: settingsToSave.maxCacheSizeMb,
            });

            // Determine which services changed
            const changed: string[] = [];
            if (
                originalSettings.lidarrEnabled !==
                    settingsToSave.lidarrEnabled ||
                originalSettings.lidarrUrl !== settingsToSave.lidarrUrl ||
                originalSettings.lidarrApiKey !== settingsToSave.lidarrApiKey
            ) {
                changed.push("Lidarr");
            }
            if (
                originalSettings.slskdEnabled !== settingsToSave.slskdEnabled ||
                originalSettings.slskdUrl !== settingsToSave.slskdUrl ||
                originalSettings.soulseekUsername !==
                    settingsToSave.soulseekUsername ||
                originalSettings.soulseekPassword !==
                    settingsToSave.soulseekPassword
            ) {
                changed.push("Soulseek");
            }
            if (
                originalSettings.audiobookshelfEnabled !==
                    settingsToSave.audiobookshelfEnabled ||
                originalSettings.audiobookshelfUrl !==
                    settingsToSave.audiobookshelfUrl ||
                originalSettings.audiobookshelfApiKey !==
                    settingsToSave.audiobookshelfApiKey
            ) {
                changed.push("Audiobookshelf");
            }

            setChangedServices(changed);
            setOriginalSettings(settingsToSave);
            
            if (showToast) {
                toast.success("System settings saved successfully");
            }

            return changed; // Return changed services
        } catch (error) {
            console.error("Failed to save system settings:", error);
            toast.error("Failed to save system settings");
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    const updateSystemSettings = (updates: Partial<SystemSettings>) => {
        setSystemSettings((prev) => ({ ...prev, ...updates }));
    };

    const testService = async (service: string): Promise<string | null> => {
        try {
            let result;
            switch (service) {
                case "lidarr":
                    result = await api.testLidarr(
                        systemSettings.lidarrUrl,
                        systemSettings.lidarrApiKey
                    );
                    break;
                case "openai":
                    result = await api.testOpenai(
                        systemSettings.openaiApiKey,
                        systemSettings.openaiModel
                    );
                    break;
                case "fanart":
                    result = await api.testFanart(systemSettings.fanartApiKey);
                    break;
                case "audiobookshelf":
                    result = await api.testAudiobookshelf(
                        systemSettings.audiobookshelfUrl,
                        systemSettings.audiobookshelfApiKey
                    );
                    break;
                case "slskd":
                    result = await api.testSlskd(systemSettings.slskdUrl);
                    break;
                default:
                    throw new Error(`Unknown service: ${service}`);
            }

            const message = result?.version
                ? `Connected successfully! Version: ${result.version}`
                : "Connection successful!";

            toast.success(message);
            return result?.version || null;
        } catch (error: any) {
            console.error(`Failed to test ${service}:`, error);
            toast.error(error.message || `Failed to connect to ${service}`);
            return null;
        }
    };

    return {
        systemSettings,
        isLoading,
        isSaving,
        changedServices,
        setSystemSettings,
        updateSystemSettings,
        saveSystemSettings,
        testService,
        loadSystemSettings,
    };
}
