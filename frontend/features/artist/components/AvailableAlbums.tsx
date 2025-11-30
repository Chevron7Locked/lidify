"use client";

import { Album, ArtistSource } from "../types";
import { PlayableCard } from "@/components/ui/PlayableCard";
import { Disc3 } from "lucide-react";
import { api } from "@/lib/api";

interface AvailableAlbumsProps {
    albums: Album[];
    artistName: string;
    source: ArtistSource;
    colors: any;
    onDownloadAlbum: (album: Album, e: React.MouseEvent) => void;
    isPendingDownload: (mbid: string) => boolean;
}

function AlbumGrid({
    albums,
    source,
    colors,
    onDownloadAlbum,
    isPendingDownload,
}: Omit<AvailableAlbumsProps, "artistName">) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {albums.map((album, index) => {
                // Determine cover art based on source
                const coverArt =
                    source === "library" && album.coverArt
                        ? api.getCoverArtUrl(album.coverArt, 300)
                        : album.coverUrl
                        ? api.getCoverArtUrl(album.coverUrl, 300)
                        : null;

                // Get MBID for download tracking
                const albumMbid = album.rgMbid || album.mbid || "";

                // Build subtitle with year and type
                const subtitleParts: string[] = [];
                if (album.year) subtitleParts.push(String(album.year));
                if (album.type) subtitleParts.push(album.type);
                const subtitle = subtitleParts.join(" • ");

                return (
                    <PlayableCard
                        key={album.id}
                        href={`/album/${album.id}`}
                        coverArt={coverArt}
                        title={album.title}
                        subtitle={subtitle}
                        placeholderIcon={
                            <Disc3 className="w-12 h-12 text-gray-600" />
                        }
                        circular={false}
                        badge="download"
                        showPlayButton={false}
                        colors={colors}
                        isDownloading={isPendingDownload(albumMbid)}
                        onDownload={(e) => onDownloadAlbum(album, e)}
                        tvCardIndex={index}
                    />
                );
            })}
        </div>
    );
}

export function AvailableAlbums({
    albums,
    artistName,
    source,
    colors,
    onDownloadAlbum,
    isPendingDownload,
}: AvailableAlbumsProps) {
    if (!albums || albums.length === 0) {
        return null;
    }

    // Separate studio albums from EPs/Singles/Demos
    const studioAlbums = albums.filter(
        (album) => album.type?.toLowerCase() === "album"
    );
    const epsAndSingles = albums.filter(
        (album) => album.type?.toLowerCase() !== "album"
    );

    return (
        <>
            {/* Studio Albums Section */}
            {studioAlbums.length > 0 && (
                <section>
                    <h2 className="text-2xl md:text-3xl font-bold mb-6">
                        Albums Available to Download
                    </h2>
                    <div data-tv-section="available-albums">
                        <AlbumGrid
                            albums={studioAlbums}
                            source={source}
                            colors={colors}
                            onDownloadAlbum={onDownloadAlbum}
                            isPendingDownload={isPendingDownload}
                        />
                    </div>
                </section>
            )}

            {/* EPs, Singles & Demos Section */}
            {epsAndSingles.length > 0 && (
                <section>
                    <h2 className="text-2xl md:text-3xl font-bold mb-6">
                        EPs & Singles Available to Download
                    </h2>
                    <div data-tv-section="available-eps-singles">
                        <AlbumGrid
                            albums={epsAndSingles}
                            source={source}
                            colors={colors}
                            onDownloadAlbum={onDownloadAlbum}
                            isPendingDownload={isPendingDownload}
                        />
                    </div>
                </section>
            )}
        </>
    );
}
