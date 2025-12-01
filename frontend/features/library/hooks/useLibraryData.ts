import { useEffect, useState } from "react";
import { Artist, Album, Track, Tab } from "../types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface UseLibraryDataProps {
  activeTab: Tab;
}

export function useLibraryData({ activeTab }: UseLibraryDataProps) {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated } = useAuth();

  const loadData = async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      if (activeTab === "artists") {
        const { artists } = await api.getArtists({ limit: 500 });
        setArtists(artists);
      } else if (activeTab === "albums") {
        const { albums } = await api.getAlbums({ limit: 500 });
        setAlbums(albums);
      } else if (activeTab === "tracks") {
        const { tracks } = await api.getTracks({ limit: 500 });
        setTracks(tracks);
      }
    } catch (error) {
      console.error("Failed to load library data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, isAuthenticated]);

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
