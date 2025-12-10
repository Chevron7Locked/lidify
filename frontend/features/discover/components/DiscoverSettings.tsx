"use client";

import { useState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import type { DiscoverConfig } from "../types";

interface DiscoverSettingsProps {
    config: DiscoverConfig | null;
    onUpdateConfig: (updatedConfig: DiscoverConfig | null) => void;
    onPlaylistCleared?: () => void;
}

export function DiscoverSettings({
    config,
    onUpdateConfig,
    onPlaylistCleared,
}: DiscoverSettingsProps) {
    const [isClearing, setIsClearing] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Generic handler for config changes with debounce
    function handleConfigChange<K extends keyof DiscoverConfig>(key: K, value: DiscoverConfig[K]) {
        // Update local state immediately for responsive UI
        if (config) {
            onUpdateConfig({ ...config, [key]: value });
        }

        // Debounce the API call
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(async () => {
            try {
                await api.updateDiscoverConfig({ [key]: value });
            } catch (error) {
                toast.error("Failed to save setting");
            }
        }, 500);
    }

    async function handleClearPlaylist() {
        if (isClearing) return;

        const confirmed = window.confirm(
            "Clear Discovery Playlist?\n\n" +
            "• Liked albums will be moved to your library\n" +
            "• Non-liked albums will be deleted\n\n" +
            "This action cannot be undone."
        );

        if (!confirmed) return;

        setIsClearing(true);
        try {
            const result = await api.clearDiscoverPlaylist();

            if (result.likedMoved > 0 && result.activeDeleted > 0) {
                toast.success(
                    `Moved ${result.likedMoved} liked album${result.likedMoved !== 1 ? "s" : ""} to library, deleted ${result.activeDeleted} album${result.activeDeleted !== 1 ? "s" : ""}`
                );
            } else if (result.likedMoved > 0) {
                toast.success(
                    `Moved ${result.likedMoved} liked album${result.likedMoved !== 1 ? "s" : ""} to library`
                );
            } else if (result.activeDeleted > 0) {
                toast.success(
                    `Deleted ${result.activeDeleted} album${result.activeDeleted !== 1 ? "s" : ""}`
                );
            } else {
                toast.info("No albums to clear");
            }

            onPlaylistCleared?.();
        } catch (error) {
            toast.error("Failed to clear playlist");
        } finally {
            setIsClearing(false);
        }
    }

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
            <Card className="p-6">
                <h2 className="text-xl font-bold mb-4">Settings</h2>
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Playlist Size: {config?.playlistSize || 10} songs
                        </label>
                        <input
                            type="range"
                            min="5"
                            max="50"
                            step="5"
                            value={config?.playlistSize || 10}
                            onChange={(e) =>
                                handleConfigChange("playlistSize", parseInt(e.target.value))
                            }
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                        />
                        <p className="text-xs text-gray-400 mt-2">
                            One song per album. Larger = more discovery.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Download Buffer: {((config?.downloadRatio ?? 1.3) * 100 - 100).toFixed(0)}% extra
                        </label>
                        <input
                            type="range"
                            min="1.0"
                            max="2.0"
                            step="0.1"
                            value={config?.downloadRatio ?? 1.3}
                            onChange={(e) =>
                                handleConfigChange("downloadRatio", parseFloat(e.target.value))
                            }
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                        />
                        <p className="text-xs text-gray-400 mt-2">
                            Extra albums to download in case some fail. Higher = more reliable, but uses more bandwidth.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Album Exclusion: {
                                (config?.exclusionMonths ?? 6) === 0 
                                    ? "Disabled" 
                                    : `${config?.exclusionMonths ?? 6} months`
                            }
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="12"
                            step="1"
                            value={config?.exclusionMonths ?? 6}
                            onChange={(e) =>
                                handleConfigChange("exclusionMonths", parseInt(e.target.value))
                            }
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                        />
                        <p className="text-xs text-gray-400 mt-2">
                            How long to wait before recommending the same album again. Set to 0 to disable.
                        </p>
                    </div>

                    {/* Clear Playlist */}
                    <div className="pt-4 border-t border-white/10">
                        <label className="block text-sm font-medium mb-2">
                            Clear Playlist
                        </label>
                        <p className="text-xs text-gray-400 mb-3">
                            Remove the current playlist. Liked albums will be moved
                            to your library, non-liked albums will be deleted.
                        </p>
                        <button
                            onClick={handleClearPlaylist}
                            disabled={isClearing}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isClearing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                            {isClearing ? "Clearing..." : "Remove Playlist"}
                        </button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
