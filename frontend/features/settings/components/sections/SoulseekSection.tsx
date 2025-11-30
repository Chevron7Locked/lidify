import { useState } from "react";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SystemSettings } from "../../types";

interface ServiceSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
    onTest: (service: string) => Promise<void>;
    isTesting: boolean;
}

export function SoulseekSection({ settings, onUpdate, onTest, isTesting }: ServiceSectionProps) {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <section id="soulseek" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">Soulseek</h2>
            <p className="text-sm text-gray-400 mb-4">
                Soulseek peer-to-peer music sharing network
            </p>

            <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={settings.slskdEnabled}
                        onChange={(e) => onUpdate({ slskdEnabled: e.target.checked })}
                        className="w-5 h-5 rounded border-[#333] bg-[#0a0a0a] text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                    />
                    <div>
                        <div className="text-white font-medium">Enable Soulseek (slskd)</div>
                        <div className="text-sm text-gray-400">
                            Connect to slskd client for P2P downloads
                        </div>
                    </div>
                </label>

                {settings.slskdEnabled && (
                    <>
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-yellow-200">
                                Ensure slskd is running and accessible
                            </p>
                        </div>

                        <Input
                            label="slskd URL"
                            type="text"
                            value={settings.slskdUrl}
                            onChange={(e) => onUpdate({ slskdUrl: e.target.value })}
                            placeholder="http://localhost:5030"
                        />

                        <Input
                            label="Soulseek Username"
                            type="text"
                            value={settings.soulseekUsername}
                            onChange={(e) => onUpdate({ soulseekUsername: e.target.value })}
                            placeholder="Enter your Soulseek username"
                        />

                        <div className="w-full">
                            <label className="block text-sm font-medium mb-2 text-white">
                                Soulseek Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={settings.soulseekPassword}
                                    onChange={(e) => onUpdate({ soulseekPassword: e.target.value })}
                                    placeholder="Enter your Soulseek password"
                                    className="w-full bg-[#1a1a1a] border border-[#1c1c1c] rounded-md px-4 py-2 pr-12 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all duration-200"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <Button
                            onClick={() => onTest("slskd")}
                            disabled={isTesting || !settings.slskdUrl || !settings.soulseekUsername || !settings.soulseekPassword}
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
