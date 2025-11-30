import Link from "next/link";
import Image from "next/image";
import { Music } from "lucide-react";
import { api } from "@/lib/api";
import { memo } from "react";

interface Artist {
    id: string;
    name: string;
    coverArt?: string;
    albumCount?: number;
}

interface ArtistsGridProps {
    artists: Artist[];
}

// Helper to get the correct image source
const getArtistImageSrc = (coverArt: string | undefined) => {
    if (!coverArt) {
        return null;
    }
    // Always use the API proxy - this ensures images work on mobile
    // The API will proxy external URLs (http/https) and serve local cover art
    return api.getCoverArtUrl(coverArt, 300);
};

interface ArtistCardProps {
    artist: Artist;
    index: number;
}

const ArtistCard = memo(
    function ArtistCard({ artist, index }: ArtistCardProps) {
        const imageSrc = getArtistImageSrc(artist.coverArt);

        return (
            <Link
                href={`/artist/${artist.id}`}
                data-tv-card
                data-tv-card-index={index}
                tabIndex={0}
            >
                <div className="bg-[#121212] hover:bg-[#181818] transition-all duration-200 p-4 rounded-md group cursor-pointer hover:shadow-xl">
                    <div className="aspect-square bg-[#181818] rounded-full mb-4 flex items-center justify-center overflow-hidden relative shadow-lg">
                        {artist.coverArt && imageSrc ? (
                            <Image
                                src={imageSrc}
                                alt={artist.name}
                                fill
                                className="object-cover group-hover:scale-110 transition-all"
                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                                priority={false}
                                unoptimized={imageSrc.startsWith(
                                    "http://localhost"
                                )}
                            />
                        ) : (
                            <Music className="w-12 h-12 text-gray-600" />
                        )}
                    </div>
                    <h3 className="text-base font-bold text-white line-clamp-1 mb-1">
                        {artist.name}
                    </h3>
                    <p className="text-sm text-[#b3b3b3]">Artist</p>
                </div>
            </Link>
        );
    },
    (prevProps, nextProps) => {
        return prevProps.artist.id === nextProps.artist.id && prevProps.index === nextProps.index;
    }
);

const ArtistsGrid = memo(function ArtistsGrid({ artists }: ArtistsGridProps) {
    return (
        <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5 3xl:grid-cols-5 gap-4"
            data-tv-section="artists"
        >
            {artists.slice(0, 10).map((artist, index) => (
                <ArtistCard key={artist.id} artist={artist} index={index} />
            ))}
        </div>
    );
});

export { ArtistsGrid, getArtistImageSrc };
