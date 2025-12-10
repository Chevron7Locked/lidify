"use client";

import Link from "next/link";
import Image from "next/image";
import { Music } from "lucide-react";
import { api } from "@/lib/api";
import { memo } from "react";
import { isLocalUrl } from "@/utils/cn";

interface MixCardProps {
    mix: {
        id: string;
        name: string;
        description: string;
        coverUrls: string[];
        trackCount: number;
    };
    index?: number;
}

const MixCard = memo(
    function MixCard({ mix, index }: MixCardProps) {
        return (
            <Link
                href={`/mix/${mix.id}`}
                data-tv-card
                data-tv-card-index={index}
                tabIndex={0}
            >
                <div className="bg-[#121212] hover:bg-[#181818] transition-all duration-200 p-4 rounded-md group cursor-pointer hover:shadow-xl">
                    {/* Circular mosaic cover art */}
                    <div className="aspect-square bg-[#181818] rounded-full mb-4 overflow-hidden relative shadow-lg">
                        {mix.coverUrls.length > 0 ? (
                            <div className="grid grid-cols-2 gap-0 w-full h-full">
                                {mix.coverUrls.slice(0, 4).map((url, index) => {
                                    // Proxy cover art through API to avoid native: URLs and CORS
                                    const proxiedUrl = api.getCoverArtUrl(
                                        url,
                                        300
                                    );

                                    return (
                                        <div
                                            key={index}
                                            className="relative bg-[#181818]"
                                        >
                                            <Image
                                                src={proxiedUrl}
                                                alt=""
                                                fill
                                                className="object-cover group-hover:scale-110 transition-all"
                                                sizes="(max-width: 640px) 25vw, (max-width: 768px) 16vw, (max-width: 1024px) 12vw, (max-width: 1280px) 10vw, 8vw"
                                                unoptimized={proxiedUrl ? isLocalUrl(proxiedUrl) : false}
                                            />
                                        </div>
                                    );
                                })}
                                {/* Fill remaining cells if less than 4 covers */}
                                {Array.from({
                                    length: Math.max(
                                        0,
                                        4 - mix.coverUrls.length
                                    ),
                                }).map((_, index) => (
                                    <div
                                        key={`empty-${index}`}
                                        className="relative bg-[#181818] flex items-center justify-center"
                                    >
                                        <Music className="w-8 h-8 text-gray-600" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Music className="w-12 h-12 text-gray-600" />
                            </div>
                        )}
                    </div>

                    <h3 className="text-base font-bold text-white line-clamp-1 mb-1">
                        {mix.name}
                    </h3>
                    <p className="text-sm text-[#b3b3b3] line-clamp-2">
                        {mix.description}
                    </p>
                </div>
            </Link>
        );
    },
    (prevProps, nextProps) => {
        // Only re-render if mix ID changes
        return prevProps.mix.id === nextProps.mix.id;
    }
);

export { MixCard };
