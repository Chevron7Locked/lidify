import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SystemSettings } from "../../types";

interface ServiceSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
    onTest: (service: string) => Promise<void>;
    isTesting: boolean;
}

export function LidarrSection({ settings, onUpdate, onTest, isTesting }: ServiceSectionProps) {
    const [showApiKey, setShowApiKey] = useState(false);

    return (
        <section id="lidarr" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">Lidarr</h2>
            <p className="text-sm text-gray-400 mb-4">
                Lidarr automates music downloads and library management
            </p>

            <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={settings.lidarrEnabled}
                        onChange={(e) => onUpdate({ lidarrEnabled: e.target.checked })}
                        className="w-5 h-5 rounded border-[#333] bg-[#0a0a0a] text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                    />
                    <div>
                        <div className="text-white font-medium">Enable Lidarr</div>
                        <div className="text-sm text-gray-400">
                            Connect to Lidarr for music automation
                        </div>
                    </div>
                </label>

                {settings.lidarrEnabled && (
                    <>
                        <Input
                            label="Lidarr URL"
                            type="text"
                            value={settings.lidarrUrl}
                            onChange={(e) => onUpdate({ lidarrUrl: e.target.value })}
                            placeholder="http://localhost:8686"
                        />

                        <div className="w-full">
                            <label className="block text-sm font-medium mb-2 text-white">
                                API Key
                            </label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? "text" : "password"}
                                    value={settings.lidarrApiKey}
                                    onChange={(e) => onUpdate({ lidarrApiKey: e.target.value })}
                                    placeholder="Enter your Lidarr API key"
                                    className="w-full bg-[#1a1a1a] border border-[#1c1c1c] rounded-md px-4 py-2 pr-12 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all duration-200"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                >
                                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <Button
                            onClick={() => onTest("lidarr")}
                            disabled={isTesting || !settings.lidarrUrl || !settings.lidarrApiKey}
                            isLoading={isTesting}
                            variant="secondary"
                        >
                            Test Connection
                        </Button>
                    </>
                )}
            </div>
        </section>
    );
}
