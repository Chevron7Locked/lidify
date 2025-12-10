"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAudio } from "@/lib/audio-context";
import { useToast } from "@/lib/toast-context";
import {
    ArrowLeft,
    Book,
    Clock,
    Play,
    Pause,
    CheckCircle,
    Loader2,
} from "lucide-react";

interface Audiobook {
    id: string;
    title: string;
    author: string;
    narrator?: string;
    description?: string;
    coverUrl: string | null;
    duration: number;
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

export default function SeriesDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const { toast } = useToast();
    const {
        playAudiobook,
        currentAudiobook,
        isPlaying,
        pause,
        resume,
        playbackType,
    } = useAudio();

    const seriesName = decodeURIComponent(params.name as string);
    const [books, setBooks] = useState<Audiobook[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadSeries();
    }, [seriesName, isAuthenticated]);

    const loadSeries = async () => {
        if (!isAuthenticated) return;

        setIsLoading(true);
        try {
            const data = await api.getAudiobookSeries(seriesName);
            setBooks(Array.isArray(data) ? data : []);
        } catch (error: any) {
            console.error("Failed to load series:", error);
            toast.error("Failed to load series");
        } finally {
            setIsLoading(false);
        }
    };

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
        return api.getCoverArtUrl(coverUrl, size);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            </div>
        );
    }

    if (books.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">No books found in this series</p>
            </div>
        );
    }

    const firstBook = books[0];
    const author = firstBook.author;
    const genres = firstBook.genres || [];
    const totalDuration = books.reduce((sum, book) => sum + book.duration, 0);

    return (
        <div className="min-h-screen bg-black">
            {/* Hero Section */}
            <div className="relative bg-gradient-to-b from-purple-900/30 to-transparent pb-8">
                <div className="max-w-7xl mx-auto px-8 py-12">
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        {/* Series Cover */}
                        <div className="w-64 h-64 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl bg-[#181818]">
                            {firstBook.coverUrl &&
                            getCoverUrl(firstBook.coverUrl, 500) ? (
                                <img
                                    src={getCoverUrl(firstBook.coverUrl, 500)!}
                                    alt={seriesName}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Book className="w-24 h-24 text-gray-600" />
                                </div>
                            )}
                        </div>

                        {/* Series Info */}
                        <div className="flex-1">
                            <div className="text-sm font-bold text-white/90 mb-2">
                                SERIES
                            </div>
                            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
                                {seriesName}
                            </h1>

                            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300 mb-6">
                                <span className="font-semibold">{author}</span>
                                <span>•</span>
                                <span>
                                    {books.length}{" "}
                                    {books.length === 1 ? "book" : "books"}
                                </span>
                                <span>•</span>
                                <span>{formatDuration(totalDuration)}</span>
                            </div>

                            {genres.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {genres.slice(0, 5).map((genre) => (
                                        <Badge key={genre} variant="default">
                                            {genre}
                                        </Badge>
                                    ))}
                                </div>
                            )}

                            <Button
                                variant="ghost"
                                onClick={() => router.back()}
                                className="mb-6"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Books List */}
            <div className="max-w-7xl mx-auto px-8 pb-24">
                <h2 className="text-2xl font-bold text-white mb-6">
                    Books in Series
                </h2>

                <div className="space-y-2">
                    {books.map((book, index) => {
                        const isCurrentBook =
                            currentAudiobook?.id === book.id &&
                            playbackType === "audiobook";
                        const isBookPlaying = isCurrentBook && isPlaying;

                        return (
                            <Card
                                key={book.id}
                                className="p-4 hover:bg-[#181818] transition-colors group"
                            >
                                <div className="flex items-center gap-4">
                                    {/* Book Number */}
                                    <div className="w-8 text-center">
                                        {isBookPlaying ? (
                                            <div className="flex items-center justify-center">
                                                <div className="w-4 h-4 flex items-center justify-center">
                                                    <div className="grid grid-cols-2 gap-0.5">
                                                        <div className="w-1 h-3 bg-purple-500 animate-pulse" />
                                                        <div className="w-1 h-3 bg-purple-500 animate-pulse delay-75" />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 font-medium">
                                                {book.series?.sequence ||
                                                    index + 1}
                                            </span>
                                        )}
                                    </div>

                                    {/* Book Cover (small) */}
                                    <Link href={`/audiobooks/${book.id}`}>
                                        <div className="w-12 h-12 rounded overflow-hidden bg-[#181818] flex-shrink-0 cursor-pointer">
                                            {book.coverUrl &&
                                            getCoverUrl(book.coverUrl, 100) ? (
                                                <img
                                                    src={
                                                        getCoverUrl(
                                                            book.coverUrl,
                                                            100
                                                        )!
                                                    }
                                                    alt={book.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Book className="w-6 h-6 text-gray-600" />
                                                </div>
                                            )}
                                        </div>
                                    </Link>

                                    {/* Book Title & Author */}
                                    <Link
                                        href={`/audiobooks/${book.id}`}
                                        className="flex-1 min-w-0 cursor-pointer"
                                    >
                                        <h3 className="text-white font-medium truncate hover:underline">
                                            {book.title}
                                        </h3>
                                        <p className="text-sm text-gray-400 truncate">
                                            {book.narrator || book.author}
                                        </p>
                                    </Link>

                                    {/* Progress/Status */}
                                    {book.progress?.isFinished ? (
                                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    ) : book.progress &&
                                      book.progress.progress > 0 ? (
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <div className="w-24 h-1 bg-[#181818] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-purple-500"
                                                    style={{
                                                        width: `${book.progress.progress}%`,
                                                    }}
                                                />
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {Math.round(
                                                    book.progress.progress
                                                )}
                                                %
                                            </span>
                                        </div>
                                    ) : null}

                                    {/* Duration */}
                                    <div className="flex items-center gap-2 text-sm text-gray-400 flex-shrink-0">
                                        <Clock className="w-4 h-4" />
                                        {formatDuration(book.duration)}
                                    </div>

                                    {/* Play Button */}
                                    <Button
                                        variant={
                                            isCurrentBook ? "primary" : "icon"
                                        }
                                        onClick={() => {
                                            if (isCurrentBook) {
                                                isPlaying ? pause() : resume();
                                            } else {
                                                playAudiobook(book);
                                            }
                                        }}
                                        className="flex-shrink-0"
                                    >
                                        {isBookPlaying ? (
                                            <Pause className="w-4 h-4" />
                                        ) : (
                                            <Play className="w-4 h-4" />
                                        )}
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
