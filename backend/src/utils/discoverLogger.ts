import { writeFileSync, appendFileSync } from "fs";
import { join } from "path";

/**
 * Logger for Discover Weekly generation that writes to both console and file
 * Uses monkey-patching to intercept all console.log/error calls
 */
class DiscoverLogger {
    private logFilePath: string;
    private isLogging: boolean = false;
    private originalConsoleLog: typeof console.log;
    private originalConsoleError: typeof console.error;

    constructor() {
        // Create log file with timestamp
        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, -5);
        this.logFilePath = join(
            process.cwd(),
            "logs",
            `discover-${timestamp}.log`
        );

        // Store original console methods
        this.originalConsoleLog = console.log;
        this.originalConsoleError = console.error;
    }

    /**
     * Start intercepting console output and write to file
     */
    start(userId: string) {
        this.isLogging = true;
        const header = `
========================================
Discover Weekly Generation Log
User ID: ${userId}
Started: ${new Date().toISOString()}
========================================

`;
        writeFileSync(this.logFilePath, header, "utf-8");
        this.originalConsoleLog(` Logging to: ${this.logFilePath}`);

        // Monkey-patch console.log
        console.log = (...args: any[]) => {
            this.originalConsoleLog(...args);
            if (this.isLogging) {
                const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
                const message = args
                    .map((arg) =>
                        typeof arg === "object"
                            ? JSON.stringify(arg)
                            : String(arg)
                    )
                    .join(" ");
                appendFileSync(
                    this.logFilePath,
                    `[${timestamp}] ${message}\n`,
                    "utf-8"
                );
            }
        };

        // Monkey-patch console.error
        console.error = (...args: any[]) => {
            this.originalConsoleError(...args);
            if (this.isLogging) {
                const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
                const message = args
                    .map((arg) =>
                        typeof arg === "object"
                            ? JSON.stringify(arg)
                            : String(arg)
                    )
                    .join(" ");
                appendFileSync(
                    this.logFilePath,
                    `[${timestamp}] ERROR: ${message}\n`,
                    "utf-8"
                );
            }
        };
    }

    /**
     * Stop intercepting console output
     */
    end() {
        if (this.isLogging) {
            const footer = `
========================================
Generation Complete
Ended: ${new Date().toISOString()}
========================================
`;
            appendFileSync(this.logFilePath, footer, "utf-8");

            // Restore original console methods
            console.log = this.originalConsoleLog;
            console.error = this.originalConsoleError;

            this.originalConsoleLog(`\nFull log saved to: ${this.logFilePath}`);
            this.isLogging = false;
        }
    }

    /**
     * Get the current log file path
     */
    getLogPath(): string {
        return this.logFilePath;
    }
}

// Create singleton instance
let currentLogger: DiscoverLogger | null = null;

/**
 * Get or create a logger instance
 */
export function getDiscoverLogger(): DiscoverLogger {
    if (!currentLogger) {
        currentLogger = new DiscoverLogger();
    }
    return currentLogger;
}

/**
 * Reset logger (creates a new instance for next generation)
 */
export function resetDiscoverLogger() {
    if (currentLogger) {
        currentLogger.end();
    }
    currentLogger = null;
}
