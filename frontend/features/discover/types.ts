export interface DiscoverTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  isLiked: boolean;
  likedAt: string | null;
  similarity: number;
  tier: "high" | "medium" | "low" | "wild";
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
  tier: "high" | "medium" | "low" | "wild";
  previewUrl: string | null;
  deezerTrackId: string | null;
  deezerAlbumId: string | null;
  attemptNumber: number; // 0 = original, 1+ = replacement attempts
  originalAlbumId: string | null; // ID of original album if this is a replacement
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
  maxRetryAttempts: number;
  enabled: boolean;
  lastGeneratedAt: string | null;
}
