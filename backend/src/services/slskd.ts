import axios, { AxiosInstance } from "axios";

/**
 * Slskd API Service
 * Configures Slskd (Soulseek client) with user credentials
 */
class SlskdService {
    private client: AxiosInstance | null = null;
    private baseUrl: string = "http://localhost:5030";
    private initialized: boolean = false;
    private token: string | null = null;

    /**
     * Get JWT Bearer token from Slskd
     * Slskd uses API key authentication, not username/password
     */
    private async getToken(): Promise<string> {
        // Always get a fresh token (they expire)
        try {
            console.log(
                `[SLSKD-AUTH] Attempting authentication to: ${this.baseUrl}`
            );

            const loginClient = axios.create({
                baseURL: this.baseUrl,
                timeout: 5000,
            });

            // Slskd API authentication - use default credentials
            const response = await loginClient.post("/api/v0/session", {
                username: "slskd",
                password: "slskd",
            });

            this.token = response.data.token;
            console.log(`[SLSKD-AUTH] Authentication successful`);
            return this.token;
        } catch (error: any) {
            const errorCode = error.code || error.response?.status;
            const errorMessage = error.message || "Unknown error";
            const errorDetails = error.response?.data;

            // Check if it's a connection error
            if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
                console.error(
                    `[SLSKD-AUTH] ✗ Slskd is not available at ${this.baseUrl}. Is the service running?`
                );
                throw new Error(
                    `Slskd service is not available at ${this.baseUrl}. Please ensure Slskd is running and accessible.`
                );
            }

            console.error("Failed to authenticate with Slskd:", errorMessage);
            console.error("Slskd URL:", this.baseUrl);
            console.error("Error code:", errorCode);
            console.error(
                "Error response:",
                error.response?.status,
                error.response?.statusText
            );
            console.error("Error details:", errorDetails);
            throw new Error(
                `Failed to authenticate with Slskd: ${errorMessage}`
            );
        }
    }

    /**
     * Initialize the service with URL from settings
     */
    async ensureInitialized() {
        // Always get a fresh token - they expire quickly
        // Don't cache the initialized state to ensure we always have a valid token
        this.initialized = false;
        this.client = null;
        this.token = null;

        try {
            const { getSystemSettings } = await import(
                "../utils/systemSettings"
            );
            const settings = await getSystemSettings();

            if (settings?.slskdUrl) {
                this.baseUrl = settings.slskdUrl;
            }

            // Always get a fresh token (they expire quickly)
            const token = await this.getToken();

            // Recreate client with fresh token
            this.client = axios.create({
                baseURL: this.baseUrl,
                timeout: 10000,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            this.initialized = true;
            console.log(`Slskd configured: ${this.baseUrl}`);

            // Configure download options to flatten structure (avoid Windows path issues)
            // Do this immediately after initialization to ensure downloads go to flat structure
            await this.configureDownloadOptions();

            // Also ensure the downloads directory exists
            try {
                await this.client.get("/api/v0/options"); // This will trigger any needed setup
            } catch (err) {
                // Ignore - just ensuring connection is ready
            }
        } catch (error: any) {
            // Reset initialized state on error
            this.initialized = false;
            this.client = null;
            this.token = null;

            console.error("Failed to initialize Slskd service:", error.message);
            throw error;
        }
    }

    /**
     * Configure download options to flatten structure (avoid Windows path issues)
     */
    private async configureDownloadOptions(): Promise<void> {
        if (!this.client) {
            return;
        }

        try {
            // Get current Slskd configuration
            const { data: config } = await this.client.get("/api/v0/options");

            // Ensure download directory is set correctly
            if (config.directories) {
                config.directories.downloads = "/downloads";
            } else {
                config.directories = {
                    downloads: "/downloads",
                };
            }

            // Configure download options to flatten structure (avoid Windows path issues with brackets/special chars)
            // This prevents Slskd from creating nested directories that might have invalid characters
            if (!config.downloads) {
                config.downloads = {};
            }

            // CRITICAL: Flatten downloads - save all files directly to /downloads without subdirectories
            // Set folderPathTemplate to empty string to disable folder structure preservation
            config.downloads = config.downloads || {};
            config.downloads.folderPathTemplate = ""; // Empty = flatten to download root

            // Also ensure preserveFolderStructure is false
            config.downloads.preserveFolderStructure = false;

            // Ensure download directory is set correctly (should already be set above, but double-check)
            if (!config.directories) {
                config.directories = {};
            }
            config.directories.downloads = "/downloads";

            // Try PUT first, if that fails try PATCH
            try {
                await this.client.put("/api/v0/options", config);
                console.log(
                    `Configured Slskd download options (flattened structure)`
                );
            } catch (putError: any) {
                if (putError.response?.status === 405) {
                    // PUT not allowed, try PATCH
                    try {
                        await this.client.patch("/api/v0/options", config);
                        console.log(
                            `Configured Slskd download options via PATCH (flattened structure)`
                        );
                    } catch (patchError: any) {
                        console.warn(
                            "Failed to configure Slskd download options (PUT and PATCH both failed):",
                            patchError.message
                        );
                        console.warn(
                            "  Slskd may preserve folder structure from source paths. Files may need manual organization."
                        );
                        // Don't throw - this is not critical for basic functionality
                    }
                } else {
                    throw putError;
                }
            }
        } catch (error: any) {
            console.warn(
                "Failed to configure Slskd download options:",
                error.message
            );
            if (error.response) {
                console.error("Error status:", error.response?.status);
                console.error("Error details:", error.response?.data);
            }
            // Don't throw - this is not critical for basic functionality
        }
    }

    /**
     * Configure Soulseek credentials in Slskd
     */
    async configureSoulseek(
        username: string,
        password: string
    ): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.client) {
            throw new Error("Slskd client not initialized");
        }

        try {
            // Get current Slskd configuration
            const { data: config } = await this.client.get("/api/v0/options");

            // Update the Soulseek credentials
            config.soulseek = config.soulseek || {};
            config.soulseek.username = username;
            config.soulseek.password = password;

            // Ensure download directory is set correctly
            if (config.directories) {
                config.directories.downloads = "/downloads";
            } else {
                config.directories = {
                    downloads: "/downloads",
                };
            }

            // Configure download options to flatten structure
            await this.configureDownloadOptions();

            // Save the updated configuration (download options already saved in configureDownloadOptions)
            await this.client.put("/api/v0/options", config);

            console.log(`Configured Slskd with Soulseek user: ${username}`);

            // Trigger reconnection
            await this.reconnect();

            return true;
        } catch (error: any) {
            console.error("Failed to configure Slskd:", error.message);
            return false;
        }
    }

    /**
     * Trigger Slskd to reconnect to Soulseek network
     */
    async reconnect(): Promise<void> {
        await this.ensureInitialized();

        if (!this.client) {
            throw new Error("Slskd client not initialized");
        }

        try {
            await this.client.post("/api/v0/server");
            console.log("Triggered Slskd reconnection");
        } catch (error: any) {
            console.error("Failed to reconnect Slskd:", error.message);
        }
    }

    /**
     * Get Slskd connection status
     */
    async getStatus(): Promise<{ connected: boolean; username?: string }> {
        await this.ensureInitialized();

        if (!this.client) {
            throw new Error("Slskd client not initialized");
        }

        try {
            const { data } = await this.client.get("/api/v0/server");
            return {
                connected: data.state === "Connected",
                username: data.username,
            };
        } catch (error) {
            return { connected: false };
        }
    }

    /**
     * Search for content on the Soulseek network
     */
    async search(query: string): Promise<string> {
        await this.ensureInitialized();

        if (!this.client) {
            throw new Error("Slskd client not initialized");
        }

        try {
            // Slskd expects a POST with searchText in the JSON body
            const { data } = await this.client.post(`/api/v0/searches`, {
                searchText: query,
            });

            console.log(`Slskd search started: ${data.id}`);
            return data.id;
        } catch (error: any) {
            console.error("Failed to start Slskd search:", error.message);
            console.error("Error details:", error.response?.data);
            throw error;
        }
    }

    /**
     * Get search results
     */
    async getSearchResults(searchId: string): Promise<any[]> {
        await this.ensureInitialized();

        if (!this.client) {
            throw new Error("Slskd client not initialized");
        }

        try {
            // Get the responses sub-endpoint which has the actual file results
            const { data } = await this.client.get(
                `/api/v0/searches/${searchId}/responses`
            );

            // Flatten responses from all users
            const results: any[] = [];
            if (Array.isArray(data)) {
                data.forEach((response: any) => {
                    if (response.files) {
                        response.files.forEach((file: any) => {
                            results.push({
                                username: response.username,
                                ...file,
                            });
                        });
                    }
                });
            }

            return results;
        } catch (error: any) {
            console.error("Failed to get search results:", error.message);
            throw error;
        }
    }

    /**
     * Download a file from a user
     */
    async download(
        username: string,
        filepath: string,
        size?: number
    ): Promise<void> {
        // Always ensure we have a fresh token before downloading
        await this.ensureInitialized();

        // Double-check client is ready
        if (!this.client) {
            throw new Error("Slskd client not initialized");
        }

        try {
            // Slskd download endpoint - POST to user-specific downloads endpoint
            // The API expects an array of file objects with filename property
            // Optionally include size if available for validation
            const url = `/api/v0/transfers/downloads/${encodeURIComponent(
                username
            )}`;

            const downloadRequest: any[] = [
                {
                    filename: filepath,
                },
            ];

            // Include size if provided (helps with validation)
            if (size !== undefined && size > 0) {
                downloadRequest[0].size = size;
            }

            console.log(
                `[SLSKD] Download request:`,
                JSON.stringify(downloadRequest, null, 2)
            );

            try {
                await this.client.post(url, downloadRequest);
                console.log(`Download queued: ${filepath} from ${username}`);
            } catch (authError: any) {
                // If we get a 401, token expired - refresh and retry once
                if (authError.response?.status === 401) {
                    console.log("[SLSKD] Token expired, refreshing...");
                    this.initialized = false;
                    this.client = null;
                    this.token = null;
                    await this.ensureInitialized();

                    if (!this.client) {
                        throw new Error(
                            "Slskd client not initialized after refresh"
                        );
                    }

                    // Retry the download with fresh token
                    await this.client.post(url, downloadRequest);
                    console.log(
                        `Download queued (after token refresh): ${filepath} from ${username}`
                    );
                } else {
                    throw authError;
                }
            }
        } catch (error: any) {
            console.error("Failed to queue download:", error.message);
            console.error("Error details:", error.response?.data);
            console.error("Request was:", { username, filepath, size });
            throw error;
        }
    }

    /**
     * Get active downloads
     */
    async getDownloads(): Promise<any[]> {
        await this.ensureInitialized();

        if (!this.client) {
            throw new Error("Slskd client not initialized");
        }

        try {
            const { data } = await this.client.get(
                "/api/v0/transfers/downloads"
            );

            return data.downloads || [];
        } catch (error: any) {
            console.error("Failed to get downloads:", error.message);
            return [];
        }
    }

    /**
     * Generate or get API key for Soularr integration
     */
    async getOrCreateApiKey(): Promise<string> {
        await this.ensureInitialized();

        if (!this.client) {
            throw new Error("Slskd client not initialized");
        }

        try {
            // First, try to get existing API keys
            const { data: keys } = await this.client.get(
                "/api/v0/application/apikeys"
            );

            // Look for a key named "soularr" or use the first one
            const existingKey = keys.find(
                (k: any) => k.name?.toLowerCase() === "soularr"
            );
            if (existingKey && existingKey.key) {
                console.log("Using existing Slskd API key for Soularr");
                return existingKey.key;
            }

            // If no key exists, create one
            const { data: newKey } = await this.client.post(
                "/api/v0/application/apikeys",
                {
                    name: "soularr",
                    role: "Administrator",
                }
            );

            console.log("Created new Slskd API key for Soularr");
            return newKey.key;
        } catch (error: any) {
            console.error("Failed to get/create Slskd API key:", error.message);
            throw error;
        }
    }
}

export const slskdService = new SlskdService();
