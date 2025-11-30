"use client";

import { useState, ReactNode, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Play, Pause, Check, Download } from "lucide-react";
import { Card, CardProps } from "./Card";
import { cn } from "@/utils/cn";
import type { ColorPalette } from "@/hooks/useImageColor";

// Lidify brand yellow for all on-page play buttons
const LIDIFY_YELLOW = "#ecb200";

export interface PlayableCardProps extends Omit<CardProps, "onPlay"> {
    href?: string;
    coverArt?: string | null;
    title: string;
    subtitle?: string;
    placeholderIcon?: ReactNode;
    isPlaying?: boolean;
    onPlay?: (e: React.MouseEvent) => void;
    onDownload?: (e: React.MouseEvent) => void;
    showPlayButton?: boolean;
    circular?: boolean;
    badge?: "owned" | "download" | null;
    isDownloading?: boolean;
    colors?: ColorPalette | null; // Optional: pass colors from parent (kept for potential future use)
    tvCardIndex?: number; // TV navigation index
}

const PlayableCard = memo(function PlayableCard({
    href,
    coverArt,
    title,
    subtitle,
    placeholderIcon,
    isPlaying = false,
    onPlay,
    onDownload,
    showPlayButton = true,
    circular = false,
    badge = null,
    isDownloading = false,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    colors = null, // Kept for API compatibility, not used since we use fixed Lidify yellow
    className,
    variant = "default",
    tvCardIndex,
    ...props
}: PlayableCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    // Handle Link click to prevent navigation when clicking on interactive elements
    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        // Check if the click target is a button or inside a button
        const target = e.target as HTMLElement;
        if (target.closest("button")) {
            e.preventDefault();
        }
    };

    const cardContent = (
        <>
            {/* Image Container with Play Button Overlay */}
            {circular ? (
                <div
                    className="relative aspect-square mb-3"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    <div className="relative w-full h-full bg-[#1a1a1a] rounded-full flex items-center justify-center overflow-hidden">
                        {coverArt ? (
                            <Image
                                src={coverArt}
                                alt={title}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                                className={cn(
                                    "object-cover transition-all",
                                    isHovered && "scale-105"
                                )}
                                unoptimized={coverArt.startsWith("http://localhost") || coverArt.startsWith("http://127.0.0.1") || coverArt.startsWith("http://192.168.")}
                            />
                        ) : (
                            placeholderIcon || (
                                <div className="w-12 h-12 bg-[#262626] rounded-full" />
                            )
                        )}
                    </div>
                    {/* Play Button for circular */}
                    {showPlayButton && onPlay && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onPlay(e);
                            }}
                            style={{ backgroundColor: LIDIFY_YELLOW }}
                            className={cn(
                                "absolute bottom-2 right-2 w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-black/40 transition-all duration-300 hover:brightness-90",
                                "hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
                                isHovered || isPlaying
                                    ? "opacity-100 translate-y-0"
                                    : "opacity-0 translate-y-2"
                            )}
                        >
                            {isPlaying ? (
                                <Pause className="w-5 h-5 fill-current text-black" />
                            ) : (
                                <Play className="w-5 h-5 fill-current ml-0.5 text-black" />
                            )}
                        </button>
                    )}
                </div>
            ) : (
                /* Framed Vinyl Look - Square frame with circular image */
                <div
                    className="relative aspect-square bg-[#0a0a0a] rounded-lg mb-3 p-3 flex items-center justify-center overflow-visible"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    <div className="relative w-full h-full rounded-full shadow-lg bg-[#1a1a1a] overflow-hidden flex items-center justify-center">
                        {coverArt ? (
                            <Image
                                src={coverArt}
                                alt={title}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                                className={cn(
                                    "object-cover transition-all ",
                                    isHovered && "scale-110"
                                )}
                                unoptimized={coverArt.startsWith("http://localhost") || coverArt.startsWith("http://127.0.0.1") || coverArt.startsWith("http://192.168.")}
                            />
                        ) : (
                            placeholderIcon || (
                                <div className="w-full h-full flex items-center justify-center">
                                    <div className="w-12 h-12 bg-[#262626] rounded-full" />
                                </div>
                            )
                        )}
                    </div>
                    {/* Play Button for framed vinyl */}
                    {showPlayButton && onPlay && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onPlay(e);
                            }}
                            style={{ backgroundColor: LIDIFY_YELLOW }}
                            className={cn(
                                "absolute bottom-2 right-2 w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-black/40 transition-all duration-300 hover:brightness-90",
                                "hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
                                isHovered || isPlaying
                                    ? "opacity-100 translate-y-0"
                                    : "opacity-0 translate-y-2"
                            )}
                        >
                            {isPlaying ? (
                                <Pause className="w-5 h-5 fill-current text-black" />
                            ) : (
                                <Play className="w-5 h-5 fill-current ml-0.5 text-black" />
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* Badge */}
            {badge && (
                <div className="mb-2">
                    {badge === "owned" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded-full text-xs font-medium text-green-400">
                            <Check className="w-3 h-3" />
                            Owned
                        </span>
                    )}
                    {badge === "download" && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.nativeEvent.stopImmediatePropagation();
                                if (!isDownloading && onDownload) {
                                    onDownload(e);
                                }
                            }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                            }}
                            disabled={isDownloading}
                            className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all",
                                isDownloading
                                    ? "bg-gray-500/20 border border-gray-500/30 text-gray-500 cursor-not-allowed"
                                    : "bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 hover:border-yellow-500/50 text-yellow-400 hover:text-yellow-300"
                            )}
                            title={
                                isDownloading
                                    ? "Downloading..."
                                    : "Download Album"
                            }
                        >
                            <Download
                                className={cn(
                                    "w-3 h-3",
                                    isDownloading && "animate-pulse"
                                )}
                            />
                            {isDownloading ? "Downloading..." : "Download"}
                        </button>
                    )}
                </div>
            )}

            {/* Title and Subtitle */}
            <h3 className="text-sm font-medium text-white truncate mb-1">
                {title}
            </h3>
            {subtitle && (
                <p className="text-xs text-gray-500 truncate">{subtitle}</p>
            )}
        </>
    );

    const cardClassName = cn("group cursor-pointer", className);

    // TV navigation attributes
    const tvNavProps = tvCardIndex !== undefined ? {
        "data-tv-card": true,
        "data-tv-card-index": tvCardIndex,
        tabIndex: 0
    } : {};

    if (href) {
        return (
            <Link
                href={href}
                onClick={handleLinkClick}
                {...tvNavProps}
            >
                <Card variant={variant} className={cardClassName} {...props}>
                    {cardContent}
                </Card>
            </Link>
        );
    }

    return (
        <Card
            variant={variant}
            className={cardClassName}
            {...tvNavProps}
            {...props}
        >
            {cardContent}
        </Card>
    );
});

export { PlayableCard };
