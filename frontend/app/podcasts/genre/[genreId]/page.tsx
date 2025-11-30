"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Mic2, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { GradientSpinner } from "@/components/ui/GradientSpinner";

interface Podcast {
    id: string;
    title: string;
    author: string;
    coverUrl: string;
    feedUrl: string;
    itunesId?: number;
}

const GENRE_MAP: { [key: string]: { name: string; searchTerm: string } } = {
    "1303": { name: "Comedy", searchTerm: "comedy podcast" },
    "1324": {
        name: "Society & Culture",
        searchTerm: "society culture podcast",
    },
    "1489": { name: "News", searchTerm: "news podcast" },
    "1488": { name: "True Crime", searchTerm: "true crime podcast" },
    "1321": { name: "Business", searchTerm: "business podcast" },
    "1545": { name: "Sports", searchTerm: "sports podcast" },
    "1502": { name: "Leisure", searchTerm: "gaming hobbies podcast" },
};

export default function GenrePage() {
    const params = useParams();
    const router = useRouter();
    const genreId = params.genreId as string;
    const genre = GENRE_MAP[genreId];

    const [podcasts, setPodcasts] = useState<Podcast[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    const LIMIT = 20;

    const loadMorePodcasts = useCallback(async () => {
        if (loading || !hasMore) return;

        setLoading(true);
        try {

            // Call the paginated endpoint
            const data = await api.getPodcastsByGenrePaginated(
                parseInt(genreId),
                LIMIT,
                offset
            );

            if (data.length < LIMIT) {
                setHasMore(false);
            }

            setPodcasts((prev) => [...prev, ...data]);
            setOffset((prev) => prev + data.length);
        } catch (error) {
            console.error("Failed to load podcasts:", error);
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, [genreId, offset, loading, hasMore]);

    // Set up intersection observer for infinite scroll
    useEffect(() => {
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    loadMorePodcasts();
                }
            },
            { threshold: 0.1 }
        );

        if (loadMoreRef.current) {
            observerRef.current.observe(loadMoreRef.current);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [loadMorePodcasts, hasMore, loading]);

    // Load initial podcasts
    useEffect(() => {
        loadMorePodcasts();
    }, []); // Only on mount

    const handlePodcastClick = (podcast: Podcast) => {
        // Navigate to podcast preview page instead of auto-subscribing
        router.push(`/podcasts/${podcast.id || podcast.itunesId}`);
    };

    if (!genre) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-white">Genre not found</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-black to-[#121212] text-white p-6 md:p-8">
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={() => router.push("/podcasts")}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Podcasts
                </button>
                <h1 className="text-4xl md:text-5xl font-bold">{genre.name}</h1>
                <p className="text-gray-400 mt-2">
                    {podcasts.length} podcast{podcasts.length !== 1 ? "s" : ""}
                </p>
            </div>

            {/* Podcast Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {podcasts.map((podcast) => (
                    <div
                        key={podcast.id}
                        onClick={() => handlePodcastClick(podcast)}
                        className="bg-gradient-to-br from-[#121212] to-[#121212] hover:from-[#181818] hover:to-[#1a1a1a] transition-all p-4 rounded-lg cursor-pointer group border border-[#1c1c1c]"
                    >
                        <div className="w-full aspect-square bg-[#181818] rounded-full mb-3 overflow-hidden">
                            {podcast.coverUrl ? (
                                <img
                                    src={podcast.coverUrl}
                                    alt={podcast.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    loading="lazy"
                                    onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                    }}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Mic2 className="w-16 h-16 text-gray-700" />
                                </div>
                            )}
                        </div>
                        <h3 className="font-bold text-white truncate text-sm">
                            {podcast.title}
                        </h3>
                        <p className="text-xs text-gray-400 truncate">
                            {podcast.author}
                        </p>
                    </div>
                ))}
            </div>

            {/* Loading indicator */}
            {loading && (
                <div className="flex justify-center items-center py-8">
                    <GradientSpinner size="md" />
                </div>
            )}

            {/* Intersection observer target */}
            <div ref={loadMoreRef} className="h-20" />

            {/* End of results */}
            {!hasMore && podcasts.length > 0 && (
                <div className="text-center py-8 text-gray-400">
                    No more podcasts to load
                </div>
            )}

            {/* No results */}
            {!loading && podcasts.length === 0 && (
                <div className="text-center py-20">
                    <Mic2 className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                    <p className="text-gray-400">No podcasts found</p>
                </div>
            )}
        </div>
    );
}
