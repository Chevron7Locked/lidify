import { useEffect, useState, useCallback } from "react";
import { Artist, Album, Track, Tab } from "../types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export type LibraryFilter = 'owned' | 'discovery' | 'all';

interface UseLibraryDataProps {
  activeTab: Tab;
  filter?: LibraryFilter;
}

export function useLibraryData({ activeTab, filter = 'owned' }: UseLibraryDataProps) {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated } = useAuth();

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      if (activeTab === "artists") {
        const { artists } = await api.getArtists({ limit: 500, filter });
        setArtists(artists);
      } else if (activeTab === "albums") {
        const { albums } = await api.getAlbums({ limit: 500, filter });
        setAlbums(albums);
      } else if (activeTab === "tracks") {
        // Tracks filter could be added later if needed
        const { tracks } = await api.getTracks({ limit: 500 });
        setTracks(tracks);
      }
    } catch (error) {
      console.error("Failed to load library data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, filter, isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const reloadData = () => {
    loadData();
  };

  return {
    artists,
    albums,
    tracks,
    isLoading,
    reloadData,
  };
}
