/**
 * Native Audio Engine
 *
 * Singleton manager for audio playback using native <audio> elements.
 * Direct control over the <audio> element ensures proper integration
 * with OS-level media controls (lock screen, now playing, media keys).
 *
 * Two <audio> elements: active playback + preloaded next track.
 * On track switch, preloaded element becomes active (no re-fetch).
 */

export type AudioEventType =
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

export type AudioEventCallback = (data?: unknown) => void;

/** Detect audio format from file extension (for API compat — native <audio> ignores this) */
export function detectAudioFormat(filePath: string | undefined): string {
    const ext = filePath?.split(".").pop()?.toLowerCase();
    if (ext === "flac") return "flac";
    if (ext === "m4a" || ext === "aac") return "mp4";
    if (ext === "ogg" || ext === "opus") return "webm";
    if (ext === "wav") return "wav";
    return "mp3";
}

interface AudioEngineState {
    currentSrc: string | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
}

class AudioEngine {
    private audio: HTMLAudioElement | null = null;
    private timeUpdateInterval: ReturnType<typeof setInterval> | null = null;
    private eventListeners: Map<AudioEventType, Set<AudioEventCallback>> =
        new Map();
    private state: AudioEngineState = {
        currentSrc: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1,
        isMuted: false,
    };
    private isLoading: boolean = false;

    private isSeeking: boolean = false;
    private seekTargetTime: number | null = null;
    private seekTimeoutId: ReturnType<typeof setTimeout> | null = null;

    private preloadAudio: HTMLAudioElement | null = null;
    private preloadSrc: string | null = null;
    private preloadReady: boolean = false;

    private readonly popFadeMs: number = 10;
    private pendingAutoplay: boolean = false;
    private boundListeners: Map<string, EventListener> = new Map();

    constructor() {
        const events: AudioEventType[] = [
            "play", "pause", "stop", "end", "seek",
            "volume", "load", "loaderror", "playerror", "timeupdate",
        ];
        events.forEach((event) => this.eventListeners.set(event, new Set()));
    }

    /** Initialize engine with saved preferences. Call before first playback. */
    initializeFromStorage(): void {
        if (typeof window === 'undefined') return;

        // Declare playback intent so the OS treats this as a music app.
        // Bypasses silent/mute switch and grants higher background audio priority.
        // W3C Audio Session API (WebKit 17+, other browsers may vary).
        try {
            const nav = navigator as unknown as Record<string, unknown>;
            if (nav.audioSession) {
                (nav.audioSession as { type: string }).type = 'playback';
            }
        } catch (err) {
            console.warn('[AudioEngine] Failed to set audioSession.type:', err);
        }

        try {
            const savedVolume = localStorage.getItem('lidify_volume');
            const savedMuted = localStorage.getItem('lidify_muted');

            if (savedVolume) this.state.volume = parseFloat(savedVolume);
            if (savedMuted === 'true') this.state.isMuted = true;
        } catch (error) {
            console.error('[AudioEngine] Failed to initialize from storage:', error);
        }
    }

    /** Load and optionally play a new audio source */
    load(src: string, autoplay: boolean = false, format?: string): void {
        void format; // kept for API compat, <audio> detects format automatically

        if (this.state.currentSrc === src && this.audio) {
            if (autoplay && !this.state.isPlaying) {
                this.play();
            }
            return;
        }

        if (this.isLoading && this.state.currentSrc === src) {
            return;
        }

        if (this.isPreloaded(src)) {
            const preloadedAudio = this.preloadAudio!;
            this.preloadAudio = null;
            this.preloadSrc = null;
            this.preloadReady = false;

            this.cleanup(true);

            this.audio = preloadedAudio;
            this.attachEventListeners(this.audio);
            this.state.currentSrc = src;
            this.state.duration = this.audio.duration || 0;
            this.isLoading = false;
            this.applyVolume(this.audio);

            this.emit("load", { duration: this.state.duration });
            if (autoplay) {
                this.play();
            }
            return;
        }

        this.isLoading = true;
        this.cleanup(true);

        this.state.currentSrc = src;
        this.pendingAutoplay = autoplay;

        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.applyVolume(this.audio);

        this.attachEventListeners(this.audio);

        this.audio.src = src;
    }

    /** No-op — kept for API compat. Future crossfade via AudioContext would go here. */
    async resumeAudioContext(): Promise<void> {}

    /** Force play — syncs engine state if OS already resumed playback, otherwise plays */
    forcePlay(): void {
        if (!this.audio) return;

        // If audio is already playing (the OS may have resumed playback
        // before our JS handler fired), just sync engine state.
        if (!this.audio.paused) {
            if (!this.state.isPlaying) {
                this.state.isPlaying = true;
                this.startTimeUpdates();
                this.emit("play");
            }
            return;
        }

        this.play();
    }

