"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Music } from "lucide-react";
import { GradientSpinner } from "@/components/ui/GradientSpinner";

export default function ArtistsPage() {
    const { isAuthenticated } = useAuth();
    const [artists, setArtists] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadArtists = async () => {
            if (!isAuthenticated) return;

            try {
                const data = await api.getArtists({ limit: 200 });
                setArtists(data.artists);
            } catch (error) {
                console.error("Failed to load artists:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadArtists();
    }, [isAuthenticated]);

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
                <div className="max-w-7xl mx-auto px-6 md:px-8 py-12 md:py-16">
                    <h1 className="text-5xl md:text-6xl font-black text-white mb-2 drop-shadow-2xl">
                        All Artists
                    </h1>
                    <p className="text-lg text-gray-400">
                        {artists.length} artists in your library
                    </p>
                </div>
            </div>

            <div className="relative max-w-7xl mx-auto px-8 pb-24">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {artists.map((artist) => (
                        <Link key={artist.id} href={`/artist/${artist.id}`}>
                            <div className="bg-gradient-to-br from-[#121212] to-[#121212] hover:from-[#181818] hover:to-[#1a1a1a] transition-all duration-300 p-4 rounded-lg group cursor-pointer border border-white/5 hover:border-white/10 hover:scale-105 hover:shadow-2xl">
                                <div className="aspect-square bg-[#181818] rounded-full mb-4 flex items-center justify-center overflow-hidden shadow-lg">
                                    {artist.coverArt ? (
                                        <img
                                            src={api.getCoverArtUrl(
                                                artist.coverArt,
                                                300
                                            )}
                                            alt={artist.name}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-all"
                                        />
                                    ) : (
                                        <Music className="w-12 h-12 text-gray-600" />
                                    )}
                                </div>
                                <h3 className="text-sm font-bold text-white line-clamp-1 mb-2">
                                    {artist.name}
                                </h3>
                                <p className="text-sm text-gray-400">
                                    {artist.albumCount || 0} albums
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
