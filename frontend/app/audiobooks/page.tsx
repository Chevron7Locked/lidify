"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CachedImage } from "@/components/ui/CachedImage";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { useAudio } from "@/lib/audio-context";
import { useAudiobooksQuery } from "@/hooks/useQueries";
import {
    Book,
    BookOpen,
    CheckCircle,
    Settings,
    SlidersHorizontal,
    ListTree,
} from "lucide-react";
import { cn } from "@/utils/cn";

interface Audiobook {
    id: string;
    title: string;
    author: string;
    narrator?: string;
    description?: string;
    coverUrl: string | null;
    duration: number;
    libraryId: string;
    series?: {
        name: string;
        sequence: string;
    } | null;
    genres?: string[];
    progress: {
        currentTime: number;
        progress: number;
        isFinished: boolean;
        lastPlayedAt: Date;
    } | null;
}

type FilterType = "all" | "listening" | "finished";
type SortType = "title" | "author" | "recent" | "series";

export default function AudiobooksPage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const { toast } = useToast();
    const { currentAudiobook, pause } = useAudio();

    // Use React Query hook for audiobooks
    const { data: audiobooksData, isLoading, error } = useAudiobooksQuery();

    const [filter, setFilter] = useState<FilterType>("all");
    const [sortBy, setSortBy] = useState<SortType>("title");
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
    const [groupBySeries, setGroupBySeries] = useState(false);

    // Check if Audiobookshelf is configured
    const isConfigured =
        !error &&
        (!audiobooksData ||
            !("configured" in audiobooksData) ||
            audiobooksData.configured !== false);
    const audiobooks: Audiobook[] = Array.isArray(audiobooksData)
        ? audiobooksData
        : [];

    // Clear player state if Audiobookshelf is disabled
    useEffect(() => {
        if (!isConfigured && currentAudiobook) {
            pause();
            // Clear from localStorage
            if (typeof window !== "undefined") {
                localStorage.removeItem("lidify_current_audiobook");
                localStorage.removeItem("lidify_playback_type");
            }
        }
    }, [isConfigured, currentAudiobook, pause]);

    const continueListening = audiobooks.filter(
        (book) =>
            book.progress &&
            book.progress.progress > 0 &&
            !book.progress.isFinished
    );

    // Get all unique genres
    const allGenres = Array.from(
        new Set(audiobooks.flatMap((book) => book.genres || []))
    ).sort();

    const getFilteredAndSortedBooks = () => {
        // First filter by progress status
        let filtered = audiobooks;
        switch (filter) {
            case "listening":
                filtered = continueListening;
                break;
            case "finished":
                filtered = audiobooks.filter(
                    (book) => book.progress?.isFinished
                );
                break;
        }

        // Filter by genre
        if (selectedGenre) {
            filtered = filtered.filter((book) =>
                book.genres?.includes(selectedGenre)
            );
        }

        // Sort
        let sorted = [...filtered];
        switch (sortBy) {
            case "title":
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case "author":
                sorted.sort((a, b) => a.author.localeCompare(b.author));
                break;
            case "recent":
                sorted.sort((a, b) => {
                    const aTime = a.progress?.lastPlayedAt
                        ? new Date(a.progress.lastPlayedAt).getTime()
                        : 0;
                    const bTime = b.progress?.lastPlayedAt
                        ? new Date(b.progress.lastPlayedAt).getTime()
                        : 0;
                    return bTime - aTime;
                });
                break;
            case "series":
                sorted.sort((a, b) => {
                    // Series books first, then one-offs
                    if (a.series && !b.series) return -1;
                    if (!a.series && b.series) return 1;
                    if (a.series && b.series) {
                        // Same series: sort by sequence
                        if (a.series.name === b.series.name) {
                            const aSeq = parseFloat(a.series.sequence || "0");
                            const bSeq = parseFloat(b.series.sequence || "0");
                            return aSeq - bSeq;
                        }
                        // Different series: sort by name
                        return a.series.name.localeCompare(b.series.name);
                    }
                    // Both one-offs: sort by title
                    return a.title.localeCompare(b.title);
                });
                break;
        }

        return sorted;
    };

    const filteredBooks = getFilteredAndSortedBooks();

    // Get series and standalone books for artist-style view
    const getSeriesAndStandalone = () => {
        const seriesMap = new Map<string, Audiobook[]>();
        const standalone: Audiobook[] = [];

        filteredBooks.forEach((book) => {
            // Only treat as series if it has a series name
            if (
                book.series &&
                book.series.name &&
                book.series.name.trim() !== ""
            ) {
                const seriesName = book.series.name.trim();
                if (!seriesMap.has(seriesName)) {
                    seriesMap.set(seriesName, []);
                }
                seriesMap.get(seriesName)!.push(book);
            } else {
                standalone.push(book);
            }
        });

        // Sort each series by sequence to get first book for cover
        seriesMap.forEach((books) => {
            books.sort((a, b) => {
                const aSeq = parseFloat(a.series?.sequence || "0");
                const bSeq = parseFloat(b.series?.sequence || "0");
                return aSeq - bSeq;
            });
        });

        return { series: Array.from(seriesMap.entries()), standalone };
    };

    const { series, standalone } = getSeriesAndStandalone();

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    const getCoverUrl = (coverUrl: string | null, size = 300) => {
        if (!coverUrl) return null;
        // Proxy through backend for caching
        return api.getCoverArtUrl(coverUrl, size);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <GradientSpinner size="md" />
            </div>
        );
    }

    if (!isConfigured) {
        return (
            <div className="min-h-screen bg-black relative overflow-hidden">
                {/* Gradient Overlays */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#ecb200]/10 via-purple-900/10 to-transparent" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-500/5 via-transparent to-transparent" />
                </div>

                <div className="relative max-w-5xl mx-auto px-6 md:px-8 py-16 md:py-24">
                    {/* Title Section */}
                    <div className="text-center mb-16">
                        <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-white mb-6 tracking-tight">
                            Audiobooks
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto">
                            Connect Audiobookshelf to unlock your audiobook
                            library
                        </p>
                    </div>

                    {/* Setup Steps - Horizontal Cards */}
                    <div className="grid md:grid-cols-3 gap-6 mb-12">
                        <div className="bg-gradient-to-br from-[#121212] to-[#0a0a0a] rounded-xl p-6 border border-white/5 hover:border-white/10 transition-all">
                            <div className="text-4xl font-black text-purple-400/20 mb-4">
                                01
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                Install Audiobookshelf
                            </h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                Set up your own Audiobookshelf instance via
                                Docker or use an existing installation
                            </p>
                        </div>

                        <div className="bg-gradient-to-br from-[#121212] to-[#0a0a0a] rounded-xl p-6 border border-white/5 hover:border-white/10 transition-all">
                            <div className="text-4xl font-black text-purple-400/20 mb-4">
                                02
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                Get API Key
                            </h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                Settings → Users → Click your user → API Tokens
                                → Generate
                            </p>
                        </div>

                        <div className="bg-gradient-to-br from-[#121212] to-[#0a0a0a] rounded-xl p-6 border border-white/5 hover:border-white/10 transition-all">
                            <div className="text-4xl font-black text-purple-400/20 mb-4">
                                03
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                Configure
                            </h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                Enter your Audiobookshelf URL and API key in
                                Lidify settings
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-2xl mx-auto mb-12">
                        <Button
                            onClick={() =>
                                router.push(
                                    "/settings?tab=system#audiobookshelf"
                                )
                            }
                            className="flex-1 py-6 text-lg font-semibold"
                        >
                            Configure Audiobookshelf
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() =>
                                window.open(
                                    "https://hub.docker.com/r/advplyr/audiobookshelf",
                                    "_blank"
                                )
                            }
                            className="flex-1 py-6 text-lg font-semibold"
                        >
                            Install via Docker
                        </Button>
                    </div>

                    {/* Footer Link */}
                    <div className="text-center">
                        <p className="text-gray-500 text-sm mb-2">Need help?</p>
                        <a
                            href="https://github.com/advplyr/audiobookshelf"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-white text-sm transition-colors"
                        >
                            View Documentation
                        </a>
                    </div>
                </div>
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
                        Audiobooks
                    </h1>
                </div>
            </div>

            <div className="relative max-w-7xl mx-auto px-4 md:px-8 pb-24">
                {/* Filter and Sort Controls - Mobile Optimized */}
                <div className="mb-8 space-y-3">
                    {/* First Row: Filter Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setFilter("all")}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                                filter === "all"
                                    ? "bg-white text-black"
                                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10"
                            }`}
                        >
                            All Books
                        </button>
                        <button
                            onClick={() => setFilter("finished")}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                                filter === "finished"
                                    ? "bg-white text-black"
                                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10"
                            }`}
                        >
                            Finished
                        </button>

                        {/* Results Count - Desktop only */}
                        <span className="hidden md:inline text-sm text-gray-400 ml-auto">
                            {filteredBooks.length}{" "}
                            {filteredBooks.length === 1 ? "book" : "books"}
                        </span>
                    </div>

                    {/* Second Row: Sort, Series View, Genre */}
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={sortBy}
                            onChange={(e) =>
                                setSortBy(e.target.value as SortType)
                            }
                            className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white text-sm focus:outline-none focus:border-purple-500 focus:bg-white/10 transition-all"
                        >
                            <option value="title">Title</option>
                            <option value="author">Author</option>
                            <option value="recent">Recently Played</option>
                            <option value="series">Series</option>
                        </select>

                        <button
                            onClick={() => setGroupBySeries(!groupBySeries)}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                                groupBySeries
                                    ? "bg-white text-black"
                                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10"
                            }`}
                            title="Show series as single cards (like artist view)"
                        >
                            <ListTree className="w-4 h-4" />
                            <span className="hidden sm:inline">
                                Series View
                            </span>
                        </button>

                        {allGenres.length > 0 && (
                            <select
                                value={selectedGenre || ""}
                                onChange={(e) =>
                                    setSelectedGenre(e.target.value || null)
                                }
                                className="flex-1 min-w-0 md:flex-initial md:min-w-[140px] px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white text-sm focus:outline-none focus:border-purple-500 focus:bg-white/10 transition-all truncate"
                            >
                                <option value="">All Genres</option>
                                {allGenres.map((genre) => (
                                    <option key={genre} value={genre}>
                                        {genre}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Results Count - Mobile only */}
                    <div className="md:hidden text-sm text-gray-400">
                        {filteredBooks.length}{" "}
                        {filteredBooks.length === 1 ? "book" : "books"}
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Continue Listening Section */}
                    {continueListening.length > 0 &&
                        filter === "all" &&
                        !groupBySeries && (
                            <section>
                                <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
                                    Continue Listening
                                </h2>
                                <div
                                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10 gap-6"
                                    data-tv-section="continue-listening"
                                >
                                    {continueListening.map((book, index) => (
                                        <Link
                                            key={book.id}
                                            href={`/audiobooks/${book.id}`}
                                            data-tv-card
                                            data-tv-card-index={index}
                                            tabIndex={0}
                                        >
                                            <div className="cursor-pointer group relative">
                                                {/* Book Spine Effect */}
                                                <div className="relative">
                                                    {/* Book Cover */}
                                                    <div className="aspect-[2/3] rounded-sm overflow-hidden bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] shadow-2xl relative transform transition-all group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.8)]">
                                                        {book.coverUrl &&
                                                        getCoverUrl(
                                                            book.coverUrl
                                                        ) ? (
                                                            <CachedImage
                                                                src={
                                                                    getCoverUrl(
                                                                        book.coverUrl
                                                                    )!
                                                                }
                                                                alt={book.title}
                                                                className="w-full h-full object-cover"
                                                                loading="lazy"
                                                                onError={(
                                                                    e
                                                                ) => {
                                                                    e.currentTarget.style.display =
                                                                        "none";
                                                                }}
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Book className="w-16 h-16 text-gray-700" />
                                                            </div>
                                                        )}
                                                        {/* Book Spine Shadow */}
                                                        <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
                                                        {/* Book Gloss */}
                                                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />

                                                        {/* Progress Bar Overlay */}
                                                        {book.progress && (
                                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                                                                <div
                                                                    className="h-full bg-purple-500"
                                                                    style={{
                                                                        width: `${book.progress.progress}%`,
                                                                    }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Shelf */}
                                                    <div className="absolute -bottom-1 left-0 right-0 h-2 bg-gradient-to-b from-[#1a1a1a]/50 to-transparent rounded-b-sm" />
                                                </div>

                                                {/* Title and Author - Below Book */}
                                                <div className="mt-3 px-1">
                                                    <h3 className="text-sm font-bold text-white line-clamp-2 mb-1 leading-tight">
                                                        {book.title}
                                                    </h3>
                                                    <p className="text-xs text-gray-400 line-clamp-1">
                                                        {book.author}
                                                    </p>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}

                    {/* Audiobooks Grid - Series View or Individual View */}
                    {filteredBooks.length > 0 ? (
                        groupBySeries ? (
                            // Series View - ONE card per series (like artist cards)
                            <>
                                {/* Series Cards */}
                                {series.length > 0 && (
                                    <section>
                                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
                                            Series
                                        </h2>
                                        <div
                                            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10 gap-6"
                                            data-tv-section="series"
                                        >
                                            {series.map(
                                                ([seriesName, books], index) => {
                                                    const firstBook = books[0]; // Use first book for cover
                                                    const totalDuration =
                                                        books.reduce(
                                                            (sum, b) =>
                                                                sum +
                                                                b.duration,
                                                            0
                                                        );

                                                    return (
                                                        <Link
                                                            key={seriesName}
                                                            href={`/audiobooks/series/${encodeURIComponent(
                                                                seriesName
                                                            )}`}
                                                            data-tv-card
                                                            data-tv-card-index={index}
                                                            tabIndex={0}
                                                        >
                                                            <div className="cursor-pointer group relative">
                                                                <div className="relative">
                                                                    {/* Book Cover */}
                                                                    <div className="aspect-[2/3] rounded-sm overflow-hidden bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] shadow-2xl relative transform transition-all group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.8)]">
                                                                        {firstBook.coverUrl &&
                                                                        getCoverUrl(
                                                                            firstBook.coverUrl
                                                                        ) ? (
                                                                            <CachedImage
                                                                                src={
                                                                                    getCoverUrl(
                                                                                        firstBook.coverUrl
                                                                                    )!
                                                                                }
                                                                                alt={
                                                                                    seriesName
                                                                                }
                                                                                className="w-full h-full object-cover"
                                                                                loading="lazy"
                                                                                onError={(
                                                                                    e
                                                                                ) => {
                                                                                    e.currentTarget.style.display =
                                                                                        "none";
                                                                                }}
                                                                            />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center">
                                                                                <Book className="w-16 h-16 text-gray-700" />
                                                                            </div>
                                                                        )}
                                                                        {/* Book Spine Shadow */}
                                                                        <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
                                                                        {/* Book Gloss */}
                                                                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />

                                                                        {/* Book Count Badge */}
                                                                        <div className="absolute top-2 right-2 bg-purple-500 rounded px-2 py-1 text-xs font-bold shadow-lg">
                                                                            {
                                                                                books.length
                                                                            }{" "}
                                                                            {books.length ===
                                                                            1
                                                                                ? "book"
                                                                                : "books"}
                                                                        </div>
                                                                    </div>
                                                                    {/* Shelf */}
                                                                    <div className="absolute -bottom-1 left-0 right-0 h-2 bg-gradient-to-b from-[#1a1a1a]/50 to-transparent rounded-b-sm" />
                                                                </div>
                                                                {/* Series Name and Author */}
                                                                <div className="mt-3 px-1">
                                                                    <h3 className="text-sm font-bold text-white line-clamp-2 mb-1 leading-tight">
                                                                        {
                                                                            seriesName
                                                                        }
                                                                    </h3>
                                                                    <p className="text-xs text-gray-400 line-clamp-1">
                                                                        {
                                                                            firstBook.author
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    );
                                                }
                                            )}
                                        </div>
                                    </section>
                                )}

                                {/* Standalone Books */}
                                {standalone.length > 0 && (
                                    <section>
                                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
                                            Standalone Books
                                        </h2>
                                        <div
                                            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10 gap-6"
                                            data-tv-section="standalone"
                                        >
                                            {standalone.map((book, index) => (
                                                <Link
                                                    key={book.id}
                                                    href={`/audiobooks/${book.id}`}
                                                    data-tv-card
                                                    data-tv-card-index={index}
                                                    tabIndex={0}
                                                >
                                                    <div className="cursor-pointer group relative">
                                                        <div className="relative">
                                                            {/* Book Cover */}
                                                            <div className="aspect-[2/3] rounded-sm overflow-hidden bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] shadow-2xl relative transform transition-all group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.8)]">
                                                                {book.coverUrl &&
                                                                getCoverUrl(
                                                                    book.coverUrl
                                                                ) ? (
                                                                    <CachedImage
                                                                        src={
                                                                            getCoverUrl(
                                                                                book.coverUrl
                                                                            )!
                                                                        }
                                                                        alt={
                                                                            book.title
                                                                        }
                                                                        className="w-full h-full object-cover"
                                                                        loading="lazy"
                                                                        onError={(
                                                                            e
                                                                        ) => {
                                                                            e.currentTarget.style.display =
                                                                                "none";
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                        <Book className="w-16 h-16 text-gray-700" />
                                                                    </div>
                                                                )}
                                                                {/* Book Spine Shadow */}
                                                                <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
                                                                {/* Book Gloss */}
                                                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />

                                                                {/* Progress Bar */}
                                                                {book.progress &&
                                                                    !book
                                                                        .progress
                                                                        .isFinished && (
                                                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                                                                            <div
                                                                                className="h-full bg-purple-500"
                                                                                style={{
                                                                                    width: `${book.progress.progress}%`,
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                {/* Completion Badge */}
                                                                {book.progress
                                                                    ?.isFinished && (
                                                                    <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1.5 shadow-lg">
                                                                        <CheckCircle className="w-3 h-3 text-white" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {/* Shelf */}
                                                            <div className="absolute -bottom-1 left-0 right-0 h-2 bg-gradient-to-b from-[#1a1a1a]/50 to-transparent rounded-b-sm" />
                                                        </div>
                                                        {/* Title and Author */}
                                                        <div className="mt-3 px-1">
                                                            <h3 className="text-sm font-bold text-white line-clamp-2 mb-1 leading-tight">
                                                                {book.title}
                                                            </h3>
                                                            <p className="text-xs text-gray-400 line-clamp-1">
                                                                {book.author}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </>
                        ) : (
                            // Ungrouped Grid
                            <div
                                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10 gap-6"
                                data-tv-section="audiobooks"
                            >
                                {filteredBooks.map((book, index) => (
                                    <Link
                                        key={book.id}
                                        href={`/audiobooks/${book.id}`}
                                        data-tv-card
                                        data-tv-card-index={index}
                                        tabIndex={0}
                                    >
                                        <div className="cursor-pointer group relative">
                                            <div className="relative">
                                                {/* Book Cover */}
                                                <div className="aspect-[2/3] rounded-sm overflow-hidden bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] shadow-2xl relative transform transition-all group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.8)]">
                                                    {book.coverUrl &&
                                                    getCoverUrl(
                                                        book.coverUrl
                                                    ) ? (
                                                        <CachedImage
                                                            src={
                                                                getCoverUrl(
                                                                    book.coverUrl
                                                                )!
                                                            }
                                                            alt={book.title}
                                                            className="w-full h-full object-cover"
                                                            loading="lazy"
                                                            onError={(e) => {
                                                                e.currentTarget.style.display =
                                                                    "none";
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Book className="w-16 h-16 text-gray-700" />
                                                        </div>
                                                    )}
                                                    {/* Book Spine Shadow */}
                                                    <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
                                                    {/* Book Gloss */}
                                                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />

                                                    {/* Progress Bar */}
                                                    {book.progress &&
                                                        !book.progress
                                                            .isFinished && (
                                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                                                                <div
                                                                    className="h-full bg-purple-500"
                                                                    style={{
                                                                        width: `${book.progress.progress}%`,
                                                                    }}
                                                                />
                                                            </div>
                                                        )}
                                                    {/* Completion Badge */}
                                                    {book.progress
                                                        ?.isFinished && (
                                                        <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1.5 shadow-lg">
                                                            <CheckCircle className="w-3 h-3 text-white" />
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Shelf */}
                                                <div className="absolute -bottom-1 left-0 right-0 h-2 bg-gradient-to-b from-[#1a1a1a]/50 to-transparent rounded-b-sm" />
                                            </div>
                                            {/* Title and Author */}
                                            <div className="mt-3 px-1">
                                                {book.series && (
                                                    <p className="text-[10px] text-purple-400 font-semibold mb-0.5 uppercase tracking-wide">
                                                        {book.series.name} #
                                                        {book.series.sequence}
                                                    </p>
                                                )}
                                                <h3 className="text-sm font-bold text-white line-clamp-2 mb-1 leading-tight">
                                                    {book.title}
                                                </h3>
                                                <p className="text-xs text-gray-400 line-clamp-1">
                                                    {book.author}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )
                    ) : (
                        <EmptyState
                            icon={<Book className="w-12 h-12" />}
                            title={
                                filter === "listening"
                                    ? "No audiobooks in progress"
                                    : filter === "finished"
                                    ? "No finished audiobooks"
                                    : "No audiobooks found"
                            }
                            description={
                                filter === "all"
                                    ? "Add audiobooks to your Audiobookshelf library to get started"
                                    : "Start listening to some audiobooks"
                            }
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
