import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { ApiKey } from "../types";

export function useAPIKeys() {
    const { toast } = useToast();
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [loadingApiKeys, setLoadingApiKeys] = useState(false);
    const [showCreateApiKeyDialog, setShowCreateApiKeyDialog] = useState(false);
    const [newApiKeyName, setNewApiKeyName] = useState("");
    const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
    const [creatingApiKey, setCreatingApiKey] = useState(false);

    const loadApiKeys = async () => {
        try {
            setLoadingApiKeys(true);
            const response = await api.listApiKeys();
            // Map API response to match ApiKey type
            const mappedKeys = response.apiKeys.map(key => ({
                ...key,
                lastUsedAt: key.lastUsed,
                keyPreview: key.id.substring(0, 8) + "..." // Generate preview from ID
            }));
            setApiKeys(mappedKeys);
        } catch (error) {
            console.error("Failed to load API keys:", error);
            toast.error("Failed to load API keys");
        } finally {
            setLoadingApiKeys(false);
        }
    };

    const createApiKey = async (name: string) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            toast.error("Device name is required");
            return;
        }

        try {
            setCreatingApiKey(true);
            const response = await api.createApiKey(trimmedName);
            setGeneratedApiKey(response.apiKey);
            setShowCreateApiKeyDialog(false);
            setNewApiKeyName("");
            await loadApiKeys();
            toast.success("API key created successfully");
        } catch (error: any) {
            console.error("Failed to create API key:", error);
            toast.error(error.message || "Failed to create API key");
        } finally {
            setCreatingApiKey(false);
        }
    };

    const revokeApiKey = async (id: string) => {
        try {
            await api.revokeApiKey(id);
            await loadApiKeys();
            toast.success("API key revoked");
        } catch (error: any) {
            console.error("Failed to revoke API key:", error);
            toast.error(error.message || "Failed to revoke API key");
        }
    };

    const clearGeneratedKey = () => {
        setGeneratedApiKey(null);
    };

    return {
        apiKeys,
        loadingApiKeys,
        showCreateApiKeyDialog,
        newApiKeyName,
        generatedApiKey,
        creatingApiKey,
        setShowCreateApiKeyDialog,
        setNewApiKeyName,
        loadApiKeys,
        createApiKey,
        revokeApiKey,
        clearGeneratedKey,
    };
}
