import Link from "next/link";
import { Disc3 } from "lucide-react";
import { api } from "@/lib/api";
import { Album } from "../types";

interface LibraryAlbumsGridProps {
    albums: Album[];
}

export function LibraryAlbumsGrid({ albums }: LibraryAlbumsGridProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10 gap-4" data-tv-section="search-results-albums">
            {albums.slice(0, 6).map((album, index) => (
                <Link
                    key={album.id}
                    href={`/album/${album.id}`}
                    data-tv-card
                    data-tv-card-index={index}
                    tabIndex={0}
                >
                    <div className="bg-[#121212] hover:bg-[#181818] transition-all p-4 rounded-lg group cursor-pointer">
                        <div className="aspect-square bg-[#181818] rounded-md mb-4 flex items-center justify-center overflow-hidden">
                            {album.coverUrl || album.albumId ? (
                                <img
                                    src={api.getCoverArtUrl(
                                        album.coverUrl || album.albumId,
                                        300
                                    )}
                                    alt={album.title}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-all"
                                />
                            ) : (
                                <Disc3 className="w-12 h-12 text-gray-600" />
                            )}
                        </div>
                        <h3 className="text-base font-bold text-white line-clamp-1 mb-1">
                            {album.title}
                        </h3>
                        <p className="text-sm text-[#b3b3b3] line-clamp-1">
                            {album.artist?.name}
                        </p>
                    </div>
                </Link>
            ))}
        </div>
    );
}
