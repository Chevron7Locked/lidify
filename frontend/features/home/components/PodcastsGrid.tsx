"use client";

import Link from "next/link";
import Image from "next/image";
import { Disc } from "lucide-react";
import { Podcast } from "../types";
import { memo } from "react";
import { api } from "@/lib/api";

interface PodcastsGridProps {
    podcasts: Podcast[];
}

interface PodcastCardProps {
    podcast: any;
    index: number;
}

// Always proxy images through the backend for caching and mobile compatibility
const getProxiedImageUrl = (podcast: any): string | null => {
    const imageUrl = podcast.coverUrl || podcast.coverArt || podcast.imageUrl;
    if (!imageUrl) return null;
    return api.getCoverArtUrl(imageUrl, 300);
};

const PodcastCard = memo(
    function PodcastCard({ podcast, index }: PodcastCardProps) {
        const imageUrl = getProxiedImageUrl(podcast);

        return (
            <Link
                href={`/podcasts/${podcast.id}`}
                data-tv-card
                data-tv-card-index={index}
                tabIndex={0}
            >
                <div className="bg-[#121212] hover:bg-[#181818] transition-all duration-200 p-4 rounded-md group cursor-pointer hover:shadow-xl">
                    <div className="aspect-square bg-[#181818] rounded-full mb-4 flex items-center justify-center overflow-hidden relative shadow-lg">
                        {imageUrl ? (
                            <Image
                                src={imageUrl}
                                alt={podcast.title}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                                className="object-cover group-hover:scale-110 transition-all"
                                unoptimized
                            />
                        ) : (
                            <Disc className="w-12 h-12 text-gray-600" />
                        )}
                    </div>
                    <h3 className="text-base font-bold text-white line-clamp-1 mb-1">
                        {podcast.title}
                    </h3>
                    <p className="text-sm text-[#b3b3b3] line-clamp-1">
                        {podcast.author || "Podcast"}
                    </p>
                </div>
            </Link>
        );
    },
    (prevProps, nextProps) => {
        return prevProps.podcast.id === nextProps.podcast.id && prevProps.index === nextProps.index;
    }
);

const PodcastsGrid = memo(function PodcastsGrid({
    podcasts,
}: PodcastsGridProps) {
    return (
        <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5 3xl:grid-cols-5 gap-4"
            data-tv-section="podcasts"
        >
            {podcasts.slice(0, 10).map((podcast: any, index) => (
                <PodcastCard key={podcast.id} podcast={podcast} index={index} />
            ))}
        </div>
    );
});

export { PodcastsGrid };
