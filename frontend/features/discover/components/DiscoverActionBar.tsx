"use client";

import { Play, Pause, RotateCw, Settings } from "lucide-react";
import { cn } from "@/utils/cn";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import type { DiscoverPlaylist, DiscoverConfig } from "../types";

interface DiscoverActionBarProps {
    playlist: DiscoverPlaylist | null;
    config: DiscoverConfig | null;
    isPlaylistPlaying: boolean;
    isPlaying: boolean;
    onPlayToggle: () => void;
    onGenerate: () => void;
    onToggleSettings: () => void;
    isPolling: boolean;
    jobStatus?: { progress?: number } | null;
}

export function DiscoverActionBar({
    playlist,
    config,
    isPlaylistPlaying,
    isPlaying,
    onPlayToggle,
    onGenerate,
    onToggleSettings,
    isPolling,
    jobStatus,
}: DiscoverActionBarProps) {
    return (
        <div className="sticky top-0 z-30 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6">
                <div className="flex items-center gap-3 md:gap-4">
                    {playlist && playlist.tracks.length > 0 && (
                        <button
                            onClick={onPlayToggle}
                            className="h-14 w-14 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center shadow-xl hover:scale-105 transition-all border border-white/10 backdrop-blur-sm"
                        >
                            {isPlaylistPlaying && isPlaying ? (
                                <Pause className="w-6 h-6 text-white fill-current" />
                            ) : (
                                <Play className="w-6 h-6 text-white fill-current ml-0.5" />
                            )}
                        </button>
                    )}

                    <button
                        onClick={onGenerate}
                        disabled={isPolling || !config?.enabled}
                        className={cn(
                            "flex items-center gap-2 px-4 md:px-6 py-3 rounded-full text-white text-sm font-semibold transition-all shadow-xl hover:scale-105 border backdrop-blur-sm",
                            isPolling || !config?.enabled
                                ? "bg-white/5 border-white/10 cursor-not-allowed opacity-50"
                                : "bg-purple-600/20 hover:bg-purple-600/30 border-purple-500/30"
                        )}
                    >
                        {isPolling ? (
                            <>
                                <GradientSpinner size="sm" />
                                Generating... {jobStatus?.progress || 0}%
                            </>
                        ) : (
                            <>
                                <RotateCw className="w-4 h-4" />
                                <span className="hidden sm:inline">
                                    {playlist
                                        ? "Regenerate"
                                        : "Generate Playlist"}
                                </span>
                                <span className="sm:hidden">Generate</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={onToggleSettings}
                        className="flex items-center gap-2 px-4 md:px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full text-white text-sm font-semibold transition-all backdrop-blur-sm border border-white/10"
                    >
                        <Settings className="w-4 h-4" />
                        <span className="hidden sm:inline">Settings</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
