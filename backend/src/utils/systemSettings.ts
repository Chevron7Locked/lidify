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

    // Decrypt sensitive fields
    const decrypted = {
        ...settings,
        mullvadPrivateKey: settings.mullvadPrivateKey
            ? decrypt(settings.mullvadPrivateKey)
            : null,
        nordvpnPassword: settings.nordvpnPassword
            ? decrypt(settings.nordvpnPassword)
            : null,
        protonvpnPassword: settings.protonvpnPassword
            ? decrypt(settings.protonvpnPassword)
            : null,
        openvpnConfig: settings.openvpnConfig
            ? decrypt(settings.openvpnConfig)
            : null,
        openvpnPassword: settings.openvpnPassword
            ? decrypt(settings.openvpnPassword)
            : null,
        lidarrApiKey: settings.lidarrApiKey
            ? decrypt(settings.lidarrApiKey)
            : null,
        nzbgetPassword: settings.nzbgetPassword
            ? decrypt(settings.nzbgetPassword)
            : null,
        qbittorrentPassword: settings.qbittorrentPassword
            ? decrypt(settings.qbittorrentPassword)
            : null,
        openaiApiKey: settings.openaiApiKey
            ? decrypt(settings.openaiApiKey)
            : null,
        lastfmApiKey: settings.lastfmApiKey
            ? decrypt(settings.lastfmApiKey)
            : null,
        lastfmApiSecret: settings.lastfmApiSecret
            ? decrypt(settings.lastfmApiSecret)
            : null,
        fanartApiKey: settings.fanartApiKey
            ? decrypt(settings.fanartApiKey)
            : null,
        audiobookshelfApiKey: settings.audiobookshelfApiKey
            ? decrypt(settings.audiobookshelfApiKey)
            : null,
        soulseekPassword: settings.soulseekPassword
            ? decrypt(settings.soulseekPassword)
            : null,
    };

    cachedSettings = decrypted;
    cacheExpiry = now + CACHE_TTL_MS;
    return { ...decrypted };
}
