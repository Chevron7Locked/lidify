"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Play, Pause, Check, ArrowUpDown } from "lucide-react";
import { cn } from "@/utils/cn";
import { Podcast, Episode } from "../types";
import { formatDuration, formatDate } from "../utils";

interface EpisodeListProps {
    podcast: Podcast;
    episodes: Episode[];
    sortOrder: "newest" | "oldest";
    onSortOrderChange: (order: "newest" | "oldest") => void;
    isEpisodePlaying: (episodeId: string) => boolean;
    isPlaying: boolean;
    onPlayPause: (episode: Episode) => void;
    onPlay: (episode: Episode) => void;
}

export function EpisodeList({
    podcast,
    episodes,
    sortOrder,
    onSortOrderChange,
    isEpisodePlaying,
    isPlaying,
    onPlayPause,
    onPlay,
}: EpisodeListProps) {
    return (
        <section>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-white">
                    All Episodes
                </h2>
                <Button
                    variant="secondary"
                    onClick={() =>
                        onSortOrderChange(
                            sortOrder === "newest" ? "oldest" : "newest"
                        )
                    }
                    className="flex items-center gap-2"
                >
                    <ArrowUpDown className="w-4 h-4" />
                    {sortOrder === "newest" ? "Newest First" : "Oldest First"}
                </Button>
            </div>
            <Card>
                <div className="divide-y divide-[#1c1c1c]">
                    {episodes.map((episode, index) => {
                        const isCurrentEpisode = isEpisodePlaying(episode.id);
                        const isInProgress =
                            episode.progress &&
                            !episode.progress.isFinished &&
                            episode.progress.currentTime > 0;

                        return (
                            <div
                                key={episode.id}
                                className={cn(
                                    "group relative",
                                    isCurrentEpisode && "bg-[#1a1a1a]"
                                )}
                            >
                                {/* Progress bar at the bottom of each episode */}
                                {episode.progress &&
                                    episode.progress.progress > 0 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                                            <div
                                                className="h-full bg-purple-500/50 transition-all"
                                                style={{
                                                    width: `${episode.progress.progress}%`,
                                                }}
                                            />
                                        </div>
                                    )}

                                <div
                                    onClick={() => {
                                        if (!isCurrentEpisode) {
                                            onPlay(episode);
                                        }
                                    }}
                                    className={cn(
                                        "flex items-center gap-4 px-4 py-3 hover:bg-[#1a1a1a] transition-colors cursor-pointer border-l-2",
                                        isCurrentEpisode
                                            ? "border-purple-500"
                                            : "border-transparent"
                                    )}
                                >
                                    {/* Number / Play/Pause Icon */}
                                    <div className="w-10 flex items-center justify-center flex-shrink-0">
                                        {episode.progress?.isFinished ? (
                                            <Check className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <>
                                                <span
                                                    className={cn(
                                                        "text-sm",
                                                        isCurrentEpisode &&
                                                            isPlaying
                                                            ? "hidden"
                                                            : "group-hover:hidden",
                                                        isCurrentEpisode
                                                            ? "text-purple-400 font-bold"
                                                            : "text-gray-400"
                                                    )}
                                                >
                                                    {index + 1}
                                                </span>
                                                {isCurrentEpisode &&
                                                isPlaying ? (
                                                    <Pause
                                                        className="w-4 h-4 text-purple-400 cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onPlayPause(
                                                                episode
                                                            );
                                                        }}
                                                    />
                                                ) : (
                                                    <Play
                                                        className={cn(
                                                            "w-4 h-4 cursor-pointer",
                                                            isCurrentEpisode
                                                                ? "text-purple-400"
                                                                : "text-white hidden group-hover:block"
                                                        )}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onPlayPause(
                                                                episode
                                                            );
                                                        }}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Episode Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3
                                            className={cn(
                                                "font-medium truncate",
                                                isCurrentEpisode
                                                    ? "text-purple-400"
                                                    : "text-white"
                                            )}
                                        >
                                            {episode.title}
                                        </h3>
                                        <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
                                            <span>
                                                {formatDate(
                                                    episode.publishedAt
                                                )}
                                            </span>
                                            {episode.season && (
                                                <>
                                                    <span>•</span>
                                                    <span>
                                                        S{episode.season}
                                                    </span>
                                                </>
                                            )}
                                            {episode.episodeNumber && (
                                                <>
                                                    <span>•</span>
                                                    <span>
                                                        E{episode.episodeNumber}
                                                    </span>
                                                </>
                                            )}
                                            {episode.progress?.isFinished && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-green-400 flex items-center gap-1">
                                                        <Check className="w-3 h-3" />{" "}
                                                        Finished
                                                    </span>
                                                </>
                                            )}
                                            {isInProgress &&
                                                episode.progress && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-purple-400">
                                                            {Math.floor(
                                                                episode.progress
                                                                    .progress
                                                            )}
                                                            % complete
                                                        </span>
                                                    </>
                                                )}
                                        </div>
                                    </div>

                                    {/* Duration */}
                                    <span className="text-sm text-gray-400 w-16 text-right flex-shrink-0">
                                        {formatDuration(episode.duration)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>
        </section>
    );
}












