"use client";

import { useState } from "react";
import { Music2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { useAuth } from "@/lib/auth-context";
import { useAudio } from "@/lib/audio-context";
import { useDiscoverData } from "@/features/discover/hooks/useDiscoverData";
import { useDiscoverActions } from "@/features/discover/hooks/useDiscoverActions";
import { usePreviewPlayer } from "@/features/discover/hooks/usePreviewPlayer";
import { DiscoverHero } from "@/features/discover/components/DiscoverHero";
import { DiscoverActionBar } from "@/features/discover/components/DiscoverActionBar";
import { DiscoverSettings } from "@/features/discover/components/DiscoverSettings";
import { TrackList } from "@/features/discover/components/TrackList";
import { UnavailableAlbums } from "@/features/discover/components/UnavailableAlbums";
import { HowItWorks } from "@/features/discover/components/HowItWorks";

export default function DiscoverWeeklyPage() {
    const { currentTrack, isPlaying } = useAudio();
    const [showSettings, setShowSettings] = useState(false);

    // Custom hooks
    const { playlist, config, setConfig, loading, reloadData } = useDiscoverData();
    const {
        handleGenerate,
        handleLike,
        handlePlayPlaylist,
        handlePlayTrack,
        handleTogglePlay,
        isPolling,
        jobStatus,
    } = useDiscoverActions(playlist, reloadData);
    const { currentPreview, handleTogglePreview } = usePreviewPlayer();

    // Check if we're playing from this playlist
    const isPlaylistPlaying = playlist?.tracks.some(
        (t) => t.id === currentTrack?.id
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <GradientSpinner size="md" />
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            <DiscoverHero playlist={playlist} config={config} />

            <DiscoverActionBar
                playlist={playlist}
                config={config}
                isPlaylistPlaying={isPlaylistPlaying || false}
                isPlaying={isPlaying}
                onPlayToggle={isPlaylistPlaying && isPlaying ? handleTogglePlay : handlePlayPlaylist}
                onGenerate={handleGenerate}
                onToggleSettings={() => setShowSettings(!showSettings)}
                isPolling={isPolling}
                jobStatus={jobStatus}
            />

            {showSettings && (
                <DiscoverSettings
                    config={config}
                    onUpdateConfig={setConfig}
                    onPlaylistCleared={reloadData}
                />
            )}

            {/* Content */}
            <div className="relative">
                {/* Subtle gradient from hero */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            "linear-gradient(to bottom, #a855f710 0%, #ec489908 15%, #eab30805 30%, transparent 50%)",
                    }}
                />

                <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
                    {playlist && playlist.tracks.length > 0 ? (
                        <div className="space-y-6">
                            <TrackList
                                tracks={playlist.tracks}
                                currentTrack={currentTrack}
                                isPlaying={isPlaying}
                                onPlayTrack={handlePlayTrack}
                                onTogglePlay={handleTogglePlay}
                                onLike={handleLike}
                            />

                            <UnavailableAlbums
                                unavailable={playlist.unavailable}
                                currentPreview={currentPreview}
                                onTogglePreview={handleTogglePreview}
                            />

                            <HowItWorks />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-24 h-24 bg-gradient-to-br from-purple-600/20 to-yellow-600/20 rounded-full flex items-center justify-center mb-6 shadow-xl border border-white/10">
                                <Music2 className="w-12 h-12 text-purple-400" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">
                                No Discover Weekly Yet
                            </h3>
                            <p className="text-sm text-gray-400 mb-6 max-w-md">
                                Generate your first playlist based on your
                                listening history!
                            </p>
                            <button
                                onClick={handleGenerate}
                                disabled={isPolling}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold transition-all shadow-xl border backdrop-blur-sm",
                                    isPolling
                                        ? "bg-white/5 border-white/10 cursor-not-allowed opacity-50"
                                        : "bg-purple-600/20 hover:bg-purple-600/30 border-purple-500/30 hover:scale-105"
                                )}
                            >
                                {isPolling ? (
                                    <>
                                        <GradientSpinner size="sm" />
                                        Generating... {jobStatus?.progress || 0}
                                        %
                                    </>
                                ) : (
                                    <>
                                        <Music2 className="w-5 h-5" />
                                        Generate Now
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
