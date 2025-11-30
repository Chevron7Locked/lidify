"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { RestartModal } from "@/components/ui/RestartModal";
import { UserSettingsTab } from "@/features/settings/components/UserSettingsTab";
import { AccountTab } from "@/features/settings/components/AccountTab";
import { SystemSettingsTab } from "@/features/settings/components/SystemSettingsTab";
import { useSettingsData } from "@/features/settings/hooks/useSettingsData";
import { useSystemSettings } from "@/features/settings/hooks/useSystemSettings";
import { useToast } from "@/lib/toast-context";
import { Tab } from "@/features/settings/types";
import { GradientSpinner } from "@/components/ui/GradientSpinner";

export default function SettingsPage() {
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<Tab>("user");
    const [initialHash, setInitialHash] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);
    const [showRestartModal, setShowRestartModal] = useState(false);

    const isAdmin = user?.role === "admin";

    // User settings hook
    const {
        settings: userSettings,
        updateSettings: updateUserSettings,
        saveSettings: saveUserSettings,
    } = useSettingsData();

    // System settings hook (only used if admin)
    const {
        systemSettings,
        changedServices,
        updateSystemSettings,
        saveSystemSettings,
        testService,
    } = useSystemSettings();

    // Handle deep linking from URL params
    useEffect(() => {
        const tabParam = searchParams.get("tab");
        if (tabParam && ["user", "account", "system"].includes(tabParam)) {
            setActiveTab(tabParam as Tab);
        }

        // Handle hash for section scrolling
        if (typeof window !== "undefined") {
            const hash = window.location.hash.substring(1);
            setInitialHash(hash);
        }
    }, [searchParams]);

    // Scroll to section if hash present
    useEffect(() => {
        if (initialHash) {
            setTimeout(() => {
                const element = document.getElementById(initialHash);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            }, 100);
        }
    }, [initialHash, activeTab]);

    // Unified save function that saves all settings
    const handleSaveAll = async () => {
        setIsSaving(true);
        let hasError = false;
        let changedSystemServices: string[] = [];

        try {
            // Save user settings
            await saveUserSettings(userSettings);
        } catch (error) {
            console.error("Failed to save user settings:", error);
            hasError = true;
        }

        // Save system settings if admin
        if (isAdmin) {
            try {
                changedSystemServices = await saveSystemSettings(systemSettings) || [];
            } catch (error) {
                console.error("Failed to save system settings:", error);
                hasError = true;
            }
        }

        setIsSaving(false);

        if (!hasError) {
            toast.success("All settings saved successfully");
            
            // Show restart modal if system services were changed
            if (changedSystemServices.length > 0) {
                setShowRestartModal(true);
            }
        }
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <GradientSpinner size="md" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a]">
            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                        Settings
                    </h1>
                    <p className="text-gray-400">
                        Manage your playback and app preferences
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab("user")}
                        className={`px-4 py-2 rounded-md transition-colors ${
                            activeTab === "user"
                                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                : "bg-[#111] text-gray-400 hover:bg-[#1a1a1a] border border-[#1c1c1c]"
                        }`}
                    >
                        User Settings
                    </button>
                    <button
                        onClick={() => setActiveTab("account")}
                        className={`px-4 py-2 rounded-md transition-colors ${
                            activeTab === "account"
                                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                : "bg-[#111] text-gray-400 hover:bg-[#1a1a1a] border border-[#1c1c1c]"
                        }`}
                    >
                        Account
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setActiveTab("system")}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                activeTab === "system"
                                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                    : "bg-[#111] text-gray-400 hover:bg-[#1a1a1a] border border-[#1c1c1c]"
                            }`}
                        >
                            System Settings
                        </button>
                    )}
                </div>

                {/* Tab Content */}
                {activeTab === "user" && (
                    <UserSettingsTab
                        settings={userSettings}
                        onUpdate={updateUserSettings}
                        onSave={handleSaveAll}
                        isSaving={isSaving}
                    />
                )}
                {activeTab === "account" && (
                    <AccountTab
                        onSave={handleSaveAll}
                        isSaving={isSaving}
                    />
                )}
                {activeTab === "system" && isAdmin && (
                    <SystemSettingsTab
                        settings={systemSettings}
                        onUpdate={updateSystemSettings}
                        onTest={testService}
                        onSave={handleSaveAll}
                        isSaving={isSaving}
                    />
                )}
            </div>

            {/* Restart Modal */}
            <RestartModal
                isOpen={showRestartModal}
                onClose={() => setShowRestartModal(false)}
                changedServices={changedServices}
            />
        </div>
    );
}
