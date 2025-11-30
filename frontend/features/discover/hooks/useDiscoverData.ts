import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { DiscoverPlaylist, DiscoverConfig } from '../types';

export function useDiscoverData() {
  const [playlist, setPlaylist] = useState<DiscoverPlaylist | null>(null);
  const [config, setConfig] = useState<DiscoverConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);

    try {
      const [playlistData, configData] = await Promise.all([
        api.getCurrentDiscoverWeekly().catch(() => null),
        api.getDiscoverConfig().catch(() => null),
      ]);

      setPlaylist(playlistData);
      setConfig(configData);
    } catch (error) {
      console.error('Failed to load discover data:', error);
    } finally {
      // Add 100ms delay before setting loading false
      setTimeout(() => {
        setLoading(false);
      }, 100);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return {
    playlist,
    config,
    setConfig,
    loading,
    reloadData: loadData,
  };
}
