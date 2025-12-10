import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { api } from "@/lib/api";

interface User {
    id: string;
    username: string;
    role: "user" | "admin";
    createdAt: string;
}

export function UserManagementSection() {
    const { user: currentUser } = useAuth();
    const { toast } = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [newUsername, setNewUsername] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
    const [creatingUser, setCreatingUser] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await api.get("/auth/users");
            setUsers(data);
        } catch (error) {
            console.error("Failed to load users:", error);
            toast.error(
                error instanceof Error ? error.message : "Failed to load users"
            );
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async () => {
        if (!newUsername.trim() || newUserPassword.length < 6) {
            toast.error("Username required and password must be at least 6 characters");
            return;
        }

        setCreatingUser(true);
        try {
            await api.post("/auth/create-user", {
                username: newUsername,
                password: newUserPassword,
                role: newUserRole,
            });
            toast.success("User created successfully");
            setNewUsername("");
            setNewUserPassword("");
            setNewUserRole("user");
            loadUsers();
        } catch (error) {
            console.error("Failed to create user:", error);
            toast.error(
                error instanceof Error ? error.message : "Failed to create user"
            );
        } finally {
            setCreatingUser(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        try {
            await api.delete(`/auth/users/${userId}`);
            toast.success("User deleted successfully");
            setConfirmDelete(null);
            loadUsers();
        } catch (error) {
            console.error("Failed to delete user:", error);
            toast.error(
                error instanceof Error ? error.message : "Failed to delete user"
            );
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    // Only show this section if user is admin
    if (currentUser?.role !== "admin") {
        return null;
    }

    return (
        <section id="user-management" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">
                User Management
            </h2>

            {/* Create User Form */}
            <div className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-white mb-4">
                    Create New User
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        label="Username"
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="Enter username"
                    />
                    <Input
                        label="Password"
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Min 6 characters"
                    />
                </div>
                <div className="mt-4 flex items-end gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium mb-2 text-white">
                            Role
                        </label>
                        <select
                            value={newUserRole}
                            onChange={(e) =>
                                setNewUserRole(e.target.value as "user" | "admin")
                            }
                            className="w-full bg-[#1a1a1a] border border-[#1c1c1c] rounded-md px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                        >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <Button
                        onClick={handleCreateUser}
                        variant="primary"
                        disabled={
                            creatingUser ||
                            !newUsername.trim() ||
                            newUserPassword.length < 6
                        }
                        isLoading={creatingUser}
                    >
                        Create User
                    </Button>
                </div>
            </div>

            {/* Users List */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-[#1c1c1c]">
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                                Username
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                                Role
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                                Created
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="py-8 text-center text-sm text-gray-400"
                                >
                                    Loading users...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="py-8 text-center text-sm text-gray-400"
                                >
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr
                                    key={user.id}
                                    className="border-b border-[#1c1c1c] hover:bg-[#0a0a0a]"
                                >
                                    <td className="py-3 px-4 text-sm text-white">
                                        {user.username}
                                        {currentUser?.id === user.id && (
                                            <span className="ml-2 text-xs text-gray-500">
                                                (You)
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-sm">
                                        <span
                                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                user.role === "admin"
                                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                                    : "bg-[#1a1a1a] text-gray-400 border border-[#1c1c1c]"
                                            }`}
                                        >
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-sm text-gray-400">
                                        {formatDate(user.createdAt)}
                                    </td>
                                    <td className="py-3 px-4 text-sm">
                                        <Button
                                            onClick={() => setConfirmDelete(user.id)}
                                            variant="danger"
                                            disabled={currentUser?.id === user.id}
                                            className="text-xs"
                                        >
                                            <Trash2 className="w-3 h-3 mr-1" />
                                            Delete
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
                <Modal
                    isOpen={true}
                    onClose={() => setConfirmDelete(null)}
                    title="Delete User"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-gray-300">
                            Are you sure you want to delete this user? This action
                            cannot be undone.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button
                                onClick={() => setConfirmDelete(null)}
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => handleDeleteUser(confirmDelete)}
                                variant="danger"
                            >
                                Delete User
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
}
