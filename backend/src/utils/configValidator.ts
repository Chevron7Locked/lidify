import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { AppError, ErrorCode, ErrorCategory } from "./errors";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { getSystemSettings } from "./systemSettings";

export interface MusicConfig {
    musicPath: string;
    transcodeCachePath: string;
    transcodeCacheMaxGb: number;
}

/**
 * Validate and load music configuration
 */
export async function validateMusicConfig(): Promise<MusicConfig> {
    // Get system settings to use configured paths
    const settings = await getSystemSettings();

    // Get music path - prefer environment variable if SystemSettings has default value
    let musicPath = process.env.MUSIC_PATH || settings?.musicPath || "/music";

    // If settings has a non-default path, prefer that over environment
    if (settings?.musicPath && settings.musicPath !== "/music") {
        musicPath = settings.musicPath;
    }

    // VALIDATE MUSIC PATH EXISTS
    if (!fs.existsSync(musicPath)) {
        throw new AppError(
            ErrorCode.MUSIC_PATH_NOT_ACCESSIBLE,
            ErrorCategory.FATAL,
            `Music path does not exist: ${musicPath}. Please check MUSIC_PATH environment variable or SystemSettings.`
        );
    }

    // VALIDATE MUSIC PATH IS READABLE
    try {
        fs.accessSync(musicPath, fs.constants.R_OK);
    } catch {
        throw new AppError(
            ErrorCode.MUSIC_PATH_NOT_ACCESSIBLE,
            ErrorCategory.FATAL,
            `Music path not readable: ${musicPath}. Check file permissions.`
        );
    }

    // Get transcode cache path
    const transcodeCachePath =
        process.env.TRANSCODE_CACHE_PATH ||
        path.join(process.cwd(), "cache", "transcodes");

    // VALIDATE TRANSCODE CACHE PATH
    // Create if doesn't exist
    if (!fs.existsSync(transcodeCachePath)) {
        try {
            fs.mkdirSync(transcodeCachePath, { recursive: true });
            console.log(
                `Created transcode cache directory: ${transcodeCachePath}`
            );
        } catch (err: any) {
            throw new AppError(
                ErrorCode.TRANSCODE_CACHE_NOT_WRITABLE,
                ErrorCategory.FATAL,
                `Cannot create transcode cache directory: ${transcodeCachePath}`,
                { originalError: err.message }
            );
        }
    }

    // Validate writable
    try {
        fs.accessSync(transcodeCachePath, fs.constants.W_OK);
    } catch {
        throw new AppError(
            ErrorCode.TRANSCODE_CACHE_NOT_WRITABLE,
            ErrorCategory.FATAL,
            `Transcode cache not writable: ${transcodeCachePath}. Check file permissions.`
        );
    }

    // Get cache size limit from SystemSettings or fallback to env/default
    const transcodeCacheMaxGb =
        settings?.transcodeCacheMaxGb ||
        parseInt(process.env.TRANSCODE_CACHE_MAX_GB || "10", 10);

    if (isNaN(transcodeCacheMaxGb) || transcodeCacheMaxGb < 1) {
        throw new AppError(
            ErrorCode.INVALID_CONFIG,
            ErrorCategory.FATAL,
            `Invalid transcode cache size: must be a positive integer. Got: ${transcodeCacheMaxGb}`
        );
    }

    // VALIDATE BUNDLED FFMPEG (from @ffmpeg-installer/ffmpeg)
    try {
        // Check if bundled FFmpeg binary exists
        if (!fs.existsSync(ffmpegPath.path)) {
            throw new Error(`Bundled FFmpeg not found at: ${ffmpegPath.path}`);
        }

        // Verify it's executable by running version check
        const result = execSync(`"${ffmpegPath.path}" -version`, {
            encoding: "utf8",
        });
        if (!result.includes("ffmpeg version")) {
            throw new Error("Invalid ffmpeg output");
        }

        console.log(`FFmpeg detected (bundled): ${result.split("\n")[0]}`);
        console.log(`   FFmpeg path: ${ffmpegPath.path}`);
    } catch (err: any) {
        console.warn(
            "  Bundled FFmpeg not available. Transcoding will not be available."
        );
        console.warn(`   Error: ${err.message}`);
        console.warn("   Original quality streaming will still work.");
        // Don't throw - allow server to start without FFmpeg
    }

    console.log("Music configuration validated successfully");
    console.log(`   Music path: ${musicPath}`);
    console.log(`   Transcode cache: ${transcodeCachePath}`);
    console.log(`   Cache limit: ${transcodeCacheMaxGb} GB`);

    return {
        musicPath,
        transcodeCachePath,
        transcodeCacheMaxGb,
    };
}
