/**
 * Simple event emitter for seeking without causing re-renders
 * This allows the seek() function to communicate with AudioElement
 * without subscribing to currentTime state changes
 */

type SeekListener = (time: number) => void;

class AudioSeekEmitter {
    private listeners: Set<SeekListener> = new Set();

    public subscribe(listener: SeekListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public emit(time: number): void {
        this.listeners.forEach((listener) => listener(time));
    }
}

export const audioSeekEmitter = new AudioSeekEmitter();
