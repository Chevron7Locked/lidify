"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Play, Pause, Clock, Calendar } from "lucide-react";
import { Podcast, Episode } from "../types";
import { formatDuration, formatDate } from "../utils";

interface ContinueListeningProps {
    podcast: Podcast;
    inProgressEpisodes: Episode[];
    sortedEpisodes: Episode[];
    isEpisodePlaying: (episodeId: string) => boolean;
    isPlaying: boolean;
    onPlayEpisode: (episode: Episode) => void;
    onPlayPause: (episode: Episode) => void;
}

export function ContinueListening({
    podcast,
    inProgressEpisodes,
    sortedEpisodes,
    isEpisodePlaying,
    isPlaying,
    onPlayEpisode,
    onPlayPause,
}: ContinueListeningProps) {
    if (inProgressEpisodes.length === 0) {
        return null;
    }

    // Get the most recently played episode
    const recentEpisode = inProgressEpisodes.reduce((prev, current) => {
        const prevDate = new Date(prev.progress?.lastPlayedAt || 0);
        const currentDate = new Date(current.progress?.lastPlayedAt || 0);
        return currentDate > prevDate ? current : prev;
    });

    // Find the index in sorted episodes
    const currentIndex = sortedEpisodes.findIndex(
        (ep) => ep.id === recentEpisode.id
    );
    const previousEpisode =
        currentIndex > 0 ? sortedEpisodes[currentIndex - 1] : null;
    const nextEpisode =
        currentIndex < sortedEpisodes.length - 1
            ? sortedEpisodes[currentIndex + 1]
            : null;

    const isCurrentPlaying = isEpisodePlaying(recentEpisode.id);

    return (
        <section>
            <h2 className="text-2xl md:text-3xl font-bold mb-6">
                Continue Listening
            </h2>
            <div className="space-y-3">
                {/* Previous Episode - Faded */}
                {previousEpisode && (
                    <Card
                        className="p-3 hover:bg-white/5 transition-all cursor-pointer opacity-50 hover:opacity-70 border border-white/5"
                        onClick={() => onPlayEpisode(previousEpisode)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                                <Play className="w-3 h-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-white truncate text-sm">
                                    {previousEpisode.title}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Previous episode
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Current Episode - Prominent */}
                <Card
                    className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-900/5 border-2 border-purple-500/30 hover:border-purple-500/50 transition-all cursor-pointer"
                    onClick={() => onPlayPause(recentEpisode)}
                >
                    <div className="flex items-center gap-4">
                        <Button
                            variant="primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                onPlayPause(recentEpisode);
                            }}
                            className="flex-shrink-0 w-12 h-12"
                        >
                            {isCurrentPlaying && isPlaying ? (
                                <Pause className="w-5 h-5" />
                            ) : (
                                <Play className="w-5 h-5" />
                            )}
                        </Button>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white truncate">
                                {recentEpisode.title}
                            </h3>
                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(recentEpisode.duration)}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(recentEpisode.publishedAt)}
                                </span>
                            </div>
                            {/* Progress Bar */}
                            {recentEpisode.progress && (
                                <div className="mt-3">
                                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                                        <span>
                                            {Math.floor(
                                                recentEpisode.progress.progress
                                            )}
                                            % complete
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-black/30 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-purple-500 rounded-full transition-all"
                                            style={{
                                                width: `${recentEpisode.progress.progress}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Next Episode - Faded */}
                {nextEpisode && (
                    <Card
                        className="p-3 hover:bg-white/5 transition-all cursor-pointer opacity-50 hover:opacity-70 border border-white/5"
                        onClick={() => onPlayEpisode(nextEpisode)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                                <Play className="w-3 h-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-white truncate text-sm">
                                    {nextEpisode.title}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Next episode
                                </p>
                            </div>
                        </div>
                    </Card>
                )}
            </div>
        </section>
    );
}












