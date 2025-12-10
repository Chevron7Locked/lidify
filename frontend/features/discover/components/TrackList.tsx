import { Play, Pause, Heart, Music } from "lucide-react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { cn, isLocalUrl } from "@/utils/cn";
import { DiscoverTrack } from "../types";
import { api } from "@/lib/api";

const tierColors: Record<string, string> = {
    high: "text-green-400",
    medium: "text-yellow-400",
    explore: "text-orange-400",
    wildcard: "text-purple-400",
    // Legacy mappings
    low: "text-orange-400",
    wild: "text-purple-400",
};

const tierLabels: Record<string, string> = {
    high: "High Match",
    medium: "Medium Match",
    explore: "Explore",
    wildcard: "Wild Card",
    // Legacy mappings
    low: "Explore",
    wild: "Wild Card",
};

interface TrackListProps {
    tracks: DiscoverTrack[];
    currentTrack?: { id: string } | null;
    isPlaying: boolean;
    onPlayTrack: (index: number) => void;
    onTogglePlay: () => void;
    onLike: (track: DiscoverTrack) => void;
}

export function TrackList({
    tracks,
    currentTrack,
    isPlaying,
    onPlayTrack,
    onTogglePlay,
    onLike,
}: TrackListProps) {
    return (
        <Card>
            <div className="divide-y divide-[#1c1c1c]">
                {tracks.map((track, index) => {
                    const isTrackPlaying = currentTrack?.id === track.id;
                    return (
                        <div
                            key={track.id}
                            className={cn(
                                "flex items-center gap-4 px-4 py-3 transition-colors group border-l-2 cursor-pointer hover:bg-[#1a1a1a]",
                                isTrackPlaying
                                    ? "bg-[#1a1a1a] border-purple-500"
                                    : "border-transparent"
                            )}
                        >
                            <div className="w-10 flex items-center justify-center">
                                <button
                                    onClick={() =>
                                        isTrackPlaying && isPlaying
                                            ? onTogglePlay()
                                            : onPlayTrack(index)
                                    }
                                    className="w-8 h-8 flex items-center justify-center"
                                >
                                    {isTrackPlaying && isPlaying ? (
                                        <Pause className="w-4 h-4 text-white fill-current" />
                                    ) : (
                                        <Play className="w-4 h-4 hidden group-hover:block text-white fill-current ml-0.5" />
                                    )}
                                </button>
                                <span className="text-sm text-gray-400 group-hover:hidden">
                                    {index + 1}
                                </span>
                            </div>

                            <div className="relative w-12 h-12 bg-[#181818] rounded flex items-center justify-center shrink-0 overflow-hidden">
                                {track.coverUrl ? (
                                    <Image
                                        src={api.getCoverArtUrl(track.coverUrl, 48)}
                                        alt={track.album}
                                        fill
                                        sizes="48px"
                                        className="object-cover"
                                        unoptimized
                                    />
                                ) : (
                                    <Music className="w-6 h-6 text-gray-600" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0 max-w-[40%]">
                                <h3
                                    className={cn(
                                        "font-medium truncate",
                                        isTrackPlaying
                                            ? "text-purple-400"
                                            : "text-white"
                                    )}
                                >
                                    {track.title}
                                </h3>
                                <p className="text-sm text-gray-400 truncate">
                                    {track.artist}
                                </p>
                            </div>

                            <div className="hidden md:block w-48 lg:w-64 shrink-0 text-left">
                                <p className="text-sm text-gray-400 truncate">
                                    {track.album}
                                </p>
                            </div>

                            <div className="hidden lg:block w-28 shrink-0 text-right">
                                <span
                                    className={cn(
                                        "px-2 py-1 rounded-full text-xs font-medium bg-white/5",
                                        tierColors[track.tier]
                                    )}
                                >
                                    {tierLabels[track.tier]}
                                </span>
                            </div>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLike(track);
                                }}
                                className={cn(
                                    "p-2 rounded-full transition-all",
                                    track.isLiked
                                        ? "bg-purple-600/20 text-purple-400 hover:bg-purple-600/30"
                                        : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                                )}
                                title={
                                    track.isLiked ? "Unlike" : "Keep in library"
                                }
                            >
                                <Heart
                                    className={cn(
                                        "w-4 h-4",
                                        track.isLiked && "fill-current"
                                    )}
                                />
                            </button>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
