import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../utils/db";
import { subsonicError, SubsonicError } from "../utils/subsonicResponse";

export async function subsonicAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const username = req.query.u as string | undefined;
    const apiKey = req.query.apiKey as string | undefined;
    const password = req.query.p as string | undefined;
    const tokenMd5 = req.query.t as string | undefined;

    if (!username) {
        subsonicError(req, res, SubsonicError.MISSING_PARAM, "Required parameter is missing: u");
        return;
    }

    // Reject MD5 token auth — cryptographically insecure, not supported
    if (tokenMd5) {
        subsonicError(req, res, SubsonicError.TOKEN_AUTH_NOT_SUPPORTED, "Token-based auth is not supported. Use apiKey (OpenSubsonic) instead.");
        return;
    }

    try {
        // OpenSubsonic API key auth (preferred)
        if (apiKey) {
            const keyRecord = await prisma.apiKey.findUnique({
                where: { key: apiKey },
                include: {
                    user: { select: { id: true, username: true, role: true } },
                },
            });

            if (!keyRecord || keyRecord.user.username !== username) {
                subsonicError(req, res, SubsonicError.WRONG_CREDENTIALS, "Wrong username or password");
                return;
            }

            // Update lastUsed non-blocking
            prisma.apiKey
                .update({ where: { id: keyRecord.id }, data: { lastUsed: new Date() } })
                .catch(() => {});

            req.user = keyRecord.user;
            next();
            return;
        }

        // Legacy plaintext password auth
        if (password) {
            // Subsonic "enc:" prefix means hex-encoded password
            const plainPassword = password.startsWith("enc:")
                ? Buffer.from(password.slice(4), "hex").toString("utf8")
                : password;

            const user = await prisma.user.findUnique({
                where: { username },
                select: { id: true, username: true, role: true, passwordHash: true },
            });

            // Timing-safe: always run bcrypt.compare to prevent username enumeration
            const dummyHash = "$2b$10$invalidhashfortimingsafety.00000000000000000000";
            let valid = false;
            if (user) {
                valid = await bcrypt.compare(plainPassword, user.passwordHash);
            } else {
                // Run bcrypt against a dummy hash for timing safety (prevents username enumeration)
                await bcrypt.compare(plainPassword, dummyHash);
                // valid remains false
            }

            if (!valid || !user) {
                subsonicError(req, res, SubsonicError.WRONG_CREDENTIALS, "Wrong username or password");
                return;
            }

            req.user = { id: user.id, username: user.username, role: user.role };
            next();
            return;
        }

        subsonicError(req, res, SubsonicError.MISSING_PARAM, "Required parameter is missing: p or apiKey");
    } catch (_err) {
        subsonicError(req, res, SubsonicError.GENERIC, "Authentication error");
    }
}
