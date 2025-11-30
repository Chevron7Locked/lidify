"use client";

import { cn } from "@/utils/cn";

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn("animate-pulse bg-[#1a1a1a] rounded-sm", className)}
        />
    );
}

export function ArtistCardSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="bg-gradient-to-br from-[#121212] to-[#0f0f0f] border border-[#1c1c1c] rounded-sm p-4"
                >
                    <Skeleton className="aspect-square w-full mb-3" />
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            ))}
        </div>
    );
}

export function AlbumCardSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="bg-gradient-to-br from-[#121212] to-[#0f0f0f] border border-[#1c1c1c] rounded-sm p-4"
                >
                    <Skeleton className="aspect-square w-full mb-3" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-3 w-2/3 mb-1" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
            ))}
        </div>
    );
}

export function TrackListSkeleton({ count = 10 }: { count?: number }) {
    return (
        <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-sm divide-y divide-[#1c1c1c]">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <Skeleton className="w-8 h-4" />
                    <Skeleton className="w-12 h-12 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                </div>
            ))}
        </div>
    );
}

export function HeroSkeleton() {
    return (
        <div className="relative bg-gradient-to-b from-purple-900/20 to-transparent">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
                <div className="flex flex-col md:flex-row items-end gap-6">
                    <Skeleton className="w-48 h-48 flex-shrink-0" />
                    <div className="flex-1 pb-2 space-y-4 w-full">
                        <Skeleton className="h-6 w-20" />
                        <Skeleton className="h-12 w-3/4 max-w-md" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                </div>
            </div>
        </div>
    );
}
