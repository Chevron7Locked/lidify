"use client";

import { PlayableCard } from "@/components/ui/PlayableCard";
import { Disc3 } from "lucide-react";
import { api } from "@/lib/api";
import type { Album } from "../types";

interface DiscographyProps {
    albums: Album[];
    colors: any;
    onPlayAlbum: (albumId: string, albumTitle: string) => Promise<void>;
}

export function Discography({ albums, colors, onPlayAlbum }: DiscographyProps) {
    if (!albums || albums.length === 0) {
        return null;
    }

    return (
        <section>
            <h2 className="text-2xl md:text-3xl font-bold mb-6">Discography</h2>
            <div data-tv-section="discography" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {albums.map((album, index) => {
                    const subtitle = [
                        album.year,
                        album.trackCount && `${album.trackCount} tracks`,
                    ]
                        .filter(Boolean)
                        .join(" • ");

                    return (
                        <PlayableCard
                            key={album.id}
                            href={`/album/${album.id}`}
                            coverArt={
                                album.coverArt
                                    ? api.getCoverArtUrl(album.coverArt, 300)
                                    : null
                            }
                            title={album.title}
                            subtitle={subtitle}
                            placeholderIcon={
                                <Disc3 className="w-12 h-12 text-gray-600" />
                            }
                            badge="owned"
                            circular={false}
                            colors={colors}
                            onPlay={() => onPlayAlbum(album.id, album.title)}
                            tvCardIndex={index}
                        />
                    );
                })}
            </div>
        </section>
    );
}
