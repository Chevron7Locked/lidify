import { useAuth } from "@/lib/auth-context";
import { ChangePasswordSection } from "./sections/ChangePasswordSection";
import { TwoFactorAuthSection } from "./sections/TwoFactorAuthSection";
import { APIKeysSection } from "./sections/APIKeysSection";
import { LinkDeviceSection } from "./sections/LinkDeviceSection";
import { UserManagementSection } from "./sections/UserManagementSection";

interface AccountTabProps {
    onSave: () => Promise<void>;
    isSaving: boolean;
}

export function AccountTab({ onSave, isSaving }: AccountTabProps) {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";

    return (
        <div className="space-y-6">
            <ChangePasswordSection />

            <TwoFactorAuthSection />

            <APIKeysSection />

            <LinkDeviceSection />

            {isAdmin && <UserManagementSection />}

            {/* Save Button */}
            <div className="pt-6">
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="w-full bg-[#111] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg border border-[#1c1c1c] transition-colors"
                >
                    {isSaving ? "Saving..." : "Save Changes"}
                </button>
            </div>
        </div>
    );
}
