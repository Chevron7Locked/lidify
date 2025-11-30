import { Card } from "@/components/ui/Card";
import { UserSettings } from "../../types";

interface PlaybackQualitySectionProps {
    value: UserSettings["playbackQuality"];
    onChange: (quality: UserSettings["playbackQuality"]) => void;
}

export function PlaybackQualitySection({ value, onChange }: PlaybackQualitySectionProps) {
    const qualities: Array<{ value: UserSettings["playbackQuality"]; label: string; description: string }> = [
        { value: "original", label: "Original", description: "Lossless quality" },
        { value: "high", label: "High", description: "320 kbps" },
        { value: "medium", label: "Medium", description: "192 kbps" },
        { value: "low", label: "Low", description: "128 kbps" },
    ];

    return (
        <section id="playback-quality" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">Playback Quality</h2>
            <p className="text-sm text-gray-400 mb-4">
                Choose the audio quality for streaming. Higher quality uses more bandwidth.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {qualities.map((quality) => (
                    <button
                        key={quality.value}
                        onClick={() => onChange(quality.value)}
                        className={`p-4 rounded-md border transition-all ${
                            value === quality.value
                                ? "border-purple-500 bg-purple-500/10 text-white"
                                : "border-[#1c1c1c] bg-[#0a0a0a] text-gray-400 hover:border-[#333] hover:bg-[#111]"
                        }`}
                    >
                        <div className="font-medium">{quality.label}</div>
                        <div className="text-sm text-gray-500">{quality.description}</div>
                    </button>
                ))}
            </div>
        </section>
    );
}