    /** Play audio */
    play(): void {
        if (!this.audio) {
            console.warn("[AudioEngine] No audio loaded");
            return;
        }
        if (!this.audio.paused) return; // already playing

        this.applyVolume(this.audio);

        this.audio.play().catch(err => {
            console.error("[AudioEngine] Play error:", err);
            this.state.isPlaying = false;
            this.stopTimeUpdates();
            this.emit("playerror", { error: err });
        });
    }

    /** Pause audio */
    pause(): void {
        if (!this.audio || this.audio.paused) return;
        this.audio.pause();
    }

    /** Stop playback completely */
    stop(): void {
        if (!this.audio) return;

        this.audio.pause();
        this.audio.currentTime = 0;

        this.state.isPlaying = false;
        this.state.currentTime = 0;
        this.stopTimeUpdates();
        this.emit("stop");
    }

    /** Seek to a specific time. Uses seek locking to prevent stale timeupdate UI flicker. */
    seek(time: number): void {
        if (!this.audio) return;

        this.isSeeking = true;
        this.seekTargetTime = time;

        if (this.seekTimeoutId) {
            clearTimeout(this.seekTimeoutId);
        }

        this.state.currentTime = time;

        try {
            this.audio.currentTime = time;
        } catch {
            // Some browsers throw if seeking to invalid position
        }

        this.emit("seek", { time });

        this.seekTimeoutId = setTimeout(() => {
            this.isSeeking = false;
            this.seekTargetTime = null;
            this.seekTimeoutId = null;
        }, 300);
    }

    /** Force reload from current source (used after podcast cache is ready) */
    reload(): void {
        if (!this.state.currentSrc) return;

        const src = this.state.currentSrc;
        this.cleanup(true);
        this.load(src, false);
    }

    /** Preload a track in the background for gapless playback */
    preload(src: string, format?: string): void {
        void format;

        if (this.state.currentSrc === src) return;
        if (this.preloadSrc === src) return;

        this.cancelPreload();

        this.preloadSrc = src;
        this.preloadReady = false;

        this.preloadAudio = new Audio();
        this.preloadAudio.preload = 'auto';
        this.preloadAudio.src = src;

        this.preloadAudio.addEventListener('canplaythrough', () => {
            this.preloadReady = true;
        }, { once: true });

        this.preloadAudio.addEventListener('error', () => {
            console.error("[AudioEngine] Preload error for:", src);
            this.cancelPreload();
        }, { once: true });
    }

    /** Cancel any in-progress preload */
    cancelPreload(): void {
        if (this.preloadAudio) {
            try {
                this.preloadAudio.pause();
                this.preloadAudio.removeAttribute('src');
                this.preloadAudio.load();
            } catch {
                // Intentionally ignored: cleanup errors are harmless
            }
            this.preloadAudio = null;
        }
        this.preloadSrc = null;
        this.preloadReady = false;
    }

    /** Check if a source is preloaded and ready */
    isPreloaded(src: string): boolean {
        return (
            this.preloadSrc === src &&
            this.preloadAudio !== null &&
            this.preloadReady
        );
    }

    /** Set volume (0-1) */
    setVolume(volume: number): void {
        this.state.volume = Math.max(0, Math.min(1, volume));

        if (this.audio && !this.state.isMuted) {
            this.applyVolume(this.audio);
        }

        this.emit("volume", { volume: this.state.volume });
    }

    /** Mute/unmute */
    setMuted(muted: boolean): void {
        this.state.isMuted = muted;

        if (this.audio) {
            this.applyVolume(this.audio);
        }
    }

    /** Get current playback state */
    getState(): Readonly<AudioEngineState> {
        return { ...this.state };
    }

    /** Get current time from the audio element */
    getCurrentTime(): number {
        return this.audio?.currentTime || 0;
    }

    /** Alias for getCurrentTime() — kept for API compat (Howler had diverging times) */
    getActualCurrentTime(): number {
        return this.getCurrentTime();
    }

    /** Get duration */
    getDuration(): number {
        if (this.audio) {
            const d = this.audio.duration;
            return (d && isFinite(d)) ? d : 0;
        }
        return 0;
    }

    /** Check if currently playing */
    isPlaying(): boolean {
        return this.audio ? !this.audio.paused : false;
    }

    /** Subscribe to events */
    on(event: AudioEventType, callback: AudioEventCallback): void {
        this.eventListeners.get(event)?.add(callback);
    }

    /** Unsubscribe from events */
    off(event: AudioEventType, callback: AudioEventCallback): void {
        this.eventListeners.get(event)?.delete(callback);
    }

    /** Emit event to all listeners */
    private emit(event: AudioEventType, data?: unknown): void {
        this.eventListeners.get(event)?.forEach((callback) => {
            try {
                callback(data);
            } catch (err) {
                console.error(
                    `[AudioEngine] Event listener error (${event}):`,
                    err
                );
            }
        });
    }

