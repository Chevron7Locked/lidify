"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Disc3 } from "lucide-react";
import { useAlbumsQuery } from "@/hooks/useQueries";
import { GradientSpinner } from "@/components/ui/GradientSpinner";

export default function AlbumsPage() {
    const { isAuthenticated } = useAuth();

    // Use React Query hook for albums
    const { data: albumsData, isLoading } = useAlbumsQuery({ limit: 200 });
    const albums = albumsData?.albums || [];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <GradientSpinner size="md" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black relative">
            {/* Extended gradient background that fades from hero into content */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute inset-0 bg-gradient-to-b from-[#ecb200]/20 via-purple-900/15 to-transparent"
                    style={{ height: "120vh" }}
                />
                <div
                    className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#ecb200]/10 via-transparent to-transparent"
                    style={{ height: "100vh" }}
                />
            </div>

            {/* Hero Section */}
            <div className="relative">
                <div className="max-w-7xl mx-auto px-6 md:px-8 py-6">
                    <h1 className="text-3xl md:text-4xl font-black text-white">
                        All Albums
                    </h1>
                </div>
            </div>

            <div className="relative max-w-7xl mx-auto px-8 pb-24">
                <div
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                    data-tv-section="albums"
                >
                    {albums.map((album, index) => (
                        <Link
                            key={album.id}
                            href={`/album/${album.id}`}
                            data-tv-card
                            data-tv-card-index={index}
                            tabIndex={0}
                        >
                            <div className="bg-gradient-to-br from-[#121212] to-[#121212] hover:from-[#181818] hover:to-[#1a1a1a] transition-all duration-300 p-3 rounded-lg group cursor-pointer border border-white/5 hover:border-white/10 hover:scale-105 hover:shadow-2xl">
                                <div className="aspect-square bg-[#181818] rounded-lg mb-3 p-3 flex items-center justify-center">
                                    <div className="w-full h-full rounded-full overflow-hidden shadow-lg bg-[#1a1a1a]">
                                        {album.coverArt ? (
                                            <img
                                                src={api.getCoverArtUrl(
                                                    album.coverArt,
                                                    300
                                                )}
                                                alt={album.title}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-all"
                                            />
                                        ) : (
                                            <Disc3 className="w-12 h-12 text-gray-600" />
                                        )}
                                    </div>
                                </div>
                                <h3 className="text-sm font-bold text-white line-clamp-1 mb-2">
                                    {album.title}
                                </h3>
                                <p className="text-sm text-gray-400 line-clamp-1">
                                    {album.artist?.name}
                                </p>
                                {album.year && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        {album.year}
                                    </p>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
