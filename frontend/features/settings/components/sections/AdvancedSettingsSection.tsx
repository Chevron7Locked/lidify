import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SystemSettings } from "../../types";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";

interface AdvancedSettingsSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
}

export function AdvancedSettingsSection({
    settings,
    onUpdate,
}: AdvancedSettingsSectionProps) {
    const [syncing, setSyncing] = useState(false);
    const [clearingCaches, setClearingCaches] = useState(false);
    const { toast } = useToast();

    const handleSyncAndEnrich = async () => {
        setSyncing(true);
        try {
            // Sync audiobooks if auto-enrich is enabled
            if (settings.autoEnrichMetadata) {
                toast.info("Starting audiobook sync...");
                await api.post("/audiobooks/sync", {});
                toast.success("Audiobook sync completed");
            }

            // Sync podcast covers
            toast.info("Syncing podcast covers...");
            await api.post("/podcasts/sync-covers", {});
            toast.success("Podcast covers synced");

            // Start library enrichment
            toast.info("Starting library enrichment...");
            await api.startLibraryEnrichment();
            toast.success("Library enrichment started successfully");
        } catch (error) {
            console.error("Sync and enrich error:", error);
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to sync and enrich"
            );
        } finally {
            setSyncing(false);
        }
    };

    const handleClearCaches = async () => {
        setClearingCaches(true);
        try {
            await api.clearAllCaches();
            toast.success("All caches cleared successfully");
        } catch (error) {
            toast.error("Failed to clear caches");
            console.error("Error clearing caches:", error);
        } finally {
            setClearingCaches(false);
        }
    };

    return (
        <section id="advanced" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">
                Cache & Advanced Settings
            </h2>

            <div className="space-y-6">
                {/* Cache Settings */}
                <div className="pb-6 border-b border-[#1c1c1c]">
                    <h3 className="text-lg font-semibold text-white mb-4">
                        Cache Management
                    </h3>

                    {/* User Cache Size */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-white">
                                User Cache Size
                            </label>
                            <span className="text-[#ecb200] font-semibold">
                                {(settings.maxCacheSizeMb / 1024).toFixed(1)} GB
                            </span>
                        </div>
                        <input
                            type="range"
                            min={512}
                            max={20480}
                            step={512}
                            value={settings.maxCacheSizeMb}
                            onChange={(e) =>
                                onUpdate({
                                    maxCacheSizeMb: parseInt(e.target.value),
                                })
                            }
                            className="w-full h-2 bg-[#0a0a0a] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#ecb200] [&::-webkit-slider-thumb]:hover:bg-[#d4a000] [&::-webkit-slider-thumb]:transition-colors [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#ecb200] [&::-moz-range-thumb]:hover:bg-[#d4a000] [&::-moz-range-thumb]:transition-colors [&::-moz-range-thumb]:border-0"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>0.5 GB</span>
                            <span>20 GB</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Maximum storage for user-downloaded content
                            (mobile/offline)
                        </p>
                    </div>

                    {/* Transcode Cache Size */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-white">
                                Transcode Cache Size
                            </label>
                            <span className="text-[#ecb200] font-semibold">
                                {settings.transcodeCacheMaxGb} GB
                            </span>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={50}
                            value={settings.transcodeCacheMaxGb}
                            onChange={(e) =>
                                onUpdate({
                                    transcodeCacheMaxGb: parseInt(
                                        e.target.value
                                    ),
                                })
                            }
                            className="w-full h-2 bg-[#0a0a0a] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#ecb200] [&::-webkit-slider-thumb]:hover:bg-[#d4a000] [&::-webkit-slider-thumb]:transition-colors [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#ecb200] [&::-moz-range-thumb]:hover:bg-[#d4a000] [&::-moz-range-thumb]:transition-colors [&::-moz-range-thumb]:border-0"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>1 GB</span>
                            <span>50 GB</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Maximum size for transcoded audio cache. Server
                            restart required for changes to take effect.
                        </p>
                    </div>

                    {/* Clear Cache Button */}
                    <div>
                        <Button
                            onClick={handleClearCaches}
                            disabled={clearingCaches}
                            variant="danger"
                        >
                            {clearingCaches
                                ? "Clearing..."
                                : "Clear All Caches"}
                        </Button>
                        <p className="text-xs text-gray-400 mt-2">
                            This will free up storage space by removing all
                            cached content
                        </p>
                    </div>
                </div>

                {/* Automation Settings */}
                <div className="space-y-4 pt-6 border-t border-[#1c1c1c]">
                    <h3 className="text-lg font-semibold text-white">
                        Automation
                    </h3>

                    {/* Auto Sync Library */}
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm font-medium text-white">
                                Auto Sync Library
                            </label>
                            <p className="text-xs text-gray-400 mt-1">
                                Automatically sync library changes
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.autoSync}
                                onChange={(e) =>
                                    onUpdate({ autoSync: e.target.checked })
                                }
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-[#1a1a1a] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#ecb200]/50 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ecb200]"></div>
                        </label>
                    </div>

                    {/* Auto Enrich Metadata */}
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm font-medium text-white">
                                Auto Enrich Metadata
                            </label>
                            <p className="text-xs text-gray-400 mt-1">
                                Automatically enrich metadata for new content
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.autoEnrichMetadata}
                                onChange={(e) =>
                                    onUpdate({
                                        autoEnrichMetadata: e.target.checked,
                                    })
                                }
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-[#1a1a1a] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#ecb200]/50 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ecb200]"></div>
                        </label>
                    </div>

                    {/* Sync & Enrich Button */}
                    <div className="pt-4">
                        <Button
                            onClick={handleSyncAndEnrich}
                            variant="primary"
                            disabled={syncing}
                            isLoading={syncing}
                        >
                            Sync & Enrich Everything Now
                        </Button>
                        <p className="text-xs text-gray-400 mt-2">
                            Manually trigger a full library sync and metadata
                            enrichment
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
