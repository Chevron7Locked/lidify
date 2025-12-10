import { prisma } from "./db";
import { encrypt, decrypt, encryptField } from "./encryption";

const CACHE_TTL_MS = 60 * 1000;

let cachedSettings: any | null = null;
let cacheExpiry = 0;

// Re-export encryptField for backwards compatibility
export { encryptField };

export function invalidateSystemSettingsCache() {
    cachedSettings = null;
    cacheExpiry = 0;
}

/**
 * Safely decrypt a field, returning null if decryption fails
 * This prevents one corrupted encrypted field from breaking all settings
 */
function safeDecrypt(value: string | null, fieldName?: string): string | null {
    if (!value) return null;
    try {
        return decrypt(value);
    } catch (error) {
        console.warn(`[Settings] Failed to decrypt ${fieldName || 'field'}, returning null`);
        return null;
    }
}

export async function getSystemSettings(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedSettings && cacheExpiry > now) {
        return { ...cachedSettings };
    }

    const settings = await prisma.systemSettings.findUnique({
        where: { id: "default" },
    });

    if (!settings) {
        cachedSettings = null;
        cacheExpiry = 0;
        return null;
    }

    // Decrypt sensitive fields - use safeDecrypt to handle corrupted fields gracefully
    const decrypted = {
        ...settings,
        mullvadPrivateKey: safeDecrypt(settings.mullvadPrivateKey, 'mullvadPrivateKey'),
        nordvpnPassword: safeDecrypt(settings.nordvpnPassword, 'nordvpnPassword'),
        protonvpnPassword: safeDecrypt(settings.protonvpnPassword, 'protonvpnPassword'),
        openvpnConfig: safeDecrypt(settings.openvpnConfig, 'openvpnConfig'),
        openvpnPassword: safeDecrypt(settings.openvpnPassword, 'openvpnPassword'),
        lidarrApiKey: safeDecrypt(settings.lidarrApiKey, 'lidarrApiKey'),
        nzbgetPassword: safeDecrypt(settings.nzbgetPassword, 'nzbgetPassword'),
        qbittorrentPassword: safeDecrypt(settings.qbittorrentPassword, 'qbittorrentPassword'),
        openaiApiKey: safeDecrypt(settings.openaiApiKey, 'openaiApiKey'),
        lastfmApiKey: safeDecrypt(settings.lastfmApiKey, 'lastfmApiKey'),
        lastfmApiSecret: safeDecrypt(settings.lastfmApiSecret, 'lastfmApiSecret'),
        fanartApiKey: safeDecrypt(settings.fanartApiKey, 'fanartApiKey'),
        audiobookshelfApiKey: safeDecrypt(settings.audiobookshelfApiKey, 'audiobookshelfApiKey'),
        soulseekPassword: safeDecrypt(settings.soulseekPassword, 'soulseekPassword'),
    };

    cachedSettings = decrypted;
    cacheExpiry = now + CACHE_TTL_MS;
    return { ...decrypted };
}
