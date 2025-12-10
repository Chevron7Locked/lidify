/**
 * Howler.js Audio Engine
 *
 * Singleton manager for audio playback using Howler.js
 * Handles: play, pause, seek, volume, track changes, events
 */

import { Howl, Howler } from "howler";

export type HowlerEventType =
    | "play"
    | "pause"
    | "stop"
    | "end"
    | "seek"
    | "volume"
    | "load"
    | "loaderror"
    | "playerror"
    | "timeupdate";

export type HowlerEventCallback = (data?: any) => void;

interface HowlerEngineState {
    currentSrc: string | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
}

class HowlerEngine {
    private howl: Howl | null = null;
    private nextHowl: Howl | null = null; // For crossfade
    private timeUpdateInterval: NodeJS.Timeout | null = null;
    private eventListeners: Map<HowlerEventType, Set<HowlerEventCallback>> =
        new Map();
    private state: HowlerEngineState = {
        currentSrc: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1,
        isMuted: false,
    };
    private isLoading: boolean = false; // Guard against duplicate loads
    private userInitiatedPlay: boolean = false; // Track if play was user-initiated
    private fadeInDuration = 300; // ms
    private fadeOutDuration = 300; // ms - crossfade duration
    private crossfadeDuration = 600; // ms - duration for track-to-track crossfade (longer for smoother mobile transitions)
    private retryCount: number = 0; // Track retry attempts
    private maxRetries: number = 3; // Max retry attempts for load errors
    private pendingAutoplay: boolean = false; // Track pending autoplay for retries
    private lastFormat: string | undefined; // Store format for retries
    private isCrossfading: boolean = false; // Track if currently crossfading

    constructor() {
        // Initialize event listener maps
        const events: HowlerEventType[] = [
            "play",
            "pause",
            "stop",
            "end",
            "seek",
            "volume",
            "load",
            "loaderror",
            "playerror",
            "timeupdate",
        ];
        events.forEach((event) => this.eventListeners.set(event, new Set()));
    }

