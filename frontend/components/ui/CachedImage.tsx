"use client";

import { useCachedImage } from "@/hooks/useCachedImage";
import { ImgHTMLAttributes, memo } from "react";

interface CachedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
    src: string | null | undefined;
}

/**
 * Image component that uses client-side caching to prevent reloading
 * Uses blob URLs to persist images across re-renders
 */
const CachedImage = memo(function CachedImage({ src, alt = "", ...props }: CachedImageProps) {
    const cachedSrc = useCachedImage(src || null);

    if (!cachedSrc) {
        return null;
    }

    return <img src={cachedSrc} alt={alt} {...props} />;
});

export { CachedImage };
