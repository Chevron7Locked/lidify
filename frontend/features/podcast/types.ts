export interface EpisodeProgress {
    currentTime: number;
    progress: number;
    isFinished: boolean;
    lastPlayedAt: Date;
}

export interface Episode {
    id: string;
    title: string;
    description?: string;
    duration: number;
    publishedAt: string;
    episodeNumber?: number;
    season?: number;
    progress?: EpisodeProgress;
}

export interface Podcast {
    id: string;
    title: string;
    author: string;
    description?: string;
    coverUrl: string;
    autoDownloadEpisodes: boolean;
    genres?: string[];
    feedUrl?: string;
    episodes: Episode[];
}

export interface PodcastPreview {
    title: string;
    author: string;
    description?: string;
    coverUrl: string;
    genres?: string[];
    feedUrl?: string;
    itunesId?: string;
    isSubscribed: boolean;
    subscribedPodcastId?: string;
    episodeCount?: number;
    previewEpisodes?: Array<{
        title: string;
        publishedAt: string;
        duration: number;
    }>;
}

export interface SimilarPodcast {
    id: string;
    title: string;
    author: string;
    coverUrl?: string;
    episodeCount?: number;
}