    /**
     * Load and optionally play a new audio source
     * @param src - Audio URL
     * @param autoplay - Whether to auto-play after loading
     * @param format - Audio format hint (mp3, flac, etc.) - required for URLs without extensions
     */
    load(src: string, autoplay: boolean = false, format?: string): void {
        // Don't reload if same source and already loaded
        if (this.state.currentSrc === src && this.howl) {
            if (autoplay && !this.state.isPlaying) {
                this.play();
            }
            return;
        }

        // Prevent duplicate loads - if already loading this URL, skip
        if (this.isLoading && this.state.currentSrc === src) {
            return;
        }

        // Set loading guard immediately
        this.isLoading = true;

        // If currently playing, use crossfade for smooth transition
        const shouldCrossfade = this.state.isPlaying && this.howl && !this.isCrossfading;
        
        if (shouldCrossfade) {
            this.loadWithCrossfade(src, format);
            return;
        }

        // Cleanup previous instance (no crossfade)
        this.cleanup();

        this.state.currentSrc = src;

        // Detect if running in Android WebView (Capacitor)
        const isAndroidWebView = typeof navigator !== "undefined" && 
            /wv/.test(navigator.userAgent.toLowerCase()) && 
            /android/.test(navigator.userAgent.toLowerCase());

        // Build Howl config
        // Note: On Android WebView, HTML5 Audio causes crackling/popping on track changes
        // Use Web Audio API on Android for smoother playback (trades streaming for quality)
        // HTML5 Audio is still used on desktop/iOS for better streaming support
        const howlConfig: any = {
            src: [src],
            html5: !isAndroidWebView, // Use Web Audio API on Android to prevent crackling
            autoplay: false, // We'll handle autoplay with fade
            preload: true,
            volume: this.state.isMuted ? 0 : this.state.volume,
            // On Android WebView, increase the xhr timeout
            ...(isAndroidWebView && { xhr: { timeout: 30000 } }),
        };

        // Store for potential retry
        this.pendingAutoplay = autoplay;
        this.lastFormat = format;
        this.retryCount = 0; // Reset retry count for new load

        // Add format hints (required for URLs without file extensions)
        // Include multiple formats as fallbacks - browser will try them in order
        if (format) {
            // Put the expected format first, then common fallbacks
            const formats = [format];
            if (!formats.includes("mp3")) formats.push("mp3");
            if (!formats.includes("flac")) formats.push("flac");
            if (!formats.includes("mp4")) formats.push("mp4");
            if (!formats.includes("webm")) formats.push("webm");
            howlConfig.format = formats;
        } else {
            // Default format order if none specified
            howlConfig.format = ["mp3", "flac", "mp4", "webm", "wav"];
        }

        this.howl = new Howl({
            ...howlConfig,
            onload: () => {
                this.isLoading = false;
                this.state.duration = this.howl?.duration() || 0;
                this.emit("load", { duration: this.state.duration });

                if (autoplay) {
                    this.play();
                }
            },
            onloaderror: (id, error) => {
                console.error("[HowlerEngine] Load error:", error, "Attempt:", this.retryCount + 1);
                this.isLoading = false;

                // Retry logic for transient errors (common on Android WebView)
                if (this.retryCount < this.maxRetries && this.state.currentSrc) {
                    this.retryCount++;
                    console.log(`[HowlerEngine] Retrying load (attempt ${this.retryCount}/${this.maxRetries})...`);

                    // Save src before cleanup
                    const srcToRetry = this.state.currentSrc;
                    const autoplayToRetry = this.pendingAutoplay;
                    const formatToRetry = this.lastFormat;

                    // CRITICAL: Clean up the failed Howl instance BEFORE retrying
                    // This prevents "HTML5 Audio pool exhausted" errors
                    this.cleanup();

                    // Wait a bit before retrying
                    setTimeout(() => {
                        this.load(srcToRetry, autoplayToRetry, formatToRetry);
                    }, 500 * this.retryCount); // Exponential backoff
                    return;
                }

                // All retries failed - clean up and emit error
                this.retryCount = 0;
                this.cleanup(); // Clean up failed instance
                this.emit("loaderror", { error });
            },
            onplayerror: (id, error) => {
                console.error("[HowlerEngine] Play error:", error);
                // Clear playing state so UI shows play button
                this.state.isPlaying = false;
                this.userInitiatedPlay = false;
                this.stopTimeUpdates();
                this.emit("playerror", { error });
                // Don't try to auto-recover - let the user click play again
                // The 'unlock' mechanism requires a NEW user interaction which won't happen automatically
            },
            onplay: () => {
                this.state.isPlaying = true;
                this.userInitiatedPlay = false; // Clear flag after successful play
                this.startTimeUpdates();
                this.emit("play");
            },
            onpause: () => {
                this.state.isPlaying = false;
                this.userInitiatedPlay = false;
                this.stopTimeUpdates();
                this.emit("pause");
            },
            onstop: () => {
                this.state.isPlaying = false;
                this.state.currentTime = 0;
                this.stopTimeUpdates();
                this.emit("stop");
            },
            onend: () => {
                this.state.isPlaying = false;
                this.stopTimeUpdates();
                this.emit("end");
            },
            onseek: () => {
                if (this.howl) {
                    this.state.currentTime = this.howl.seek() as number;
                    this.emit("seek", { time: this.state.currentTime });
                }
            },
        });
    }

    /**
     * Play audio (user-initiated)
     */
    play(): void {
        if (!this.howl) {
            console.warn("[HowlerEngine] No audio loaded");
            return;
        }

        // Don't reset volume if already playing
        if (this.state.isPlaying) {
            return;
        }

        // Mark as user-initiated for autoplay recovery
        this.userInitiatedPlay = true;

        // Ensure volume is set correctly before playing
        const targetVolume = this.state.isMuted ? 0 : this.state.volume;
        this.howl.volume(targetVolume);
        this.howl.play();
    }

    /**
     * Pause audio
     */
    pause(): void {
        if (!this.howl || !this.state.isPlaying) return;
        this.howl.pause();
    }

