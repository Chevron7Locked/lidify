"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Plus, Loader2 } from "lucide-react";
import { PodcastPreview } from "../types";
import { formatDuration, formatDate } from "../utils";

// Lidify brand yellow for all on-page action buttons
const LIDIFY_YELLOW = "#ecb200";

interface PreviewEpisodesProps {
    previewData: PodcastPreview;
    colors: any;
    isSubscribing: boolean;
    onSubscribe: () => void;
}

export function PreviewEpisodes({
    previewData,
    colors,
    isSubscribing,
    onSubscribe,
}: PreviewEpisodesProps) {
    return (
        <section>
            <h2 className="text-2xl md:text-3xl font-bold mb-6">
                Latest Episodes
            </h2>

            {/* Episode Preview with Blur/Lock Effect */}
            <div className="relative">
                {previewData.previewEpisodes &&
                previewData.previewEpisodes.length > 0 ? (
                    <>
                        <Card>
                            <div className="divide-y divide-[#1c1c1c]">
                                {previewData.previewEpisodes.map(
                                    (episode, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center gap-4 px-4 py-3 opacity-60 cursor-not-allowed"
                                        >
                                            {/* Number */}
                                            <div className="w-10 flex items-center justify-center flex-shrink-0">
                                                <span className="text-sm text-gray-400">
                                                    {index + 1}
                                                </span>
                                            </div>

                                            {/* Episode Info */}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-medium truncate text-white">
                                                    {episode.title}
                                                </h3>
                                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                                    <span>
                                                        {formatDate(
                                                            episode.publishedAt
                                                        )}
                                                    </span>
                                                    {episode.duration > 0 && (
                                                        <>
                                                            <span>•</span>
                                                            <span>
                                                                {formatDuration(
                                                                    episode.duration
                                                                )}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </Card>

                        {/* Blur/Fade Overlay with Subscribe CTA */}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/80 to-[#0a0a0a] flex items-end justify-center pb-8 pointer-events-none">
                            <Button
                                variant="primary"
                                onClick={onSubscribe}
                                disabled={isSubscribing}
                                className="flex items-center gap-2 pointer-events-auto shadow-2xl"
                                style={{
                                    backgroundColor: LIDIFY_YELLOW,
                                    borderColor: LIDIFY_YELLOW,
                                    color: "#000000",
                                }}
                            >
                                {isSubscribing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Subscribing...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4" />
                                        Subscribe to Unlock All Episodes
                                    </>
                                )}
                            </Button>
                        </div>
                    </>
                ) : (
                    <Card className="p-6 md:p-8 text-center">
                        <p className="text-gray-400">
                            No episodes available for preview.
                        </p>
                        <Button
                            variant="primary"
                            onClick={onSubscribe}
                            disabled={isSubscribing}
                            className="flex items-center gap-2 mt-4 mx-auto"
                            style={{
                                backgroundColor: LIDIFY_YELLOW,
                                borderColor: LIDIFY_YELLOW,
                                color: "#000000",
                            }}
                        >
                            {isSubscribing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Subscribing...
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4" />
                                    Subscribe
                                </>
                            )}
                        </Button>
                    </Card>
                )}
            </div>

            {/* About Section */}
            {previewData.description && (
                <div className="mt-8">
                    <h2 className="text-2xl md:text-3xl font-bold mb-6">
                        About This Podcast
                    </h2>
                    <Card className="p-6 md:p-8">
                        <div
                            className="prose prose-invert prose-sm md:prose-base max-w-none"
                            dangerouslySetInnerHTML={{
                                __html: previewData.description,
                            }}
                        />
                    </Card>
                </div>
            )}
        </section>
    );
}
