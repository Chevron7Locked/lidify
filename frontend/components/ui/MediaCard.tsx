import React, { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { LucideIcon } from "lucide-react";
import { isLocalUrl } from "@/utils/cn";

interface MediaCardProps {
    href: string;
    imageUrl: string | null | undefined;
    title: string;
    subtitle?: string;
    placeholderIcon: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    badge?: React.ReactNode;
    imageShape?: "circle" | "square";
}

const MediaCard = memo(function MediaCard({
    href,
    imageUrl,
    title,
    subtitle,
    placeholderIcon,
    onClick,
    badge,
    imageShape = "circle",
}: MediaCardProps) {
    const content = (
        <div
            className="bg-gradient-to-br from-[#121212] to-[#121212] hover:from-[#181818] hover:to-[#1a1a1a] transition-all duration-300 p-4 rounded-lg cursor-pointer border border-white/5 hover:border-white/10 hover:scale-105 hover:shadow-2xl group"
            onClick={onClick}
        >
            <div
                className={`aspect-square bg-[#181818] ${
                    imageShape === "circle" ? "rounded-full" : "rounded-md"
                } mb-4 flex items-center justify-center overflow-hidden relative shadow-lg`}
            >
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        className="object-cover group-hover:scale-110 transition-all"
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                        priority={false}
                        unoptimized
                    />
                ) : (
                    placeholderIcon
                )}
            </div>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white line-clamp-1 mb-2">
                        {title}
                    </h3>
                    {subtitle && (
                        <p className="text-sm text-gray-400 line-clamp-1">
                            {subtitle}
                        </p>
                    )}
                </div>
                {badge && <div className="flex-shrink-0">{badge}</div>}
            </div>
        </div>
    );

    if (onClick) {
        return content;
    }

    return <Link href={href}>{content}</Link>;
});

export { MediaCard };
