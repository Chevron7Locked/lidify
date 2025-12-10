export interface DiscoverTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  isLiked: boolean;
  likedAt: string | null;
  similarity: number;
  tier: "high" | "medium" | "explore" | "wildcard";
  coverUrl: string | null;
  available: boolean;
}

export interface UnavailableAlbum {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  similarity: number;
  tier: "high" | "medium" | "explore" | "wildcard";
  previewUrl: string | null;
  deezerTrackId: string | null;
  deezerAlbumId: string | null;
  available: false;
}

export interface DiscoverPlaylist {
  weekStart: string;
  weekEnd: string;
  tracks: DiscoverTrack[];
  unavailable: UnavailableAlbum[];
  totalCount: number;
  unavailableCount: number;
}

export interface DiscoverConfig {
  playlistSize: number;
  exclusionMonths: number; // 0-12, months to exclude albums after download (0 = no exclusion)
  downloadRatio: number; // 1.0-2.0, multiplier for albums to request vs target songs
  enabled: boolean;
  lastGeneratedAt: string | null;
}
