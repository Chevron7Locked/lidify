import Link from "next/link";
import Image from "next/image";
import { Music, Disc, BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import { isLocalUrl } from "@/utils/cn";

interface ContinueListeningItem {
    id: string;
    name: string;
    type: "artist" | "podcast" | "audiobook";
    coverArt?: string;
    progress?: number;
    author?: string;
}

interface ContinueListeningProps {
    items: ContinueListeningItem[];
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

const getImageForItem = (item: ContinueListeningItem) => {
    if (item.type === "audiobook") {
        // Prefer locally cached audiobook covers for reliability
        return api.getCoverArtUrl(`/audiobooks/${item.id}/cover`, 300);
    }

    if (item.coverArt) {
        return getArtistImageSrc(item.coverArt);
    }

    return null;
};

const getDescriptionLabel = (item: ContinueListeningItem) => {
    if (item.type === "podcast") {
        if (
            item.author &&
            item.author.trim().length > 0 &&
            item.author.trim().toLowerCase() !== item.name.trim().toLowerCase()
        ) {
            return item.author;
        }
        return "Podcast";
    }

    if (item.type === "audiobook") {
        return item.author && item.author.trim().length > 0
            ? item.author
            : "Audiobook";
    }

    return "Artist";
};

export function ContinueListening({ items }: ContinueListeningProps) {
    return (
        <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5 3xl:grid-cols-5 gap-4"
            data-tv-section="continue-listening"
        >
            {items.slice(0, 10).map((item, index) => {
                const isPodcast = item.type === "podcast";
                const isAudiobook = item.type === "audiobook";
                const imageSrc = getImageForItem(item);
                const href = isPodcast
                    ? `/podcasts/${item.id}`
                    : isAudiobook
                    ? `/audiobooks/${item.id}`
                    : `/artist/${item.id}`;
                const hasProgress =
                    (isPodcast || isAudiobook) &&
                    item.progress &&
                    item.progress > 0;

                return (
                    <Link
                        key={`${item.type}-${item.id}`}
                        href={href}
                        data-tv-card
                        data-tv-card-index={index}
                        tabIndex={0}
                    >
                        <div className="bg-[#121212] hover:bg-[#181818] transition-all duration-200 p-4 rounded-md group cursor-pointer hover:shadow-xl h-full flex flex-col">
                            <div className="aspect-square bg-[#181818] rounded-full mb-4 flex items-center justify-center overflow-hidden relative shadow-lg shrink-0">
                                {imageSrc ? (
                                    <Image
                                        src={imageSrc}
                                        alt={item.name}
                                        fill
                                        className="object-cover group-hover:scale-110 transition-all"
                                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                                        priority={false}
                                        unoptimized
                                    />
                                ) : isPodcast ? (
                                    <Disc className="w-12 h-12 text-gray-600" />
                                ) : isAudiobook ? (
                                    <BookOpen className="w-12 h-12 text-gray-600" />
                                ) : (
                                    <Music className="w-12 h-12 text-gray-600" />
                                )}
                                {hasProgress && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                                        <div
                                            className="h-full bg-[#ecb200]"
                                            style={{
                                                width: `${item.progress}%`,
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 flex flex-col">
                                <h3 className="text-base font-bold text-white line-clamp-1 mb-1">
                                    {item.name}
                                </h3>
                                <p className="text-sm text-[#b3b3b3] line-clamp-2">
                                    {getDescriptionLabel(item)}
                                </p>
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
