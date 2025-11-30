"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlaylistsQuery } from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { useAuth } from "@/lib/auth-context";
import { ListMusic, Plus } from "lucide-react";
import { GradientSpinner } from "@/components/ui/GradientSpinner";

export default function PlaylistsPage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    // Use React Query hook for playlists
    const { data: playlists = [], isLoading } = usePlaylistsQuery();

    // Listen for playlist events and invalidate cache
    useEffect(() => {
        const handlePlaylistEvent = () => {
            // Invalidate playlists cache to trigger refetch
            queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
        };

        window.addEventListener("playlist-created", handlePlaylistEvent);
        window.addEventListener("playlist-updated", handlePlaylistEvent);
        window.addEventListener("playlist-deleted", handlePlaylistEvent);

        return () => {
            window.removeEventListener("playlist-created", handlePlaylistEvent);
            window.removeEventListener("playlist-updated", handlePlaylistEvent);
            window.removeEventListener("playlist-deleted", handlePlaylistEvent);
        };
    }, [queryClient]);

    const handleCreatePlaylist = () => {
        router.push("/playlists");
        // Trigger the create playlist modal - we'll need to add state for this
        // For now, users can create playlists from the "Add to Playlist" button
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <GradientSpinner size="md" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black relative">
            {/* Extended gradient background */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute inset-0 bg-gradient-to-b from-purple-600/20 via-pink-600/10 to-transparent"
                    style={{ height: "120vh" }}
                />
                <div
                    className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-600/15 via-transparent to-transparent"
                    style={{ height: "100vh" }}
                />
            </div>

            {/* Hero Section */}
            <div className="relative">
                <div className="max-w-7xl mx-auto px-6 md:px-8 py-6">
                    <h1 className="text-3xl md:text-4xl font-black text-white">
                        Your Playlists
                    </h1>
                </div>
            </div>

            <div className="relative max-w-7xl mx-auto px-6 md:px-8 pb-24">
                {/* Playlists Grid */}
                {playlists.length > 0 ? (
                    <div
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                        data-tv-section="playlists"
                    >
                        {playlists.map((playlist, index) => (
                            <div
                                key={playlist.id}
                                onClick={() =>
                                    router.push(`/playlist/${playlist.id}`)
                                }
                                data-tv-card
                                data-tv-card-index={index}
                                tabIndex={0}
                                className="bg-gradient-to-br from-[#121212] to-[#121212] hover:from-[#181818] hover:to-[#1a1a1a] transition-all p-4 rounded-lg cursor-pointer group border border-[#1c1c1c]"
                            >
                                <div className="w-full aspect-square bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-md mb-3 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform">
                                    <ListMusic className="w-12 h-12 text-purple-400" />
                                </div>
                                <h3 className="font-bold text-white truncate text-sm mb-1">
                                    {playlist.name}
                                </h3>
                                <p className="text-xs text-gray-400">
                                    {playlist.trackCount || 0}{" "}
                                    {playlist.trackCount === 1
                                        ? "track"
                                        : "tracks"}
                                </p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-24 h-24 bg-gradient-to-br from-purple-500/10 to-purple-600/10 rounded-full flex items-center justify-center mb-6 border border-purple-500/20">
                            <ListMusic className="w-12 h-12 text-purple-400" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">
                            No playlists yet
                        </h3>
                        <p className="text-sm text-gray-400 mb-6 max-w-md">
                            Create your first playlist by adding tracks from
                            your library, albums, or artists
                        </p>
                        <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                            <p className="text-xs text-gray-500">
                                Tip: Look for the{" "}
                                <Plus className="w-3 h-3 inline mx-1" /> icon to
                                add tracks to playlists
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
