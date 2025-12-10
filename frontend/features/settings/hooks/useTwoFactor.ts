import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";

export function useTwoFactor() {
    const { toast } = useToast();
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [loadingTwoFactor, setLoadingTwoFactor] = useState(false);
    const [settingUpTwoFactor, setSettingUpTwoFactor] = useState(false);
    const [twoFactorSecret, setTwoFactorSecret] = useState("");
    const [twoFactorQR, setTwoFactorQR] = useState("");
    const [twoFactorToken, setTwoFactorToken] = useState("");
    const [disablingTwoFactor, setDisablingTwoFactor] = useState(false);
    const [disableTwoFactorPassword, setDisableTwoFactorPassword] = useState("");
    const [disableTwoFactorToken, setDisableTwoFactorToken] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

    const load2FAStatus = useCallback(async () => {
        try {
            setLoadingTwoFactor(true);
            const status = await api.get("/auth/2fa/status");
            setTwoFactorEnabled(status.enabled);
        } catch (error) {
            console.error("Failed to load 2FA status:", error);
            // Don't show toast on initial load failure - it's noisy
        } finally {
            setLoadingTwoFactor(false);
        }
    }, []);

    const setup2FA = async () => {
        try {
            setLoadingTwoFactor(true);
            const response = await api.post("/auth/2fa/setup", {});
            setTwoFactorSecret(response.secret);
            setTwoFactorQR(response.qrCode);
            setSettingUpTwoFactor(true);
        } catch (error: any) {
            console.error("Failed to setup 2FA:", error);
            toast.error(error.message || "Failed to setup 2FA");
        } finally {
            setLoadingTwoFactor(false);
        }
    };

    const enable2FA = async (token: string) => {
        try {
            setLoadingTwoFactor(true);
            const response = await api.post("/auth/2fa/enable", {
                secret: twoFactorSecret,
                token,
            });

            setRecoveryCodes(response.recoveryCodes);
            setShowRecoveryCodes(true);
            setTwoFactorEnabled(true);
            setSettingUpTwoFactor(false);
            setTwoFactorToken("");

            toast.success("Two-factor authentication enabled successfully!");
        } catch (error: any) {
            console.error("Failed to enable 2FA:", error);
            toast.error(error.message || "Invalid token. Please try again.");
            throw error;
        } finally {
            setLoadingTwoFactor(false);
        }
    };

    const disable2FA = async (password: string, token: string) => {
        try {
            setDisablingTwoFactor(true);
            await api.post("/auth/2fa/disable", {
                password,
                token,
            });

            setTwoFactorEnabled(false);
            setDisableTwoFactorPassword("");
            setDisableTwoFactorToken("");
            toast.success("Two-factor authentication disabled");
        } catch (error: any) {
            console.error("Failed to disable 2FA:", error);
            toast.error(error.message || "Failed to disable 2FA. Check your password and token.");
            throw error;
        } finally {
            setDisablingTwoFactor(false);
        }
    };

    const cancel2FASetup = () => {
        setSettingUpTwoFactor(false);
        setTwoFactorToken("");
        setTwoFactorSecret("");
        setTwoFactorQR("");
    };

    const closeRecoveryCodes = () => {
        setShowRecoveryCodes(false);
        setRecoveryCodes([]);
    };

    return {
        twoFactorEnabled,
        loadingTwoFactor,
        settingUpTwoFactor,
        twoFactorSecret,
        twoFactorQR,
        twoFactorToken,
        disablingTwoFactor,
        disableTwoFactorPassword,
        disableTwoFactorToken,
        recoveryCodes,
        showRecoveryCodes,
        setTwoFactorToken,
        setDisableTwoFactorPassword,
        setDisableTwoFactorToken,
        load2FAStatus,
        setup2FA,
        enable2FA,
        disable2FA,
        cancel2FASetup,
        closeRecoveryCodes,
    };
}
