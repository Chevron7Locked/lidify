/**
 * Map file extension to Howler.js format string.
 * Howler needs the correct container format to select the right decoder.
 */
export function getAudioFormat(filePath: string | undefined | null): string {
    if (!filePath) return "mp3";
    const ext = filePath.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "flac": return "flac";
        case "m4a":
        case "aac": return "mp4";
        case "ogg": return "ogg";
        case "opus": return "webm";
        case "wav": return "wav";
        default: return "mp3";
    }
}
