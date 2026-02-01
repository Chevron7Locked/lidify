"use client";

import Link from "next/link";
import Image from "next/image";
import { Music } from "lucide-react";
import { api } from "@/lib/api";
import { HorizontalCarousel, CarouselItem } from "@/components/ui/HorizontalCarousel";
import { memo } from "react";

interface PopularArtist {
    id?: string;
    name: string;
    image?: string;
    listeners?: number;
}

interface PopularArtistsGridProps {
    artists: PopularArtist[];
}

// Always proxy images through the backend for caching and mobile compatibility
const getProxiedImageUrl = (imageUrl: string | undefined): string | null => {
    if (!imageUrl) return null;
    return api.getCoverArtUrl(imageUrl, 300);
};

interface PopularArtistCardProps {
    artist: PopularArtist;
    index: number;
}

const PopularArtistCard = memo(function PopularArtistCard({ 
    artist, 
    index 
}: PopularArtistCardProps) {
    const imageUrl = getProxiedImageUrl(artist.image);
    
    return (
        <CarouselItem>
            <Link
                href={`/search?q=${encodeURIComponent(artist.name)}`}
                data-tv-card
                data-tv-card-index={index}
                tabIndex={0}
            >
                <div className="p-3 rounded-md group cursor-pointer hover:bg-white/5 transition-colors">
                    <div className="aspect-square bg-[#282828] rounded-full mb-3 flex items-center justify-center overflow-hidden relative shadow-lg">
                        {imageUrl ? (
                            <Image
                                src={imageUrl}
                                alt={artist.name}
                                fill
                                sizes="180px"
                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                unoptimized
                            />
                        ) : (
                            <Music className="w-10 h-10 text-gray-600" />
                        )}
                    </div>
                    <h3 className="text-sm font-semibold text-white truncate">
                        {artist.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {artist.listeners?.toLocaleString()} listeners
                    </p>
                </div>
            </Link>
        </CarouselItem>
    );
});

export const PopularArtistsGrid = memo(function PopularArtistsGrid({
    artists
}: PopularArtistsGridProps) {
    return (
        <HorizontalCarousel>
            {artists.map((artist, index) => (
                <PopularArtistCard
                    key={artist.id || artist.name}
                    artist={artist}
                    index={index}
                />
            ))}
        </HorizontalCarousel>
    );
});
