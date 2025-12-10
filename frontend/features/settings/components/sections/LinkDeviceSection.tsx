import Link from "next/link";
import { Smartphone, QrCode, ArrowRight } from "lucide-react";

export function LinkDeviceSection() {
    return (
        <div
            id="link-device"
            className="bg-[#111] rounded-lg p-6 border border-[#1c1c1c]"
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-purple-500/10">
                    <Smartphone className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                    <h3 className="font-medium text-white">Link Mobile Device</h3>
                    <p className="text-sm text-gray-400">
                        Connect your phone without typing passwords
                    </p>
                </div>
            </div>

            <p className="text-sm text-gray-400 mb-4">
                Generate a QR code or 6-digit code to quickly link your mobile device.
                No need to type your server URL or password on your phone.
            </p>

            <Link
                href="/device"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors border border-purple-500/30"
            >
                <QrCode className="w-4 h-4" />
                <span>Link a Device</span>
                <ArrowRight className="w-4 h-4" />
            </Link>
        </div>
    );
}