    /**
     * Stop playback completely
     */
    stop(): void {
        if (!this.howl) return;
        this.howl.stop();
    }

    /**
     * Seek to a specific time
     * Simple seek - UI handles buffering state if needed
     */
    seek(time: number): void {
        if (!this.howl) return;

        this.state.currentTime = time;
        this.howl.seek(time);
        this.emit("seek", { time });
    }

    /**
     * Force reload the audio from current source
     * Used after cache is ready to enable seeking
     */
    reload(): void {
        if (!this.state.currentSrc) return;

        const src = this.state.currentSrc;
        const format = this.howl ? (this.howl as any)._format : undefined;

        this.cleanup();
        this.load(src, false, format?.[0]);
    }

    /**
     * Set volume (0-1)
     */
    setVolume(volume: number): void {
        this.state.volume = Math.max(0, Math.min(1, volume));

        if (this.howl && !this.state.isMuted) {
            this.howl.volume(this.state.volume);
        }

        this.emit("volume", { volume: this.state.volume });
    }

    /**
     * Mute/unmute
     */
    setMuted(muted: boolean): void {
        this.state.isMuted = muted;

        if (this.howl) {
            this.howl.volume(muted ? 0 : this.state.volume);
        }
    }

    /**
     * Get current playback state
     */
    getState(): Readonly<HowlerEngineState> {
        return { ...this.state };
    }

    /**
     * Get current time (from Howler's state)
     */
    getCurrentTime(): number {
        if (this.howl) {
            const seek = this.howl.seek();
            return typeof seek === "number" ? seek : 0;
        }
        return 0;
    }

    /**
     * Get the ACTUAL current time from the HTML5 audio element
     * This is more accurate than Howler's reported position after failed seeks
     */
    getActualCurrentTime(): number {
        if (!this.howl) return 0;

        try {
            // Access the underlying HTML5 audio element
            const sounds = (this.howl as any)._sounds;
            if (sounds && sounds.length > 0 && sounds[0]._node) {
                return sounds[0]._node.currentTime || 0;
            }
        } catch (e) {
            // Fallback to Howler's reported time
        }

        return this.getCurrentTime();
    }

    /**
     * Get duration
     */
    getDuration(): number {
        return this.howl?.duration() || 0;
    }

    /**
     * Check if currently playing
     */
    isPlaying(): boolean {
        return this.howl?.playing() || false;
    }

    /**
     * Subscribe to events
     */
    on(event: HowlerEventType, callback: HowlerEventCallback): void {
        this.eventListeners.get(event)?.add(callback);
    }

    /**
     * Unsubscribe from events
     */
    off(event: HowlerEventType, callback: HowlerEventCallback): void {
        this.eventListeners.get(event)?.delete(callback);
    }

    /**
     * Emit event to all listeners
     */
    private emit(event: HowlerEventType, data?: any): void {
        this.eventListeners.get(event)?.forEach((callback) => {
            try {
                callback(data);
            } catch (err) {
                console.error(
                    `[HowlerEngine] Event listener error (${event}):`,
                    err
                );
            }
        });
    }

    /**
     * Start time update interval
     */
    private startTimeUpdates(): void {
        this.stopTimeUpdates();

        this.timeUpdateInterval = setInterval(() => {
            if (this.howl && this.state.isPlaying) {
                const seek = this.howl.seek();
                if (typeof seek === "number") {
                    this.state.currentTime = seek;
                    this.emit("timeupdate", { time: seek });
                }
            }
        }, 250); // Update 4 times per second
    }

