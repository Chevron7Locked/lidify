"use client";

import Link from "next/link";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import { Audiobook } from "../types";

interface AudiobooksGridProps {
    audiobooks: Audiobook[];
}

export function AudiobooksGrid({ audiobooks }: AudiobooksGridProps) {
    return (
        <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5 3xl:grid-cols-5 gap-4"
            data-tv-section="audiobooks"
        >
            {audiobooks.slice(0, 10).map((audiobook: any, index) => (
                <Link
                    key={audiobook.id}
                    href={`/audiobooks/${audiobook.id}`}
                    data-tv-card
                    data-tv-card-index={index}
                    tabIndex={0}
                >
                    <div className="bg-[#121212] hover:bg-[#181818] transition-all duration-200 p-4 rounded-md group cursor-pointer hover:shadow-xl">
                        <div className="aspect-square bg-[#181818] rounded-full mb-4 flex items-center justify-center overflow-hidden relative shadow-lg">
                            {audiobook.coverUrl ? (
                                <Image
                                    src={api.getCoverArtUrl(
                                        audiobook.coverUrl,
                                        300
                                    )}
                                    alt={audiobook.title}
                                    fill
                                    className="object-cover group-hover:scale-110 transition-all"
                                    unoptimized
                                />
                            ) : (
                                <BookOpen className="w-12 h-12 text-gray-600" />
                            )}
                        </div>
                        <h3 className="text-base font-bold text-white line-clamp-1 mb-1">
                            {audiobook.title}
                        </h3>
                        <p className="text-sm text-[#b3b3b3] line-clamp-1">
                            {audiobook.author || "Audiobook"}
                        </p>
                    </div>
                </Link>
            ))}
        </div>
    );
}
