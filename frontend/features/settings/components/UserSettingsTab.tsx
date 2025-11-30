import { PlaybackQualitySection } from "./sections/PlaybackQualitySection";
import { OfflineModeSection } from "./sections/OfflineModeSection";
import { UserSettings } from "../types";

interface UserSettingsTabProps {
    settings: UserSettings;
    onUpdate: (updates: Partial<UserSettings>) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
}

export function UserSettingsTab({ settings, onUpdate, onSave, isSaving }: UserSettingsTabProps) {
    return (
        <div className="space-y-6">
            <PlaybackQualitySection
                value={settings.playbackQuality}
                onChange={(quality) =>
                    onUpdate({ playbackQuality: quality })
                }
            />

            <OfflineModeSection
                offlineEnabled={settings.offlineEnabled}
                wifiOnly={settings.wifiOnly}
                onChange={(updates) => onUpdate(updates)}
            />

            {/* Save Button */}
            <div className="pt-6">
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="w-full bg-[#111] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg border border-[#1c1c1c] transition-colors"
                >
                    {isSaving ? "Saving..." : "Save Changes"}
                </button>
            </div>
        </div>
    );
}
