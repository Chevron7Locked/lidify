import React from 'react';

interface OfflineModeSectionProps {
  offlineEnabled: boolean;
  wifiOnly: boolean;
  onChange: (updates: { offlineEnabled?: boolean; wifiOnly?: boolean }) => void;
}

export const OfflineModeSection: React.FC<OfflineModeSectionProps> = ({
  offlineEnabled,
  wifiOnly,
  onChange,
}) => {
  return (
    <section id="offline-mode" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
      <h2 className="text-xl font-semibold text-white mb-4">Offline Mode</h2>
      <p className="text-sm text-gray-400 mb-4">
        Configure offline playback and download preferences
      </p>

      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={offlineEnabled}
            onChange={(e) => onChange({ offlineEnabled: e.target.checked })}
            className="w-5 h-5 rounded border-[#333] bg-[#0a0a0a] text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
          />
          <div>
            <div className="text-white font-medium">Enable Offline Mode</div>
            <div className="text-sm text-gray-400">
              Allow downloading content for offline playback
            </div>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={wifiOnly}
            onChange={(e) => onChange({ wifiOnly: e.target.checked })}
            className="w-5 h-5 rounded border-[#333] bg-[#0a0a0a] text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
          />
          <div>
            <div className="text-white font-medium">Download Only on WiFi</div>
            <div className="text-sm text-gray-400">
              Prevent downloads when using mobile data
            </div>
          </div>
        </label>
      </div>
    </section>
  );
};
