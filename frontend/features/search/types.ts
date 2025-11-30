export type FilterTab = "all" | "library" | "discover" | "soulseek";

export interface Artist {
    id: string;
    name: string;
    heroUrl?: string;
    mbid?: string;
    image?: string;
}

export interface Album {
    id: string;
    title: string;
    coverUrl?: string;
    albumId?: string;
    artist?: {
        name: string;
    };
}

export interface Podcast {
    id: string;
    title: string;
    author?: string;
    imageUrl?: string;
    episodeCount?: number;
}

export interface Track {
    id: string;
    title: string;
    artist?: {
        name: string;
    };
    album?: {
        title: string;
    };
}

export interface SearchResult {
    artists?: Artist[];
    albums?: Album[];
    podcasts?: Podcast[];
    tracks?: Track[];
}

export interface DiscoverResult {
    type: "music" | "podcast";
    name: string;
    mbid?: string;
    image?: string;
}

export interface SoulseekResult {
    username: string;
    path: string;
    filename: string;
    size: number;
    bitrate: number;
    format: string;
    parsedArtist?: string;
    parsedAlbum?: string;
}
