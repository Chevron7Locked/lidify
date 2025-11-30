import React, { useState } from 'react';
import { useToast } from '@/lib/toast-context';
import { api } from '@/lib/api';

interface CacheSettingsSectionProps {
  maxCacheSizeMb: number;
  onChange: (value: number) => void;
}

export const CacheSettingsSection: React.FC<CacheSettingsSectionProps> = ({
  maxCacheSizeMb,
  onChange,
}) => {
  const [clearingCaches, setClearingCaches] = useState(false);
  const { toast } = useToast();

  const handleClearCaches = async () => {
    setClearingCaches(true);
    try {
      await api.clearAllCaches();
      toast.success('All caches cleared successfully');
    } catch (error) {
      toast.error('Failed to clear caches');
      console.error('Error clearing caches:', error);
    } finally {
      setClearingCaches(false);
    }
  };

  const cacheSizeInGB = (maxCacheSizeMb / 1024).toFixed(1);

  return (
    <section id="cache-settings" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
      <h2 className="text-xl font-semibold text-white mb-4">Cache Settings</h2>
      <p className="text-sm text-gray-400 mb-4">
        Manage storage and cache preferences
      </p>

      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-white font-medium">Maximum Cache Size</label>
            <span className="text-purple-400 font-medium">{cacheSizeInGB} GB</span>
          </div>
          <input
            type="range"
            min="512"
            max="20480"
            step="512"
            value={maxCacheSizeMb}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 bg-[#0a0a0a] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0.5 GB</span>
            <span>20 GB</span>
          </div>
        </div>

        <div>
          <button
            onClick={handleClearCaches}
            disabled={clearingCaches}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {clearingCaches ? 'Clearing...' : 'Clear All Caches'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            This will free up storage space by removing all cached content
          </p>
        </div>
      </div>
    </section>
  );
};
