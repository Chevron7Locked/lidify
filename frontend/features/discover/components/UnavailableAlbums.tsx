import { useState } from "react";
import { Play, Pause, Music, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/utils/cn";
import { UnavailableAlbum } from "../types";

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

interface UnavailableAlbumsProps {
    unavailable: UnavailableAlbum[];
    currentPreview: string | null;
    onTogglePreview: (albumId: string, previewUrl: string) => void;
}

export function UnavailableAlbums({
    unavailable,
    currentPreview,
    onTogglePreview,
}: UnavailableAlbumsProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!unavailable || unavailable.length === 0) {
        return null;
    }

    return (
        <Card>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex items-center justify-between hover:bg-[#1a1a1a] transition-colors rounded-lg"
            >
                <div className="flex items-center gap-2">
                    <Music className="w-5 h-5 text-orange-400" />
                    <span className="text-sm font-medium text-gray-400">
                        {unavailable.length} album{unavailable.length !== 1 ? "s" : ""} unavailable
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
            </button>
            {isExpanded && (
                <>
                    <div className="px-6 pb-4">
                        <p className="text-sm text-gray-400">
                            These albums were recommended but couldn't be found by your indexers.
                            Listen to 30-second previews below!
                        </p>
                    </div>
                    <div className="divide-y divide-[#1c1c1c]">
                {unavailable.map((album) => {
                    const isPreviewPlaying = currentPreview === album.id;
                    const attemptLabel =
                        album.attemptNumber === 0
                            ? "Original Recommendation"
                            : `Replacement #${album.attemptNumber}`;

                    return (
                        <div
                            key={album.id}
                            className={cn(
                                "flex items-center gap-4 px-4 py-3 hover:bg-[#1a1a1a] transition-colors group",
                                album.attemptNumber > 0 &&
                                    "pl-12 bg-[#1a1a1a]/30"
                            )}
                        >
                            <div className="w-8 flex items-center justify-center">
                                {album.previewUrl ? (
                                    <button
                                        onClick={() =>
                                            onTogglePreview(
                                                album.id,
                                                album.previewUrl!
                                            )
                                        }
                                        className="w-8 h-8 flex items-center justify-center"
                                    >
                                        {isPreviewPlaying ? (
                                            <Pause className="w-4 h-4 text-orange-400 fill-current" />
                                        ) : (
                                            <Play className="w-4 h-4 text-orange-400 fill-current ml-0.5" />
                                        )}
                                    </button>
                                ) : (
                                    <Music className="w-4 h-4 text-gray-600" />
                                )}
                            </div>

                            <div className="w-12 h-12 bg-[#181818] rounded flex items-center justify-center shrink-0">
                                <Music className="w-6 h-6 text-gray-600" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-white truncate">
                                    {album.album}
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-gray-400 truncate">
                                    <span>{album.artist}</span>
                                    {album.previewUrl && (
                                        <>
                                            <span>•</span>
                                            <span className="text-orange-400">
                                                30s Preview
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="hidden md:flex items-center gap-2">
                                <span
                                    className={cn(
                                        "px-2 py-1 rounded-full text-xs font-medium bg-white/5",
                                        tierColors[album.tier]
                                    )}
                                >
                                    {tierLabels[album.tier]}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        "px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                                        album.attemptNumber === 0
                                            ? "bg-orange-500/20 border border-orange-500/30 text-orange-400"
                                            : "bg-blue-500/20 border border-blue-500/30 text-blue-400"
                                    )}
                                >
                                    {attemptLabel}
                                </span>
                            </div>
                        </div>
                    );
                })}
                    </div>
                </>
            )}
        </Card>
    );
}
