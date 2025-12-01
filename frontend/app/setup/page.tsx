"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Image from "next/image";

/**
 * Setup page - now redirects to login since login page handles server URL entry
 * Kept as a simple redirect for backwards compatibility
 */
export default function SetupPage() {
    const router = useRouter();

    // Redirect to login - login page now handles server URL entry
    useEffect(() => {
                    router.replace("/login");
    }, [router]);

    // Show loading state while redirecting
    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
            {/* Logo */}
            <div className="mb-8">
                <Image
                    src="/assets/images/LIDIFY.webp"
                    alt="Lidify"
                    width={120}
                    height={120}
                    className="opacity-90"
                />
            </div>

            {/* Loading */}
            <div className="flex items-center gap-3 text-white/60">
                                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Redirecting to login...</span>
            </div>
        </div>
    );
}

