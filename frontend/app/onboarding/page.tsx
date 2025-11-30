"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Image from "next/image";
import { GradientSpinner } from "@/components/ui/GradientSpinner";

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState("");

    // Step 1: Account creation
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Check if user is already logged in and skip to step 2
    useEffect(() => {
        const checkExistingSession = async () => {
            try {
                const user = await api.getCurrentUser();
                if (user && !user.onboardingComplete) {
                    // User exists but hasn't completed onboarding - skip to step 2
                    setStep(2);
                }
            } catch (error) {
                // Not logged in, stay on step 1
            } finally {
                setInitialLoading(false);
            }
        };
        checkExistingSession();
    }, []);

    // Step 2: Integrations
    const [lidarr, setLidarr] = useState({
        url: "",
        apiKey: "",
        enabled: false,
    });
    const [audiobookshelf, setAudiobookshelf] = useState({
        url: "",
        apiKey: "",
        enabled: false,
    });
    const [slskd, setSlskd] = useState({
        url: "",
        username: "",
        password: "",
        enabled: false,
    });

    // Step 3: Enrichment
    const [enrichmentEnabled, setEnrichmentEnabled] = useState(true);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords don't match");
            return;
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        setLoading(true);
        try {
            const response = await api.post<{ token: string; user: any }>(
                "/onboarding/register",
                { username, password }
            );
            // Store the JWT token for subsequent API calls
            if (response.token) {
                api.setToken(response.token);
            }
            setStep(2);
        } catch (err: any) {
            // Check if user already exists
            if (err.message?.includes("already taken")) {
                setError(
                    "Username already taken. If this is you, please refresh and continue where you left off."
                );
            } else {
                setError(
                    err.response?.data?.error ||
                        err.message ||
                        "Failed to create account"
                );
            }
        } finally {
            setLoading(false);
        }
    };

    const testConnection = async (
        type: "lidarr" | "audiobookshelf" | "slskd"
    ) => {
        setError("");
        setLoading(true);

        try {
            const config =
                type === "lidarr"
                    ? lidarr
                    : type === "audiobookshelf"
                    ? audiobookshelf
                    : slskd;
            await api.post(`/onboarding/${type}`, { ...config, enabled: true });
            setError(`${type} connected successfully!`);
        } catch (err: any) {
            setError(
                err.response?.data?.error || `Failed to connect to ${type}`
            );
        } finally {
            setLoading(false);
        }
    };

    const handleNextStep = async () => {
        setError("");
        setLoading(true);

        try {
            if (step === 2) {
                // Save all integration configs
                await Promise.all([
                    api.post("/onboarding/lidarr", lidarr),
                    api.post("/onboarding/audiobookshelf", audiobookshelf),
                    api.post("/onboarding/slskd", slskd),
                ]);
                setStep(3);
            } else if (step === 3) {
                // Save enrichment preference and complete
                await api.post("/onboarding/enrichment", {
                    enabled: enrichmentEnabled,
                });
                await api.post("/onboarding/complete");
                // Redirect to sync page
                router.push("/sync");
            }
        } catch (err: any) {
            setError(
                err.response?.data?.error || "Failed to save configuration"
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Background with yellow-purple gradient matching the site */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-purple-900/20 to-[#0a0a0a]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#ecb200]/10 via-purple-900/15 to-transparent" />
            </div>

            {/* Animated gradient blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-48 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
                <div
                    className="absolute bottom-1/4 -right-48 w-96 h-96 bg-[#ecb200]/10 rounded-full blur-[120px] animate-pulse"
                    style={{ animationDelay: "1s" }}
                />
            </div>

            {/* Show loading spinner while checking session */}
            {initialLoading ? (
                <div className="relative z-10 min-h-screen flex items-center justify-center">
                    <div className="text-center">
                        <GradientSpinner size="lg" />
                        <p className="text-white/60 mt-4">Loading...</p>
                    </div>
                </div>
            ) : (
                <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
                    <div className="w-full max-w-4xl">
                        {/* Logo/Brand */}
                        <div className="text-center mb-12">
                            <div className="inline-flex items-center gap-4 mb-4">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-white/10 blur-xl rounded-full" />
                                    <Image
                                        src="/assets/images/LIDIFY.webp"
                                        alt="Lidify"
                                        width={64}
                                        height={64}
                                        className="relative z-10 drop-shadow-2xl"
                                    />
                                </div>
                                <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-white to-gray-200 bg-clip-text text-transparent drop-shadow-2xl">
                                    Lidify
                                </h1>
                            </div>
                            <p className="text-white/60 text-lg">
                                Welcome to your personal music streaming
                                platform
                            </p>
                        </div>

                        {/* Progress Steps */}
                        <div className="flex items-center justify-center gap-3 mb-12">
                            {[
                                { num: 1, label: "Account" },
                                { num: 2, label: "Integrations" },
                                { num: 3, label: "Enrichment" },
                            ].map((s, idx) => (
                                <div key={s.num} className="flex items-center">
                                    <div className="flex flex-col items-center">
                                        <div
                                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                                                s.num === step
                                                    ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30 scale-110"
                                                    : s.num < step
                                                    ? "bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-400 border border-purple-500/30"
                                                    : "bg-white/5 text-white/40 border border-white/10"
                                            }`}
                                        >
                                            {s.num < step ? "" : s.num}
                                        </div>
                                        <span
                                            className={`text-xs mt-2 transition-all ${
                                                s.num === step
                                                    ? "text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 font-medium"
                                                    : "text-white/40"
                                            }`}
                                        >
                                            {s.label}
                                        </span>
                                    </div>
                                    {idx < 2 && (
                                        <div
                                            className={`w-16 h-0.5 mx-4 mb-6 transition-all ${
                                                s.num < step
                                                    ? "bg-gradient-to-r from-purple-500/30 to-pink-500/30"
                                                    : "bg-white/10"
                                            }`}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Main Content Card */}
                        <div className="bg-black/40 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                            <div className="p-8 md:p-12">
                                {step === 1 && (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-3xl font-bold text-white mb-2">
                                                Create Your Account
                                            </h2>
                                            <p className="text-white/60">
                                                Let's get you set up with your
                                                personal music library
                                            </p>
                                        </div>

                                        <form
                                            onSubmit={handleRegister}
                                            className="space-y-5 mt-8"
                                        >
                                            <div>
                                                <label className="block text-sm font-medium text-white/90 mb-2">
                                                    Username
                                                </label>
                                                <input
                                                    type="text"
                                                    value={username}
                                                    onChange={(e) =>
                                                        setUsername(
                                                            e.target.value
                                                        )
                                                    }
                                                    className="w-full px-4 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-[#ecb200]/50 focus:ring-2 focus:ring-[#ecb200]/20 transition-all"
                                                    placeholder="Choose a username"
                                                    required
                                                    minLength={3}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-white/90 mb-2">
                                                    Password
                                                </label>
                                                <input
                                                    type="password"
                                                    value={password}
                                                    onChange={(e) =>
                                                        setPassword(
                                                            e.target.value
                                                        )
                                                    }
                                                    className="w-full px-4 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-[#ecb200]/50 focus:ring-2 focus:ring-[#ecb200]/20 transition-all"
                                                    placeholder="At least 6 characters"
                                                    required
                                                    minLength={6}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-white/90 mb-2">
                                                    Confirm Password
                                                </label>
                                                <input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) =>
                                                        setConfirmPassword(
                                                            e.target.value
                                                        )
                                                    }
                                                    className="w-full px-4 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-[#ecb200]/50 focus:ring-2 focus:ring-[#ecb200]/20 transition-all"
                                                    placeholder="Confirm your password"
                                                    required
                                                />
                                            </div>

                                            {error && (
                                                <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                                    <span className="text-red-500">
                                                        
                                                    </span>
                                                    <p className="text-red-500 text-sm">
                                                        {error}
                                                    </p>
                                                </div>
                                            )}

                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="w-full bg-white text-black font-bold py-4 rounded-full hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-white/30 relative group overflow-hidden mt-8"
                                            >
                                                <div className="absolute inset-0 bg-white blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-200" />
                                                <span className="relative z-10 flex items-center justify-center gap-2">
                                                    {loading ? (
                                                        <>
                                                            <GradientSpinner size="sm" />
                                                            Creating Account...
                                                        </>
                                                    ) : (
                                                        "Continue"
                                                    )}
                                                </span>
                                            </button>
                                        </form>
                                    </div>
                                )}

                                {step === 2 && (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-3xl font-bold text-white mb-2">
                                                Connect Your Services
                                            </h2>
                                            <p className="text-white/60">
                                                Optional integrations to enhance
                                                your music library
                                            </p>
                                        </div>

                                        <div className="space-y-4 mt-8">
                                            {/* Lidarr */}
                                            <IntegrationCard
                                                title="Lidarr"
                                                description="Automatic music library management"
                                                localPort="localhost:8686"
                                                icon={
                                                    <svg
                                                        className="w-6 h-6"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                                        />
                                                    </svg>
                                                }
                                                enabled={lidarr.enabled}
                                                onToggle={() =>
                                                    setLidarr({
                                                        ...lidarr,
                                                        enabled:
                                                            !lidarr.enabled,
                                                    })
                                                }
                                                url={lidarr.url}
                                                apiKey={lidarr.apiKey}
                                                onUrlChange={(url) =>
                                                    setLidarr({
                                                        ...lidarr,
                                                        url,
                                                    })
                                                }
                                                onApiKeyChange={(apiKey) =>
                                                    setLidarr({
                                                        ...lidarr,
                                                        apiKey,
                                                    })
                                                }
                                                onTest={() =>
                                                    testConnection("lidarr")
                                                }
                                                loading={loading}
                                            />

                                            {/* Audiobookshelf */}
                                            <IntegrationCard
                                                title="Audiobookshelf"
                                                description="Audiobook library management"
                                                localPort="localhost:13378"
                                                icon={
                                                    <svg
                                                        className="w-6 h-6"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                                                        />
                                                    </svg>
                                                }
                                                enabled={audiobookshelf.enabled}
                                                onToggle={() =>
                                                    setAudiobookshelf({
                                                        ...audiobookshelf,
                                                        enabled:
                                                            !audiobookshelf.enabled,
                                                    })
                                                }
                                                url={audiobookshelf.url}
                                                apiKey={audiobookshelf.apiKey}
                                                onUrlChange={(url) =>
                                                    setAudiobookshelf({
                                                        ...audiobookshelf,
                                                        url,
                                                    })
                                                }
                                                onApiKeyChange={(apiKey) =>
                                                    setAudiobookshelf({
                                                        ...audiobookshelf,
                                                        apiKey,
                                                    })
                                                }
                                                onTest={() =>
                                                    testConnection(
                                                        "audiobookshelf"
                                                    )
                                                }
                                                loading={loading}
                                            />

                                            {/* Slskd */}
                                            <IntegrationCard
                                                title="Slskd / Soulseek"
                                                description="Peer-to-peer music discovery"
                                                localPort="localhost:5030"
                                                icon={
                                                    <svg
                                                        className="w-6 h-6"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                                        />
                                                    </svg>
                                                }
                                                enabled={slskd.enabled}
                                                onToggle={() =>
                                                    setSlskd({
                                                        ...slskd,
                                                        enabled: !slskd.enabled,
                                                    })
                                                }
                                                url={slskd.url}
                                                username={slskd.username}
                                                password={slskd.password}
                                                onUrlChange={(url) =>
                                                    setSlskd({ ...slskd, url })
                                                }
                                                onUsernameChange={(username) =>
                                                    setSlskd({
                                                        ...slskd,
                                                        username,
                                                    })
                                                }
                                                onPasswordChange={(password) =>
                                                    setSlskd({
                                                        ...slskd,
                                                        password,
                                                    })
                                                }
                                                onTest={() =>
                                                    testConnection("slskd")
                                                }
                                                loading={loading}
                                                useSoulseekCreds={true}
                                            />
                                        </div>

                                        {error && (
                                            <div
                                                className={`flex items-center gap-2 p-4 rounded-xl ${
                                                    error.includes(
                                                        "successfully"
                                                    )
                                                        ? "bg-green-500/10 border border-green-500/20"
                                                        : "bg-red-500/10 border border-red-500/20"
                                                }`}
                                            >
                                                <span
                                                    className={
                                                        error.includes(
                                                            "successfully"
                                                        )
                                                            ? "text-green-500"
                                                            : "text-red-500"
                                                    }
                                                >
                                                    {error.includes(
                                                        "successfully"
                                                    )
                                                        ? ""
                                                        : ""}
                                                </span>
                                                <p
                                                    className={`text-sm ${
                                                        error.includes(
                                                            "successfully"
                                                        )
                                                            ? "text-green-500"
                                                            : "text-red-500"
                                                    }`}
                                                >
                                                    {error}
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex gap-3 mt-8">
                                            <button
                                                onClick={() => setStep(3)}
                                                className="flex-1 bg-white/5 border border-white/10 text-white/70 font-medium py-4 rounded-full hover:bg-white/10 transition-all"
                                            >
                                                Skip for Now
                                            </button>
                                            <button
                                                onClick={handleNextStep}
                                                disabled={loading}
                                                className="flex-1 bg-white text-black font-bold py-4 rounded-full hover:scale-105 transition-all disabled:opacity-50 shadow-2xl hover:shadow-white/30"
                                            >
                                                {loading
                                                    ? "Saving..."
                                                    : "Continue"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {step === 3 && (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-3xl font-bold text-white mb-2">
                                                Artist Enrichment
                                            </h2>
                                            <p className="text-white/60">
                                                Enhance your library with
                                                additional metadata
                                            </p>
                                        </div>

                                        <div className="bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-transparent border border-purple-500/20 rounded-xl p-6 mt-8">
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                                                    <svg
                                                        className="w-6 h-6 text-purple-400"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M13 10V3L4 14h7v7l9-11h-7z"
                                                        />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-bold text-white mb-2">
                                                        What is enrichment?
                                                    </h3>
                                                    <p className="text-white/60 text-sm leading-relaxed">
                                                        Enrichment fetches
                                                        additional metadata like
                                                        artist bios,
                                                        high-quality images,
                                                        genres, and
                                                        relationships from
                                                        external sources. This
                                                        powers smart features
                                                        and provides a richer
                                                        listening experience.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 mt-6">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className="w-5 h-5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <svg
                                                            className="w-3 h-3 text-purple-400"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={3}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <span className="text-white/80">
                                                        Better artist matching
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className="w-5 h-5 bg-[#ecb200]/20 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <svg
                                                            className="w-3 h-3 text-[#ecb200]"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={3}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <span className="text-white/80">
                                                        Discover Weekly
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className="w-5 h-5 bg-[#ecb200]/20 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <svg
                                                            className="w-3 h-3 text-[#ecb200]"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={3}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <span className="text-white/80">
                                                        Similar artists
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <span className="text-white/40 text-xs">
                                                            !
                                                        </span>
                                                    </div>
                                                    <span className="text-white/50">
                                                        Uses internet data
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-sm">
                                            <div>
                                                <h3 className="text-white font-medium">
                                                    Enable artist enrichment
                                                </h3>
                                                <p className="text-sm text-white/50 mt-0.5">
                                                    Recommended for the best
                                                    experience
                                                </p>
                                            </div>
                                            <button
                                                onClick={() =>
                                                    setEnrichmentEnabled(
                                                        !enrichmentEnabled
                                                    )
                                                }
                                                className={`relative w-14 h-8 rounded-full transition-all ${
                                                    enrichmentEnabled
                                                        ? "bg-gradient-to-r from-purple-500 to-pink-500"
                                                        : "bg-white/20"
                                                }`}
                                            >
                                                <div
                                                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-all shadow-lg ${
                                                        enrichmentEnabled
                                                            ? "translate-x-6"
                                                            : ""
                                                    }`}
                                                />
                                            </button>
                                        </div>

                                        {error && (
                                            <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                                <span className="text-red-500">
                                                    
                                                </span>
                                                <p className="text-red-500 text-sm">
                                                    {error}
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex gap-3 mt-8">
                                            <button
                                                onClick={async () => {
                                                    await api.post(
                                                        "/onboarding/enrichment",
                                                        { enabled: false }
                                                    );
                                                    await api.post(
                                                        "/onboarding/complete"
                                                    );
                                                    router.push("/");
                                                }}
                                                className="flex-1 bg-white/5 border border-white/10 text-white/70 font-medium py-4 rounded-full hover:bg-white/10 transition-all"
                                            >
                                                Skip Enrichment
                                            </button>
                                            <button
                                                onClick={handleNextStep}
                                                disabled={loading}
                                                className="flex-1 bg-white text-black font-bold py-4 rounded-full hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-2xl hover:shadow-white/30 relative group overflow-hidden"
                                            >
                                                <div className="absolute inset-0 bg-white blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-200" />
                                                <span className="relative z-10 flex items-center justify-center gap-2">
                                                    {loading ? (
                                                        <>
                                                            <GradientSpinner size="sm" />
                                                            Finishing Setup...
                                                        </>
                                                    ) : (
                                                        "Complete Setup"
                                                    )}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <p className="text-center text-white/40 text-sm mt-6">
                            © 2025 Lidify. Your music, your way.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

interface IntegrationCardProps {
    title: string;
    description: string;
    localPort?: string;
    icon: React.ReactNode;
    enabled: boolean;
    onToggle: () => void;
    url: string;
    apiKey?: string;
    username?: string;
    password?: string;
    onUrlChange: (url: string) => void;
    onApiKeyChange?: (apiKey: string) => void;
    onUsernameChange?: (username: string) => void;
    onPasswordChange?: (password: string) => void;
    onTest: () => void;
    loading: boolean;
    useSoulseekCreds?: boolean;
}

function IntegrationCard({
    title,
    description,
    localPort,
    icon,
    enabled,
    onToggle,
    url,
    apiKey,
    username,
    password,
    onUrlChange,
    onApiKeyChange,
    onUsernameChange,
    onPasswordChange,
    onTest,
    loading,
    useSoulseekCreds = false,
}: IntegrationCardProps) {
    return (
        <div
            className={`border rounded-xl transition-all ${
                enabled
                    ? "bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-transparent border-purple-500/20"
                    : "bg-white/5 border-white/10"
            }`}
        >
            <div className="p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                enabled
                                    ? "bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-400"
                                    : "bg-white/5 text-white/40"
                            }`}
                        >
                            {icon}
                        </div>
                        <div>
                            <h3 className="text-white font-bold">{title}</h3>
                            <p className="text-sm text-white/50">
                                {description}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onToggle}
                        className={`relative w-12 h-7 rounded-full transition-all ${
                            enabled
                                ? "bg-gradient-to-r from-purple-500 to-pink-500"
                                : "bg-white/20"
                        }`}
                    >
                        <div
                            className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-all shadow-lg ${
                                enabled ? "translate-x-5" : ""
                            }`}
                        />
                    </button>
                </div>

                {enabled && (
                    <div className="space-y-3 mt-5 pt-5 border-t border-white/10">
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => onUrlChange(e.target.value)}
                            placeholder={`Server URL (e.g., http://${
                                localPort || "localhost:PORT"
                            })`}
                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all backdrop-blur-sm"
                        />
                        {useSoulseekCreds ? (
                            <>
                                <input
                                    type="text"
                                    value={username || ""}
                                    onChange={(e) =>
                                        onUsernameChange?.(e.target.value)
                                    }
                                    placeholder="Soulseek Username"
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all backdrop-blur-sm"
                                />
                                <input
                                    type="password"
                                    value={password || ""}
                                    onChange={(e) =>
                                        onPasswordChange?.(e.target.value)
                                    }
                                    placeholder="Soulseek Password"
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all backdrop-blur-sm"
                                />
                                <p className="text-xs text-white/50 mt-2">
                                    These are your Soulseek network credentials,
                                    not your Slskd login
                                </p>
                            </>
                        ) : (
                            <input
                                type="password"
                                value={apiKey || ""}
                                onChange={(e) =>
                                    onApiKeyChange?.(e.target.value)
                                }
                                placeholder="API Key"
                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all backdrop-blur-sm"
                            />
                        )}
                        <button
                            onClick={onTest}
                            disabled={
                                loading ||
                                !url ||
                                (!useSoulseekCreds
                                    ? !apiKey
                                    : !username || !password)
                            }
                            className="w-full bg-white/10 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Test Connection
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
