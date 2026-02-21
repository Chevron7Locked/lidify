// backend/src/routes/subsonic/mappers.ts
// Shared mapper functions used across all Subsonic route files.
// These convert Kima's Prisma models to Subsonic API response shapes.
// The @_ prefix convention is used by fast-xml-parser for XML attributes.
// subsonicResponse.ts strips these prefixes for JSON output automatically.

export type ArtistRow = {
    id: string;
    name: string;
    displayName: string | null;
    heroUrl: string | null;
    albumCount?: number;
};

export type AlbumRow = {
    id: string;
    title: string;
    displayTitle: string | null;
    year: number | null;
    coverUrl: string | null;
    userCoverUrl?: string | null;
    artistId: string;
    songCount?: number;
    duration?: number;
};

export type TrackRow = {
    id: string;
    title: string;
    trackNo: number | null;
    duration: number | null;
    filePath: string | null;
    mime: string | null;
    fileSize: bigint | null;
};

export function mapArtist(a: ArtistRow) {
    return {
        "@_id": a.id,
        "@_name": a.displayName || a.name,
        "@_albumCount": a.albumCount ?? 0,
        "@_coverArt": `ar-${a.id}`,
        "@_artistImageUrl": a.heroUrl || undefined,
    };
}

export function mapAlbum(album: AlbumRow, artistName: string) {
    return {
        "@_id": album.id,
        "@_name": album.displayTitle || album.title,
        "@_artist": artistName,
        "@_artistId": album.artistId,
        "@_coverArt": album.id,
        "@_songCount": album.songCount ?? 0,
        "@_duration": album.duration !== undefined ? Math.round(album.duration) : 0,
        "@_year": album.year || undefined,
    };
}

export function mapSong(
    track: TrackRow,
    album: { id: string; title: string; displayTitle: string | null; year: number | null },
    artistName: string,
    artistId: string
) {
    return {
        "@_id": track.id,
        "@_parent": album.id,
        "@_title": track.title,
        "@_album": album.displayTitle || album.title,
        "@_artist": artistName,
        "@_isDir": false,
        "@_coverArt": album.id,
        "@_duration": track.duration ? Math.round(track.duration) : 0,
        "@_bitRate": estimateBitrateFromMime(track.mime),
        "@_track": track.trackNo || undefined,
        "@_year": album.year || undefined,
        "@_size": track.fileSize ? Number(track.fileSize) : undefined,
        "@_contentType": track.mime || "audio/mpeg",
        "@_suffix": mimeToSuffix(track.mime),
        "@_albumId": album.id,
        "@_artistId": artistId,
        "@_type": "music",
    };
}

function estimateBitrateFromMime(mime: string | null): number {
    if (!mime) return 192;
    if (mime.includes("flac")) return 900;
    if (mime.includes("wav")) return 1400;
    if (mime.includes("aac") || mime.includes("mp4")) return 256;
    if (mime.includes("ogg") || mime.includes("vorbis")) return 192;
    if (mime.includes("opus")) return 128;
    return 192;
}

export function mimeToSuffix(mime: string | null): string {
    if (!mime) return "mp3";
    const map: Record<string, string> = {
        "audio/flac": "flac",
        "audio/x-flac": "flac",
        "audio/ogg": "ogg",
        "audio/vorbis": "ogg",
        "audio/mp4": "m4a",
        "audio/aac": "aac",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/opus": "opus",
    };
    return map[mime] || "mp3";
}

export function bitrateToQuality(
    maxBitRate: string | undefined
): "original" | "high" | "medium" | "low" {
    const br = parseInt(maxBitRate || "0", 10);
    if (br === 0 || br >= 320) return "original";
    if (br >= 192) return "high";
    if (br >= 128) return "medium";
    return "low";
}