    /**
     * Stop time update interval
     */
    private stopTimeUpdates(): void {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    /**
     * Load new track with crossfade from current track
     */
    private loadWithCrossfade(src: string, format?: string): void {
        this.isCrossfading = true;
        const oldHowl = this.howl;
        const targetVolume = this.state.isMuted ? 0 : this.state.volume;

        // Detect Android WebView for audio mode selection
        const isAndroidWebView = typeof navigator !== "undefined" && 
            /wv/.test(navigator.userAgent.toLowerCase()) && 
            /android/.test(navigator.userAgent.toLowerCase());

        // Build config for new track
        // Use Web Audio API on Android to prevent crackling during crossfade
        const howlConfig: any = {
            src: [src],
            html5: !isAndroidWebView, // Web Audio API on Android for smooth crossfade
            autoplay: false,
            preload: true,
            volume: 0, // Start silent for fade in
        };

        if (format) {
            const formats = [format];
            if (!formats.includes("mp3")) formats.push("mp3");
            if (!formats.includes("flac")) formats.push("flac");
            howlConfig.format = formats;
        } else {
            howlConfig.format = ["mp3", "flac", "mp4", "webm", "wav"];
        }

        this.state.currentSrc = src;
        this.pendingAutoplay = true;
        this.lastFormat = format;

        this.nextHowl = new Howl({
            ...howlConfig,
            onload: () => {
                this.isLoading = false;
                
                // Fade out old track
                if (oldHowl) {
                    oldHowl.fade(targetVolume, 0, this.crossfadeDuration);
                    setTimeout(() => {
                        try {
                            oldHowl.stop();
                            oldHowl.unload();
                        } catch (e) {
                            // Ignore cleanup errors
                        }
                    }, this.crossfadeDuration + 50);
                }

                // Switch to new howl
                this.howl = this.nextHowl;
                this.nextHowl = null;
                this.state.duration = this.howl?.duration() || 0;
                this.emit("load", { duration: this.state.duration });

                // Start playing with fade in
                this.howl?.play();
                this.howl?.fade(0, targetVolume, this.crossfadeDuration);
                
                setTimeout(() => {
                    this.isCrossfading = false;
                }, this.crossfadeDuration);
            },
            onloaderror: (id, error) => {
                console.error("[HowlerEngine] Crossfade load error:", error);
                this.isLoading = false;
                this.isCrossfading = false;
                this.nextHowl?.unload();
                this.nextHowl = null;
                this.emit("loaderror", { error });
            },
            onplayerror: (id, error) => {
                console.error("[HowlerEngine] Crossfade play error:", error);
                this.state.isPlaying = false;
                this.isCrossfading = false;
                this.emit("playerror", { error });
            },
            onplay: () => {
                this.state.isPlaying = true;
                this.startTimeUpdates();
                this.emit("play");
            },
            onpause: () => {
                this.state.isPlaying = false;
                this.stopTimeUpdates();
                this.emit("pause");
            },
            onstop: () => {
                this.state.isPlaying = false;
                this.state.currentTime = 0;
                this.stopTimeUpdates();
                this.emit("stop");
            },
            onend: () => {
                this.state.isPlaying = false;
                this.stopTimeUpdates();
                this.emit("end");
            },
            onseek: () => {
                if (this.howl) {
                    this.state.currentTime = this.howl.seek() as number;
                    this.emit("seek", { time: this.state.currentTime });
                }
            },
        });
    }

    /**
     * Cleanup current Howl instance
     */
    private cleanup(): void {
        this.stopTimeUpdates();
        this.isCrossfading = false;

        if (this.nextHowl) {
            try {
                this.nextHowl.stop();
                this.nextHowl.unload();
            } catch (e) {
                // Ignore
            }
            this.nextHowl = null;
        }

        if (this.howl) {
            // Stop playback first
            try {
                this.howl.stop();
            } catch (e) {
                // Ignore errors during cleanup
            }
            // Unload to free resources
            this.howl.unload();
            this.howl = null;
        }

        // Also clear any orphaned audio elements from the global pool
        // This prevents "HTML5 Audio pool exhausted" errors
        try {
            Howler.unload();
        } catch (e) {
            // Ignore errors
        }

        this.state.currentSrc = null;
        this.state.isPlaying = false;
        this.state.currentTime = 0;
        this.state.duration = 0;
    }

    /**
     * Destroy the engine completely
     */
    destroy(): void {
        this.cleanup();
        this.isLoading = false;
        this.eventListeners.clear();
        Howler.unload();
    }
}

// Export singleton instance
export const howlerEngine = new HowlerEngine();

// Also export class for testing
export { HowlerEngine };
