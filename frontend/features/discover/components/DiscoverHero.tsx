import { Music2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { DiscoverPlaylist, DiscoverConfig } from "../types";

interface DiscoverHeroProps {
    playlist: DiscoverPlaylist | null;
    config: DiscoverConfig | null;
}

export function DiscoverHero({ playlist, config }: DiscoverHeroProps) {
    return (
        <div className="relative h-[450px] md:h-[45vh] lg:h-[50vh] md:min-h-[340px] md:max-h-[450px] overflow-hidden">
            {/* Purple to Yellow gradient background */}
            <div className="absolute inset-0">
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            "linear-gradient(135deg, #a855f740 0%, #ec489950 30%, #eab30830 60%, #0a0a0a 100%)",
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />
            </div>

            {/* Content */}
            <div className="relative h-full max-w-7xl mx-auto px-4 md:px-8 flex items-center md:items-end justify-center md:justify-start pb-6 md:pb-8">
                <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 w-full text-center md:text-left">
                    {/* Icon */}
                    <div className="w-[172px] h-[172px] md:w-56 md:h-56 bg-gradient-to-br from-purple-600/20 to-yellow-600/20 rounded-lg shadow-2xl shrink-0 flex items-center justify-center border border-white/10">
                        <Music2 className="w-20 h-20 md:w-24 md:h-24 text-purple-400" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 pb-2 space-y-2 md:space-y-4 max-w-full md:max-w-none">
                        <div className="text-sm md:text-base font-bold text-white/90 drop-shadow-lg">
                            Playlist
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white drop-shadow-2xl leading-tight">
                            Discover Weekly
                        </h1>

                        <p className="text-sm md:text-base text-white/80 drop-shadow-lg leading-relaxed">
                            Your personalized playlist of new music,
                            algorithmically curated based on your listening
                            history.
                        </p>

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-white/90 font-medium">
                            {playlist && (
                                <>
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        Week of{" "}
                                        {format(
                                            new Date(playlist.weekStart),
                                            "MMM d, yyyy"
                                        )}
                                    </div>
                                    <span>•</span>
                                    <span>{playlist.totalCount} songs</span>
                                    {playlist.unavailableCount > 0 && (
                                        <>
                                            <span>•</span>
                                            <span className="text-orange-400/90">
                                                {playlist.unavailableCount}{" "}
                                                unavailable
                                            </span>
                                        </>
                                    )}
                                </>
                            )}
                            {config?.lastGeneratedAt && (
                                <>
                                    <span>•</span>
                                    <span>
                                        Updated{" "}
                                        {format(
                                            new Date(
                                                config.lastGeneratedAt
                                            ),
                                            "MMM d"
                                        )}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
