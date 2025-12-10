import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/db";
import jwt from "jsonwebtoken";

// JWT_SECRET is required - SESSION_SECRET is used as fallback since docker-entrypoint.sh generates it
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        "JWT_SECRET or SESSION_SECRET environment variable is required for authentication"
    );
}

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                username: string;
                role: string;
            };
        }
    }
}

export interface JWTPayload {
    userId: string;
    username: string;
    role: string;
}

export function generateToken(user: { id: string; username: string; role: string }): string {
    return jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "30d" }
    );
}

export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
) {
    // First, check session-based auth (primary method)
    if (req.session?.userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: req.session.userId },
                select: { id: true, username: true, role: true },
            });

            if (user) {
                req.user = user;
                return next();
            }
        } catch (error) {
            console.error("Session auth error:", error);
        }
    }

    // Check for API key in X-API-Key header (for mobile/external apps)
    const apiKey = req.headers["x-api-key"] as string;
    if (apiKey) {
        try {
            const apiKeyRecord = await prisma.apiKey.findUnique({
                where: { key: apiKey },
                include: { user: { select: { id: true, username: true, role: true } } },
            });

            if (apiKeyRecord && apiKeyRecord.user) {
                // Update last used timestamp (async, don't block)
                prisma.apiKey.update({
                    where: { id: apiKeyRecord.id },
                    data: { lastUsed: new Date() },
                }).catch(() => {}); // Ignore errors on lastUsed update

                req.user = apiKeyRecord.user;
                return next();
            }
        } catch (error) {
            console.error("API key auth error:", error);
        }
    }

    // Fallback: check JWT token in Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, username: true, role: true },
            });

            if (user) {
                req.user = user;
                return next();
            }
        } catch (error) {
            // Token invalid, continue to error
        }
    }

    return res.status(401).json({ error: "Not authenticated" });
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
}

// For streaming URLs that may use query params or need special handling
export async function requireAuthOrToken(
    req: Request,
    res: Response,
    next: NextFunction
) {
    // First, check session-based auth (primary method for web)
    if (req.session?.userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: req.session.userId },
                select: { id: true, username: true, role: true },
            });

            if (user) {
                req.user = user;
                return next();
            }
        } catch (error) {
            console.error("Session auth error:", error);
        }
    }

    // Check for API key in X-API-Key header (for mobile/external apps)
    const apiKey = req.headers["x-api-key"] as string;
    if (apiKey) {
        try {
            const apiKeyRecord = await prisma.apiKey.findUnique({
                where: { key: apiKey },
                include: { user: { select: { id: true, username: true, role: true } } },
            });

            if (apiKeyRecord && apiKeyRecord.user) {
                // Update last used timestamp (async, don't block)
                prisma.apiKey.update({
                    where: { id: apiKeyRecord.id },
                    data: { lastUsed: new Date() },
                }).catch(() => {}); // Ignore errors on lastUsed update

                req.user = apiKeyRecord.user;
                return next();
            }
        } catch (error) {
            console.error("API key auth error:", error);
        }
    }

    // Check for token in query param (for streaming URLs from audio elements)
    const tokenParam = req.query.token as string;
    if (tokenParam) {
        try {
            const decoded = jwt.verify(tokenParam, JWT_SECRET) as JWTPayload;
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, username: true, role: true },
            });

            if (user) {
                req.user = user;
                return next();
            }
        } catch (error) {
            // Token invalid, try other methods
        }
    }

    // Fallback: check JWT token in Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, username: true, role: true },
            });

            if (user) {
                req.user = user;
                return next();
            }
        } catch (error) {
            // Token invalid, continue to error
        }
    }

    return res.status(401).json({ error: "Not authenticated" });
}