    /**
     * Apply volume to an audio element.
     * Note: Some mobile browsers ignore audio.volume. This primarily affects desktop.
     */
    private applyVolume(audio: HTMLAudioElement): void {
        try {
            audio.volume = this.state.isMuted ? 0 : this.state.volume;
        } catch {
            // Some browsers throw on volume assignment — ignore
        }
    }

    /** Attach native <audio> event listeners that map to engine events */
    private attachEventListeners(audio: HTMLAudioElement): void {
        this.detachEventListeners();

        const onLoadedMetadata = () => {
            this.isLoading = false;
            this.state.duration = audio.duration || 0;
            this.emit("load", { duration: this.state.duration });

            if (this.pendingAutoplay) {
                this.pendingAutoplay = false;
                this.play();
            }
        };

        const onPlay = () => {
            this.state.isPlaying = true;
            this.startTimeUpdates();
            this.emit("play");
        };

        const onPause = () => {
            // Don't emit pause during loading — cleanup triggers this
            if (this.isLoading) return;

            this.state.isPlaying = false;
            this.stopTimeUpdates();
            this.emit("pause");
        };

        const onEnded = () => {
            this.state.isPlaying = false;
            this.stopTimeUpdates();
            this.emit("end");
        };

        const onError = () => {
            const error = audio.error;
            const message = error
                ? `MediaError code=${error.code}: ${error.message}`
                : "Unknown audio error";

            console.error("[AudioEngine] Load/play error:", message);
            this.isLoading = false;
            this.state.isPlaying = false;
            this.stopTimeUpdates();

            if (!this.state.duration) {
                this.emit("loaderror", { error: message });
            } else {
                this.emit("playerror", { error: message });
            }
        };

        const onSeeked = () => {
            this.state.currentTime = audio.currentTime;
            this.emit("seek", { time: audio.currentTime });
        };

        this.boundListeners.set('loadedmetadata', onLoadedMetadata as EventListener);
        this.boundListeners.set('play', onPlay as EventListener);
        this.boundListeners.set('pause', onPause as EventListener);
        this.boundListeners.set('ended', onEnded as EventListener);
        this.boundListeners.set('error', onError as EventListener);
        this.boundListeners.set('seeked', onSeeked as EventListener);

        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);
        audio.addEventListener('seeked', onSeeked);
    }

    /** Remove event listeners from the current audio element */
    private detachEventListeners(): void {
        if (!this.audio) return;

        for (const [event, listener] of this.boundListeners) {
            this.audio.removeEventListener(event, listener);
        }
        this.boundListeners.clear();
    }

    /** Start 4Hz time update interval */
    private startTimeUpdates(): void {
        this.stopTimeUpdates();

        this.timeUpdateInterval = setInterval(() => {
            if (this.audio && this.state.isPlaying) {
                const currentTime = this.audio.currentTime;

                if (this.isSeeking && this.seekTargetTime !== null) {
                    if (Math.abs(currentTime - this.seekTargetTime) >= 2) {
                        return;
                    }
                    this.isSeeking = false;
                    this.seekTargetTime = null;
                    if (this.seekTimeoutId) {
                        clearTimeout(this.seekTimeoutId);
                        this.seekTimeoutId = null;
                    }
                }

                this.state.currentTime = currentTime;
                this.emit("timeupdate", { time: currentTime });
            }
        }, 250);
    }

    /** Stop time update interval */
    private stopTimeUpdates(): void {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    /** Cleanup current audio element. If immediate=false, micro-fades to reduce click/pop. */
    private cleanup(immediate: boolean = false): void {
        this.cancelPreload();
        this.stopTimeUpdates();
        this.pendingAutoplay = false;

        if (this.audio) {
            const oldAudio = this.audio;

            // Detach BEFORE nulling — detachEventListeners checks this.audio
            this.detachEventListeners();
            this.audio = null;

            const releaseElement = () => {
                if (!oldAudio.paused) oldAudio.pause();
                oldAudio.removeAttribute('src');
                oldAudio.load();
            };

            try {
                if (!oldAudio.paused && !immediate) {
                    try { oldAudio.volume = 0; } catch { /* may throw on mobile */ }
                    setTimeout(releaseElement, this.popFadeMs);
                } else {
                    releaseElement();
                }
            } catch {
                // Cleanup errors are harmless
            }
        }

        this.state.currentSrc = null;
        this.state.isPlaying = false;
        this.state.currentTime = 0;
        this.state.duration = 0;
    }

    /** Destroy the engine completely */
    destroy(): void {
        this.cleanup();
        this.isLoading = false;
        this.eventListeners.clear();

        if (this.seekTimeoutId) {
            clearTimeout(this.seekTimeoutId);
            this.seekTimeoutId = null;
        }
        this.isSeeking = false;
        this.seekTargetTime = null;
    }
}

export const audioEngine = new AudioEngine();
export { AudioEngine };

