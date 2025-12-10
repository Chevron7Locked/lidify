import { useState } from "react";
import { LidarrSection } from "./sections/LidarrSection";
import { AIServicesSection } from "./sections/AIServicesSection";
import { AudiobookshelfSection } from "./sections/AudiobookshelfSection";
import { SoulseekSection } from "./sections/SoulseekSection";
import { StoragePathsSection } from "./sections/StoragePathsSection";
import { AdvancedSettingsSection } from "./sections/AdvancedSettingsSection";
import { SystemSettings } from "../types";

interface SystemSettingsTabProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
    onTest: (service: string) => Promise<void>;
    onSave: () => Promise<void>;
    isSaving: boolean;
}

export function SystemSettingsTab({ settings, onUpdate, onTest, onSave, isSaving }: SystemSettingsTabProps) {
    const [testingServices, setTestingServices] = useState<{ [key: string]: boolean }>({});

    const handleTestService = async (service: string) => {
        setTestingServices((prev) => ({ ...prev, [service]: true }));
        try {
            await onTest(service);
        } finally {
            setTestingServices((prev) => ({ ...prev, [service]: false }));
        }
    };

    return (
        <div className="space-y-6">
            {/* Download Services */}
            <section className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Download Services</h2>
                    <p className="text-sm text-gray-400">
                        Configure external services for downloading and managing music
                    </p>
                </div>
                <LidarrSection
                    settings={settings}
                    onUpdate={onUpdate}
                    onTest={handleTestService}
                    isTesting={testingServices.lidarr || false}
                />
            </section>

            {/* AI & Metadata Services */}
            <AIServicesSection
                settings={settings}
                onUpdate={onUpdate}
                onTest={handleTestService}
                isTesting={testingServices.fanart || testingServices.openai || false}
            />

            {/* Media Servers */}
            <section className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Media Servers</h2>
                    <p className="text-sm text-gray-400">
                        Connect to external media servers for audiobooks and podcasts
                    </p>
                </div>
                <AudiobookshelfSection
                    settings={settings}
                    onUpdate={onUpdate}
                    onTest={handleTestService}
                    isTesting={testingServices.audiobookshelf || false}
                />
            </section>

            {/* P2P Networks */}
            <section className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">P2P Networks</h2>
                    <p className="text-sm text-gray-400">
                        Configure peer-to-peer music sharing networks
                    </p>
                </div>
                <SoulseekSection
                    settings={settings}
                    onUpdate={onUpdate}
                    onTest={handleTestService}
                    isTesting={testingServices.slskd || false}
                />
            </section>

            {/* Storage Paths */}
            <StoragePathsSection
                settings={settings}
                onUpdate={onUpdate}
                onTest={handleTestService}
                isTesting={false}
            />

            {/* Advanced Settings */}
            <AdvancedSettingsSection
                settings={settings}
                onUpdate={onUpdate}
            />

            {/* Save Button */}
            <div className="pt-6">
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="w-full bg-[#111] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg border border-[#1c1c1c] transition-colors"
                >
                    {isSaving ? "Saving..." : "Save Changes"}
                </button>
            </div>
        </div>
    );
}
