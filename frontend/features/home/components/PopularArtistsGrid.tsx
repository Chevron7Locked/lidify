import Link from "next/link";
import Image from "next/image";
import { Music } from "lucide-react";
import { api } from "@/lib/api";

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

export function PopularArtistsGrid({ artists }: PopularArtistsGridProps) {
    return (
        <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5 3xl:grid-cols-5 gap-4"
            data-tv-section="popular-artists"
        >
            {artists.slice(0, 10).map((artist: any, index) => {
                const imageUrl = getProxiedImageUrl(artist.image);
                return (
                    <Link
                        key={artist.id || artist.name}
                        href={`/search?q=${encodeURIComponent(artist.name)}`}
                        data-tv-card
                        data-tv-card-index={index}
                        tabIndex={0}
                    >
                        <div className="bg-[#121212] hover:bg-[#181818] transition-all duration-200 p-4 rounded-md group cursor-pointer hover:shadow-xl">
                            <div className="aspect-square bg-[#181818] rounded-full mb-4 flex items-center justify-center overflow-hidden relative shadow-lg">
                                {imageUrl ? (
                                    <Image
                                        src={imageUrl}
                                        alt={artist.name}
                                        fill
                                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                                        className="object-cover group-hover:scale-110 transition-all"
                                        unoptimized
                                    />
                                ) : (
                                    <Music className="w-12 h-12 text-gray-600" />
                                )}
                            </div>
                            <h3 className="text-base font-bold text-white line-clamp-1 mb-1">
                                {artist.name}
                            </h3>
                            <p className="text-sm text-[#b3b3b3]">
                                {artist.listeners?.toLocaleString()} listeners
                            </p>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
