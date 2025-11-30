"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Mic2 } from "lucide-react";
import { SimilarPodcast } from "../types";
import { api } from "@/lib/api";

interface SimilarPodcastsProps {
    podcasts: SimilarPodcast[];
}

// Always proxy images through the backend for caching and mobile compatibility
const getProxiedImageUrl = (imageUrl: string | undefined): string | null => {
    if (!imageUrl) return null;
    return api.getCoverArtUrl(imageUrl, 300);
};

export function SimilarPodcasts({ podcasts }: SimilarPodcastsProps) {
    const router = useRouter();

    if (!podcasts || podcasts.length === 0) {
        return null;
    }

    return (
        <section>
            <h2 className="text-2xl md:text-3xl font-bold mb-6">
                Fans Also Like
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {podcasts.map((podcast) => {
                    const imageUrl = getProxiedImageUrl(podcast.coverUrl);
                    return (
                        <div
                            key={podcast.id}
                            className="bg-gradient-to-br from-[#121212] to-[#121212] hover:from-[#181818] hover:to-[#1a1a1a] transition-all p-4 rounded-lg cursor-pointer group border border-[#1c1c1c]"
                            onClick={() => router.push(`/podcasts/${podcast.id}`)}
                        >
                            <div className="w-full aspect-square bg-[#181818] rounded-full mb-3 overflow-hidden relative">
                                {imageUrl ? (
                                    <Image
                                        src={imageUrl}
                                        alt={podcast.title}
                                        fill
                                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                                        className="object-cover group-hover:scale-105 transition-transform"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Mic2 className="w-12 h-12 text-gray-600" />
                                    </div>
                                )}
                            </div>
                            <h3 className="font-bold text-white truncate text-sm">
                                {podcast.title}
                            </h3>
                            <p className="text-xs text-gray-400 truncate">
                                {podcast.author}
                            </p>
                            {podcast.episodeCount && podcast.episodeCount > 0 && (
                                <p className="text-xs text-gray-500 truncate">
                                    {podcast.episodeCount} episodes
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
            {/* Attribution for Listen Notes */}
            <div className="text-xs text-gray-500 mt-4 text-center">
                Recommendations powered by{" "}
                <a
                    href="https://www.listennotes.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                    Listen Notes
                </a>
            </div>
        </section>
    );
}

