import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { api } from "@/lib/api";

export function ChangePasswordSection() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);

    const { toast } = useToast();

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            toast.error("All fields are required");
            return;
        }

        if (newPassword.length < 6) {
            toast.error("New password must be at least 6 characters");
            return;
        }

        if (newPassword !== confirmNewPassword) {
            toast.error("New passwords do not match");
            return;
        }

        setChangingPassword(true);
        try {
            await api.post("/auth/change-password", {
                currentPassword,
                newPassword,
            });

            toast.success("Password changed successfully");

            // Clear form on success
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
        } catch (error: any) {
            toast.error(
                error.response?.data?.message || "Failed to change password"
            );
        } finally {
            setChangingPassword(false);
        }
    };

    const isFormValid =
        currentPassword.length > 0 &&
        newPassword.length >= 6 &&
        confirmNewPassword.length > 0 &&
        newPassword === confirmNewPassword;

    return (
        <section id="change-password" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">Change Password</h2>
            <p className="text-sm text-gray-400 mb-6">
                Update your account password
            </p>

            <form onSubmit={handleChangePassword} className="space-y-4">
                <Input
                    type="password"
                    label="Current Password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={changingPassword}
                />

                <Input
                    type="password"
                    label="New Password"
                    placeholder="Enter new password (min 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={changingPassword}
                />

                <Input
                    type="password"
                    label="Confirm New Password"
                    placeholder="Confirm new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    disabled={changingPassword}
                />

                <Button
                    type="submit"
                    variant="primary"
                    disabled={!isFormValid || changingPassword}
                    isLoading={changingPassword}
                    className="w-full"
                >
                    {changingPassword ? "Changing Password..." : "Change Password"}
                </Button>
            </form>
        </section>
    );
}
