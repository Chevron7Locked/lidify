import { Info } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { SystemSettings } from "../../types";

interface ServiceSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
    onTest: (service: string) => Promise<void>;
    isTesting: boolean;
}

export function StoragePathsSection({ settings, onUpdate }: ServiceSectionProps) {
    return (
        <section id="storage-paths" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">Storage Paths</h2>
            <p className="text-sm text-gray-400 mb-4">
                Configure storage locations for your music library
            </p>

            <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-4 flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-100 space-y-1">
                        <p className="font-medium">Docker Path Mapping</p>
                        <p className="text-blue-200">
                            These paths are inside the Docker container.
                            Make sure they match your docker-compose.yml volumes:
                        </p>
                        <ul className="list-disc list-inside space-y-0.5 text-blue-200 ml-1">
                            <li>/music should map to your music library</li>
                            <li>/downloads should map to your download location</li>
                        </ul>
                    </div>
                </div>

                <Input
                    label="Music Library Path"
                    type="text"
                    value={settings.musicPath}
                    onChange={(e) => onUpdate({ musicPath: e.target.value })}
                    placeholder="/music"
                />

                <Input
                    label="Downloads Path"
                    type="text"
                    value={settings.downloadPath}
                    onChange={(e) => onUpdate({ downloadPath: e.target.value })}
                    placeholder="/downloads"
                />
            </div>
        </section>
    );
}
