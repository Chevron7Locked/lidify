import { useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SystemSettings } from "../../types";

interface AIServicesSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
    onTest: (service: string) => Promise<void>;
    isTesting: boolean;
}

export function AIServicesSection({
    settings,
    onUpdate,
    onTest,
    isTesting,
}: AIServicesSectionProps) {
    const [showFanartKey, setShowFanartKey] = useState(false);
    const [showOpenaiKey, setShowOpenaiKey] = useState(false);

    return (
        <section
            id="ai-services"
            className="bg-[#111] rounded-lg p-6 scroll-mt-8"
        >
            <h2 className="text-xl font-semibold text-white mb-4">
                AI & Metadata Services
            </h2>

            {/* Fanart.tv Section */}
            <div className="mb-8">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-medium text-white mb-1">
                            Fanart.tv
                        </h3>
                        <p className="text-sm text-gray-400">
                            Fanart.tv provides high-quality album artwork
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.fanartEnabled}
                            onChange={(e) =>
                                onUpdate({ fanartEnabled: e.target.checked })
                            }
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-[#1a1a1a] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                </div>

                <div className="space-y-4">
                    <Input
                        label="API Key"
                        type={showFanartKey ? "text" : "password"}
                        value={settings.fanartApiKey}
                        onChange={(e) =>
                            onUpdate({ fanartApiKey: e.target.value })
                        }
                        placeholder="Enter your Fanart.tv API key"
                        disabled={!settings.fanartEnabled}
                        rightIcon={
                            <button
                                type="button"
                                onClick={() => setShowFanartKey(!showFanartKey)}
                                className="focus:outline-none"
                            >
                                {showFanartKey ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        }
                    />

                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => onTest("fanart")}
                            variant="secondary"
                            disabled={
                                !settings.fanartEnabled ||
                                !settings.fanartApiKey ||
                                isTesting
                            }
                            isLoading={isTesting}
                        >
                            Test Connection
                        </Button>

                        <a
                            href="https://fanart.tv/get-an-api-key/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                            Get API Key
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </div>
            </div>

            {/* OpenAI Section */}
            <div className="hidden">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-medium text-white mb-1">
                            OpenAI
                        </h3>
                        <p className="text-sm text-gray-400">
                            OpenAI for AI-powered features and recommendations
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.openaiEnabled}
                            onChange={(e) =>
                                onUpdate({ openaiEnabled: e.target.checked })
                            }
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-[#1a1a1a] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                </div>

                <div className="space-y-4">
                    <Input
                        label="API Key"
                        type={showOpenaiKey ? "text" : "password"}
                        value={settings.openaiApiKey}
                        onChange={(e) =>
                            onUpdate({ openaiApiKey: e.target.value })
                        }
                        placeholder="Enter your OpenAI API key"
                        disabled={!settings.openaiEnabled}
                        rightIcon={
                            <button
                                type="button"
                                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                className="focus:outline-none"
                            >
                                {showOpenaiKey ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        }
                    />

                    <Input
                        label="Model"
                        type="text"
                        value={settings.openaiModel}
                        onChange={(e) =>
                            onUpdate({ openaiModel: e.target.value })
                        }
                        placeholder="gpt-4"
                        disabled={!settings.openaiEnabled}
                    />

                    <Button
                        onClick={() => onTest("openai")}
                        variant="secondary"
                        disabled={
                            !settings.openaiEnabled ||
                            !settings.openaiApiKey ||
                            isTesting
                        }
                        isLoading={isTesting}
                    >
                        Test Connection
                    </Button>
                </div>
            </div>
        </section>
    );
}
