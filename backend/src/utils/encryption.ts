import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

// Default key for development - users should set their own for production
const DEFAULT_ENCRYPTION_KEY = "default-encryption-key-change-me";

// Track if we've warned about using the default key
let hasWarnedAboutDefaultKey = false;

/**
 * Get the encryption key from environment, properly sized for AES-256
 * Falls back to a default key for development but logs a warning
 */
function getEncryptionKey(): Buffer {
    let key = process.env.SETTINGS_ENCRYPTION_KEY;

    if (!key || key === DEFAULT_ENCRYPTION_KEY) {
        if (!hasWarnedAboutDefaultKey) {
            console.warn(
                "[SECURITY] Using default encryption key. Set SETTINGS_ENCRYPTION_KEY in production."
            );
            hasWarnedAboutDefaultKey = true;
        }
        key = DEFAULT_ENCRYPTION_KEY;
    }

    if (key.length < 32) {
        // Pad with zeros if too short
        return Buffer.from(key.padEnd(32, "0"));
    }
    // Truncate if too long
    return Buffer.from(key.slice(0, 32));
}

/**
 * Encrypt a string using AES-256-CBC
 * Returns empty string for empty/null input
 */
export function encrypt(text: string): string {
    if (!text) return "";
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypt a string that was encrypted with the encrypt function
 * Returns empty string for empty/null input
 * Returns original text if decryption fails (for backwards compatibility with unencrypted data)
 */
export function decrypt(text: string): string {
    if (!text) return "";
    try {
        const parts = text.split(":");
        if (parts.length < 2) {
            // Not in expected format, return as-is (might be unencrypted)
            return text;
        }
        const iv = Buffer.from(parts[0], "hex");
        const encryptedText = Buffer.from(parts.slice(1).join(":"), "hex");
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            getEncryptionKey(),
            iv
        );
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error: any) {
        // If it's a decryption error (wrong key), throw so callers know the value is corrupt
        if (error.code === 'ERR_OSSL_BAD_DECRYPT') {
            throw error;
        }
        // For other errors, log and return original (might be unencrypted)
        console.error("Decryption error:", error);
        return text;
    }
}

/**
 * Encrypt a field value, returning null for empty/null values
 * Useful for database fields that should store null instead of empty encrypted strings
 */
export function encryptField(value: string | null | undefined): string | null {
    if (!value || value.trim() === "") return null;
    return encrypt(value);
}

/**
 * Decrypt a field value, returning null for null values
 * Returns empty string for empty input
 */
export function decryptField(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return decrypt(value);
}

