/**
 * Playback State Machine
 *
 * Single source of truth for playback state.
 * React state (isPlaying, isBuffering, etc.) derives FROM this.
 */

export type PlaybackState =
  | 'IDLE'
  | 'LOADING'
  | 'READY'
  | 'PLAYING'
  | 'SEEKING'
  | 'BUFFERING'
  | 'ERROR';

export interface StateContext {
  state: PlaybackState;
  previousState: PlaybackState | null;
  error: string | null;
  errorCode: number | null;
  wasPlayingBeforeSeek: boolean;
  lastTransitionTime: number;
}

// Valid state transitions - anything not listed is invalid
const VALID_TRANSITIONS: Record<PlaybackState, PlaybackState[]> = {
  IDLE: ['LOADING'],
  LOADING: ['READY', 'PLAYING', 'ERROR', 'IDLE'],
  READY: ['PLAYING', 'LOADING', 'IDLE', 'SEEKING'],
  PLAYING: ['PLAYING', 'READY', 'SEEKING', 'BUFFERING', 'LOADING', 'ERROR', 'IDLE'],
  SEEKING: ['PLAYING', 'READY', 'ERROR', 'LOADING'],
  BUFFERING: ['PLAYING', 'ERROR', 'IDLE'],
  ERROR: ['LOADING', 'IDLE'],
};

export type StateListener = (context: StateContext) => void;

export class PlaybackStateMachine {
  private context: StateContext = {
    state: 'IDLE',
    previousState: null,
    error: null,
    errorCode: null,
    wasPlayingBeforeSeek: false,
    lastTransitionTime: Date.now(),
  };

  private listeners: Set<StateListener> = new Set();
  private debugEnabled: boolean = false;

  constructor() {
    // Check for debug flag
    if (typeof window !== 'undefined') {
      this.debugEnabled = localStorage.getItem('lidifyAudioDebug') === '1';
    }
  }

  getState(): PlaybackState {
    return this.context.state;
  }

  getContext(): Readonly<StateContext> {
    return { ...this.context };
  }

  canTransition(to: PlaybackState): boolean {
    return VALID_TRANSITIONS[this.context.state]?.includes(to) ?? false;
  }

  transition(to: PlaybackState, options?: { error?: string; errorCode?: number }): boolean {
    if (!this.canTransition(to)) {
      if (this.debugEnabled) {
        console.warn(
          `[StateMachine] Invalid transition: ${this.context.state} → ${to}`
        );
      }
      return false;
    }

    const from = this.context.state;

    // Track if we were playing before seek
    if (to === 'SEEKING') {
      this.context.wasPlayingBeforeSeek = from === 'PLAYING';
    }

    // Clear error when leaving ERROR state
    const error = to === 'ERROR' ? (options?.error ?? 'Unknown error') : null;
    const errorCode = to === 'ERROR' ? (options?.errorCode ?? null) : null;

    this.context = {
      ...this.context,
      previousState: from,
      state: to,
      error,
      errorCode,
      lastTransitionTime: Date.now(),
    };

    if (this.debugEnabled) {
      console.log(`[StateMachine] ${from} → ${to}`, error ? `(${error})` : '');
    }

    this.notify();
    return true;
  }

  /**
   * Force transition - bypasses validation for recovery scenarios
   */
  forceTransition(to: PlaybackState, options?: { error?: string; errorCode?: number }): void {
    const from = this.context.state;

    if (this.debugEnabled) {
      console.log(`[StateMachine] FORCE: ${from} → ${to}`);
    }

    this.context = {
      ...this.context,
      previousState: from,
      state: to,
      error: to === 'ERROR' ? (options?.error ?? 'Unknown error') : null,
      errorCode: to === 'ERROR' ? (options?.errorCode ?? null) : null,
      wasPlayingBeforeSeek: false,
      lastTransitionTime: Date.now(),
    };

    this.notify();
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.getContext());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const ctx = this.getContext();
    this.listeners.forEach(fn => {
      try {
        fn(ctx);
      } catch (err) {
        console.error('[StateMachine] Listener error:', err);
      }
    });
  }

  reset(): void {
    this.context = {
      state: 'IDLE',
      previousState: null,
      error: null,
      errorCode: null,
      wasPlayingBeforeSeek: false,
      lastTransitionTime: Date.now(),
    };
    this.notify();
  }

  // Convenience getters for common checks
  get isIdle(): boolean { return this.context.state === 'IDLE'; }
  get isLoading(): boolean { return this.context.state === 'LOADING'; }
  get isReady(): boolean { return this.context.state === 'READY'; }
  get isPlaying(): boolean { return this.context.state === 'PLAYING'; }
  get isSeeking(): boolean { return this.context.state === 'SEEKING'; }
  get isBuffering(): boolean { return this.context.state === 'BUFFERING'; }
  get hasError(): boolean { return this.context.state === 'ERROR'; }
  get canPlay(): boolean { return this.context.state === 'READY' || this.context.state === 'PLAYING'; }
}

// Singleton instance
export const playbackStateMachine = new PlaybackStateMachine();
