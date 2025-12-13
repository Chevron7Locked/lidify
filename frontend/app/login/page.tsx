"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { GalaxyBackground } from "@/components/ui/GalaxyBackground";

interface Artist {
    id: string;
    name: string;
    heroUrl: string | null;
    albumCount?: number;
}

// Separate component to handle search params (needs Suspense boundary)
function LoginErrorHandler({ setError }: { setError: (error: string) => void }) {
    const searchParams = useSearchParams();
    
    useEffect(() => {
        const errorParam = searchParams.get("error");
        if (errorParam) {
            setError(decodeURIComponent(errorParam));
        }
    }, [searchParams, setError]);
    
    return null;
}

export default function LoginPage() {
    const { login } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [twoFactorToken, setTwoFactorToken] = useState("");
    const [requires2FA, setRequires2FA] = useState(false);
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [artists, setArtists] = useState<Artist[]>([]);
    const [currentArtistIndex, setCurrentArtistIndex] = useState(0);

    // Fetch featured artists for background rotation
    useEffect(() => {
        const fetchArtists = async () => {
            try {
                // Get recently listened artists (public endpoint or cached data)
                const response = await fetch(
                    "/api/library/recently-listened?limit=10"
                );
                if (response.ok) {
                    const data = await response.json();
                    const artistsWithImages = data.artists.filter(
                        (a: Artist) => a.heroUrl
                    );
                    setArtists(
                        artistsWithImages.length > 0 ? artistsWithImages : []
                    );
                }
                // Silently ignore errors (expected when not authenticated)
            } catch (err) {
                // Fail silently - login page will work without backgrounds
            }
        };

        fetchArtists();
    }, []);

    // Rotate through artists every 5 seconds
    useEffect(() => {
        if (artists.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentArtistIndex((prev) => (prev + 1) % artists.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [artists.length]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            // First step: Send username and password
            if (!requires2FA) {
                await login(username, password);
                // If we get here, either:
                // 1. Login succeeded (no 2FA)
                // 2. We'll catch the requires2FA response below
            } else {
                // Second step: Send 2FA token
                await login(username, password, twoFactorToken);
                // If successful, login() will redirect
            }
        } catch (err) {
            const errorMsg =
                err instanceof Error ? err.message : "Login failed";

            // Check if 2FA is required
            if (
                errorMsg.includes("2FA token required") ||
                errorMsg.includes("requires2FA")
            ) {
                setRequires2FA(true);
                setError("");
            } else if (
                errorMsg.includes("Invalid 2FA token") ||
                errorMsg.includes("Invalid recovery code")
            ) {
                setError(errorMsg);
                setTwoFactorToken(""); // Clear the token for retry
            } else {
                setError(errorMsg);
                setRequires2FA(false);
                setTwoFactorToken("");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const currentArtist = artists[currentArtistIndex];

    return (
        <div className="min-h-screen w-full relative overflow-hidden">
            {/* Handle error from URL params */}
            <Suspense fallback={null}>
                <LoginErrorHandler setError={setError} />
            </Suspense>

            {/* Animated Background with Artist Images */}
            <div className="absolute inset-0 bg-[#000]">
                {/* Subtle accent gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#ecb200]/5 via-transparent to-transparent" />

                {/* Ultra-subtle starfield texture (dialed down vs the main app) */}
                <div className="opacity-[0.08]">
                    <GalaxyBackground primaryColor="#ecb200" secondaryColor="#ecb200" />
                </div>

                {artists.length > 0 && currentArtist?.heroUrl && (
                    <>
                        <div
                            key={currentArtistIndex}
                            className="absolute inset-0 transition-opacity duration-1000"
                        >
                            <Image
                                src={currentArtist.heroUrl}
                                alt={currentArtist.name}
                                fill
                                className="object-cover"
                                priority
                            />
                        </div>
                        {/* Heavy blur overlay */}
                        <div className="absolute inset-0 backdrop-blur-[100px] bg-black/60" />

                        {/* Gradient overlays for depth */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/80" />
                    </>
                )}
            </div>

            {/* Artist Info Section - Bottom Left */}
            {currentArtist && (
                <div className="absolute bottom-8 left-8 z-10 text-white max-w-md animate-fade-in">
                    <p className="text-sm font-medium text-white/60 mb-2">
                        Featured Artist
                    </p>
                    <h2 className="text-4xl md:text-5xl font-bold mb-2 drop-shadow-2xl">
                        {currentArtist.name}
                    </h2>
                    {currentArtist.albumCount !== undefined && (
                        <p className="text-white/70 text-sm">
                            {currentArtist.albumCount} album
                            {currentArtist.albumCount !== 1 ? "s" : ""} in your
                            library
                        </p>
                    )}
                </div>
            )}

            {/* Login Form - Centered */}
            <div className="relative z-20 min-h-screen flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="flex items-center justify-center mb-12">
                        <div className="relative flex gap-3 items-center group">
                            <div className="relative">
                                <div className="absolute inset-0 bg-white/10 blur-xl rounded-full group-hover:bg-white/20 transition-all duration-300" />
                                <Image
                                    src="/assets/images/LIDIFY.webp"
                                    alt="Lidify"
                                    width={44}
                                    height={44}
                                    className="relative z-10 drop-shadow-2xl"
                                />
                            </div>
                            <span className="text-3xl font-bold bg-gradient-to-r from-white via-white to-gray-200 bg-clip-text text-transparent drop-shadow-2xl">
                                Lidify
                            </span>
                        </div>
                    </div>

                    {/* Login Card */}
                    <div className="bg-[#111] rounded-2xl p-8 md:p-10 border border-[#333] shadow-2xl">
                        <h1 className="text-3xl font-bold text-white mb-2 text-center">
                            Welcome back
                        </h1>
                        <p className="text-white/60 text-center mb-8">
                            Sign in to continue to Lidify
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <div className="bg-red-500/10 backdrop-blur-sm border border-red-500/30 rounded-lg p-4 text-sm text-red-400 animate-shake">
                                    {error}
                                </div>
                            )}

                            {/* Step 1: Username & Password */}
                            {!requires2FA && (
                                <>
                                    <div>
                                        <label
                                            htmlFor="username"
                                            className="block text-sm font-semibold text-white/90 mb-2"
                                        >
                                            Username
                                        </label>
                                        <input
                                            id="username"
                                            type="text"
                                            value={username}
                                            onChange={(e) =>
                                                setUsername(e.target.value)
                                            }
                                            placeholder="Enter your username"
                                            required
                                            autoFocus
                                            autoCapitalize="none"
                                            autoCorrect="off"
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                                        />
                                    </div>

                                    <div>
                                        <label
                                            htmlFor="password"
                                            className="block text-sm font-semibold text-white/90 mb-2"
                                        >
                                            Password
                                        </label>
                                        <input
                                            id="password"
                                            type="password"
                                            value={password}
                                            onChange={(e) =>
                                                setPassword(e.target.value)
                                            }
                                            placeholder="Enter your password"
                                            required
                                            autoCapitalize="none"
                                            autoCorrect="off"
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Step 2: 2FA Token Input */}
                            {requires2FA && (
                                <div className="animate-fade-in space-y-4">
                                    <div className="p-4 bg-[#ecb200]/10 border border-[#ecb200]/20 rounded-lg">
                                        <p className="text-white/90 text-sm font-semibold mb-1">
                                            Two-Factor Authentication Required
                                        </p>
                                        <p className="text-white/60 text-xs">
                                            Logging in as{" "}
                                            <strong>{username}</strong>
                                        </p>
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="twoFactorToken"
                                            className="block text-sm font-semibold text-white/90 mb-2"
                                        >
                                            {useRecoveryCode
                                                ? "Recovery Code"
                                                : "Authentication Code"}
                                        </label>
                                        <input
                                            id="twoFactorToken"
                                            type="text"
                                            value={twoFactorToken}
                                            onChange={(e) => {
                                                if (useRecoveryCode) {
                                                    // Recovery code: 8 hex characters
                                                    setTwoFactorToken(
                                                        e.target.value
                                                            .replace(
                                                                /[^A-Fa-f0-9]/g,
                                                                ""
                                                            )
                                                            .slice(0, 8)
                                                            .toUpperCase()
                                                    );
                                                } else {
                                                    // TOTP: 6 digits
                                                    setTwoFactorToken(
                                                        e.target.value
                                                            .replace(/\D/g, "")
                                                            .slice(0, 6)
                                                    );
                                                }
                                            }}
                                            placeholder={
                                                useRecoveryCode
                                                    ? "ABCD1234"
                                                    : "000000"
                                            }
                                            maxLength={useRecoveryCode ? 8 : 6}
                                            required
                                            autoFocus
                                            autoCapitalize="none"
                                            autoCorrect="off"
                                            className="w-full px-4 py-3 bg-white/5 border border-[#ecb200]/30 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#ecb200]/50 focus:border-transparent transition-all duration-200 backdrop-blur-sm text-center text-2xl tracking-widest"
                                        />
                                        <p className="text-xs text-white/50 mt-2">
                                            {useRecoveryCode
                                                ? "Enter your 8-character recovery code"
                                                : "Enter the 6-digit code from your authenticator app"}
                                        </p>
                                    </div>

                                    {/* Toggle between TOTP and Recovery Code */}
                                    <div className="flex items-center justify-center">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setUseRecoveryCode(
                                                    !useRecoveryCode
                                                );
                                                setTwoFactorToken("");
                                                setError("");
                                            }}
                                            className="text-xs text-[#ecb200] hover:text-[#ffc933] transition-colors underline"
                                        >
                                            {useRecoveryCode
                                                ? "Use authenticator app instead"
                                                : "Use recovery code instead"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 bg-[#ecb200] text-black font-bold rounded-lg hover:bg-[#ffc933] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="flex items-center justify-center gap-2">
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Signing in...
                                        </>
                                    ) : (
                                        "Sign In"
                                    )}
                                </span>
                            </button>

                            {requires2FA && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRequires2FA(false);
                                        setTwoFactorToken("");
                                        setUseRecoveryCode(false);
                                        setError("");
                                    }}
                                    className="w-full text-xs text-white/50 hover:text-white/80 transition-colors"
                                >
                                    ← Back to login
                                </button>
                            )}
                        </form>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-white/40 text-sm mt-6">
                        © 2025 Lidify. Your music, your way.
                    </p>
                </div>
            </div>
        </div>
    );
}
