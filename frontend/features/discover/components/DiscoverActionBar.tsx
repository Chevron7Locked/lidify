"use client";

import { Play, Pause, RefreshCw, Settings } from "lucide-react";
import { cn } from "@/utils/cn";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import type { DiscoverPlaylist, DiscoverConfig } from "../types";

interface BatchStatus {
    active: boolean;
    status: "downloading" | "scanning" | null;
    progress?: number;
    completed?: number;
    failed?: number;
    total?: number;
}

interface DiscoverActionBarProps {
    playlist: DiscoverPlaylist | null;
    config: DiscoverConfig | null;
    isPlaylistPlaying: boolean;
    isPlaying: boolean;
    onPlayToggle: () => void;
    onGenerate: () => void;
    onToggleSettings: () => void;
    isGenerating: boolean;
    batchStatus?: BatchStatus | null;
}

export function DiscoverActionBar({
    playlist,
    config,
    isPlaylistPlaying,
    isPlaying,
    onPlayToggle,
    onGenerate,
    onToggleSettings,
    isGenerating,
    batchStatus,
}: DiscoverActionBarProps) {
    const getStatusText = () => {
        if (!isGenerating) return null;
        
        if (batchStatus?.status === "scanning") {
            return "Importing tracks...";
        }
        
        if (batchStatus?.total) {
            return `Downloading ${batchStatus.completed || 0}/${batchStatus.total}`;
        }
        
        return "Starting...";
    };

    return (
        <div className="sticky top-0 z-30 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6">
                <div className="flex items-center gap-3 md:gap-4">
                    {playlist && playlist.tracks.length > 0 && (
                        <button
                            onClick={onPlayToggle}
                            disabled={isGenerating}
                            className={cn(
                                "h-14 w-14 rounded-full flex items-center justify-center shadow-xl transition-all border border-white/10 backdrop-blur-sm",
                                isGenerating
                                    ? "bg-white/5 cursor-not-allowed opacity-50"
                                    : "bg-white/10 hover:bg-white/15 hover:scale-105"
                            )}
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
                        disabled={isGenerating || !config?.enabled}
                        className={cn(
                            "flex items-center gap-2 px-4 md:px-6 py-3 rounded-full text-white text-sm font-semibold transition-all shadow-xl border backdrop-blur-sm",
                            isGenerating || !config?.enabled
                                ? "bg-white/5 border-white/10 cursor-not-allowed opacity-50"
                                : "bg-purple-600/20 hover:bg-purple-600/30 border-purple-500/30 hover:scale-105"
                        )}
                    >
                        {isGenerating ? (
                            <>
                                <GradientSpinner size="sm" />
                                <span className="hidden sm:inline">{getStatusText()}</span>
                                <span className="sm:hidden">
                                    {batchStatus?.completed || 0}/{batchStatus?.total || "?"}
                                </span>
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-4 h-4" />
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
                        disabled={isGenerating}
                        className={cn(
                            "flex items-center gap-2 px-4 md:px-6 py-3 rounded-full text-white text-sm font-semibold transition-all backdrop-blur-sm border border-white/10",
                            isGenerating
                                ? "bg-white/5 cursor-not-allowed opacity-50"
                                : "bg-white/5 hover:bg-white/10"
                        )}
                    >
                        <Settings className="w-4 h-4" />
                        <span className="hidden sm:inline">Settings</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
