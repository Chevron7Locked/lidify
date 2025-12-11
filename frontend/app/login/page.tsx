"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import Image from "next/image";
import { Loader2, Server, CheckCircle, XCircle, Wifi, Link2 } from "lucide-react";
import { isNativePlatform } from "@/lib/platform";
import { serverConfig, initServerUrlCache, updateServerUrlCache } from "@/lib/server-config";
import { useDeepLink } from "@/hooks/useDeepLink";

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
    const router = useRouter();
    const { login, isAuthenticated } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [twoFactorToken, setTwoFactorToken] = useState("");
    const [requires2FA, setRequires2FA] = useState(false);
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [artists, setArtists] = useState<Artist[]>([]);
    const [currentArtistIndex, setCurrentArtistIndex] = useState(0);
    
    // Server URL state for native platforms
    const [serverUrlInput, setServerUrlInput] = useState("");
    const [serverValidated, setServerValidated] = useState(false);
    const [isValidatingServer, setIsValidatingServer] = useState(false);
    const [serverError, setServerError] = useState("");
    const [isNative, setIsNative] = useState(false);
    const [isCheckingConfig, setIsCheckingConfig] = useState(true);
    
    // Device link code state
    const [showDeviceLink, setShowDeviceLink] = useState(false);
    const [deviceLinkCode, setDeviceLinkCode] = useState("");
    const [isLinkingDevice, setIsLinkingDevice] = useState(false);

    // Initialize deep link handler
    useDeepLink();

    // Check server configuration on mobile platforms
    useEffect(() => {
        const checkServerConfig = async () => {
            const native = isNativePlatform();
            setIsNative(native);
            
            if (!native) {
                setIsCheckingConfig(false);
                return; // Web doesn't need server config
            }

            try {
                // Initialize the cache and check if configured
                const url = await initServerUrlCache();
                if (url) {
                    setServerUrlInput(url);
                    setServerValidated(true);
                    // Refresh API base URL to use the configured server
                    api.refreshBaseUrl();
                }
            } catch (err) {
                // Stay on login page, let user enter server URL
            }
            setIsCheckingConfig(false);
        };

        checkServerConfig();
    }, []);

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

    // Validate and connect to server
    const handleValidateServer = async () => {
        if (!serverUrlInput.trim()) return;

        setIsValidatingServer(true);
        setServerError("");

        // Add protocol if missing
        let urlToTest = serverUrlInput.trim();
        if (!urlToTest.startsWith("http://") && !urlToTest.startsWith("https://")) {
            urlToTest = `http://${urlToTest}`;
        }

        try {
            const result = await serverConfig.validateServerUrl(urlToTest);
            
            if (result.valid) {
                // Save the server URL
                await serverConfig.setServerUrl(urlToTest);
                updateServerUrlCache(urlToTest);
                setServerUrlInput(urlToTest);
                setServerValidated(true);
                // Refresh API base URL
                api.refreshBaseUrl();
            } else {
                setServerError(result.error || "Failed to connect to server");
            }
        } catch (err: any) {
            setServerError(err.message || "Failed to validate server");
        } finally {
            setIsValidatingServer(false);
        }
    };

    // Change to a different server
    const handleChangeServer = async () => {
        await serverConfig.clearServerUrl();
        updateServerUrlCache(null);
        setServerValidated(false);
        setServerError("");
    };

    // Handle device link code submission
    const handleDeviceLinkSubmit = async () => {
        if (!deviceLinkCode.trim() || !serverValidated) return;

        setIsLinkingDevice(true);
        setError("");

        try {
            // Verify the device link code
            const response = await api.request<{ success: boolean; apiKey: string; userId: string; username: string }>(
                `/device-link/verify`,
                { 
                    method: "POST",
                    body: JSON.stringify({ 
                        code: deviceLinkCode.trim().toUpperCase(),
                        deviceName: "Mobile App"
                    })
                }
            );

            if (response.apiKey) {
                localStorage.setItem("auth_token", response.apiKey);
                window.location.href = "/";
            }
        } catch (err: any) {
            setError(err.message || "Invalid or expired code");
        } finally {
            setIsLinkingDevice(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // On native, require server to be validated first
        if (isNative && !serverValidated) {
            await handleValidateServer();
            return;
        }

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
            {/* Handle error from deep link/URL params */}
            <Suspense fallback={null}>
                <LoginErrorHandler setError={setError} />
            </Suspense>

            {/* Animated Background with Artist Images */}
            <div className="absolute inset-0 bg-[#000]">
                {/* Subtle accent gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#ecb200]/5 via-transparent to-transparent" />
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
                        {isCheckingConfig ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                            </div>
                        ) : (
                            <>
                                <h1 className="text-3xl font-bold text-white mb-2 text-center">
                                    {isNative && !serverValidated ? "Connect to Server" : "Welcome back"}
                                </h1>
                                <p className="text-white/60 text-center mb-8">
                                    {isNative && !serverValidated 
                                        ? "Enter your Lidify server URL to get started" 
                                        : "Sign in to continue to Lidify"}
                                </p>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    {error && (
                                        <div className="bg-red-500/10 backdrop-blur-sm border border-red-500/30 rounded-lg p-4 text-sm text-red-400 animate-shake">
                                            {error}
                                        </div>
                                    )}

                                    {/* Device Link Code Entry - TEMPORARILY DISABLED
                                    {isNative && serverValidated && showDeviceLink && !requires2FA && (
                                        <div className="animate-fade-in space-y-4">
                                            ...
                                        </div>
                                    )}
                                    */}

                                    {/* Quick Link Option - TEMPORARILY DISABLED
                                    {isNative && serverValidated && !showDeviceLink && !requires2FA && (
                                        <div className="mb-4">
                                            ...
                                        </div>
                                    )}
                                    */}

                                    {/* Server URL Field - Native platforms only, shown first */}
                                    {isNative && !serverValidated && !requires2FA && (
                                        <div className="animate-fade-in">
                                            <label
                                                htmlFor="serverUrl"
                                                className="block text-sm font-semibold text-white/90 mb-2"
                                            >
                                                Server URL
                                            </label>
                                            <div className="relative">
                                                <Server className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                                <input
                                                    id="serverUrl"
                                                    type="url"
                                                    value={serverUrlInput}
                                                    onChange={(e) => {
                                                        setServerUrlInput(e.target.value);
                                                        setServerError("");
                                                    }}
                                                    placeholder="https://your-server.com or 192.168.1.100:3006"
                                                    required
                                                    autoFocus
                                                    autoCapitalize="none"
                                                    autoCorrect="off"
                                                    autoComplete="off"
                                                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                                                />
                                            </div>
                                            
                                            {/* Server validation error */}
                                            {serverError && (
                                                <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                                                    <XCircle className="w-4 h-4 flex-shrink-0" />
                                                    <span>{serverError}</span>
                                                </div>
                                            )}

                                            {/* Help text */}
                                            <p className="text-xs text-white/40 mt-2">
                                                Enter the URL of your self-hosted Lidify server
                                            </p>
                                        </div>
                                    )}

                                    {/* Connected server indicator - shown when validated */}
                                    {isNative && serverValidated && !requires2FA && (
                                        <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg animate-fade-in">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-400" />
                                                <span className="text-green-400 text-sm truncate max-w-[200px]">
                                                    {serverUrlInput}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleChangeServer}
                                                className="text-xs text-white/50 hover:text-white/80 transition-colors ml-2"
                                            >
                                                Change
                                            </button>
                                        </div>
                                    )}

                                    {/* Step 1: Username & Password - only show after server is validated on native */}
                                    {!requires2FA && (!isNative || serverValidated) && (
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
                                                    autoFocus={!isNative || serverValidated}
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
                                disabled={isLoading || isValidatingServer}
                                className="w-full py-3.5 bg-[#ecb200] text-black font-bold rounded-lg hover:bg-[#ffc933] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="flex items-center justify-center gap-2">
                                    {isValidatingServer ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : isLoading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Signing in...
                                        </>
                                    ) : isNative && !serverValidated ? (
                                        <>
                                            <Wifi className="w-5 h-5" />
                                            Connect to Server
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
                                    className="text-xs text-white/50 hover:text-white/80 transition-colors"
                                >
                                    ← Back to login
                                </button>
                            )}
                        </form>
                            </>
                        )}
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
