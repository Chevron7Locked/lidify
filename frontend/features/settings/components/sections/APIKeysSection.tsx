import React, { useEffect, useState } from 'react';
import { useAPIKeys } from '@/features/settings/hooks/useAPIKeys';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Copy, Trash2 } from 'lucide-react';

export const APIKeysSection: React.FC = () => {
  const {
    apiKeys,
    loadingApiKeys,
    generatedApiKey,
    showCreateApiKeyDialog,
    setShowCreateApiKeyDialog,
    loadApiKeys,
    createApiKey,
    revokeApiKey,
    clearGeneratedKey,
  } = useAPIKeys();

  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const handleCreateApiKey = async () => {
    if (!newApiKeyName.trim()) return;

    setCreating(true);
    try {
      await createApiKey(newApiKeyName);
      setNewApiKeyName('');
      setShowCreateApiKeyDialog(false);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyKey = () => {
    if (generatedApiKey) {
      navigator.clipboard.writeText(generatedApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDismissKey = () => {
    clearGeneratedKey();
    setCopied(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <section id="api-keys" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white mb-2">API Keys</h2>
          <p className="text-sm text-gray-400">
            Manage API keys for programmatic access to your account
          </p>
        </div>

      {/* Generated Key Display */}
      {generatedApiKey && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-200 mb-2">
                Your new API key
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedApiKey}
                  className="flex-1 bg-black/50 border border-yellow-700/50 rounded px-3 py-2 text-sm text-white font-mono"
                />
                <Button
                  onClick={handleCopyKey}
                  variant="secondary"
                  className="shrink-0"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-yellow-200 mt-2">
                Save this key now, you won't be able to see it again
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleDismissKey}
              variant="ghost"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Create Button */}
      <div>
        <Button
          onClick={() => setShowCreateApiKeyDialog(true)}
          variant="primary"
        >
          Generate New API Key
        </Button>
      </div>

      {/* API Keys Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1c1c1c]">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                Device Name
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                Key Preview
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                Created
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                Last Used
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loadingApiKeys ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                  Loading API keys...
                </td>
              </tr>
            ) : apiKeys.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                  No API keys yet
                </td>
              </tr>
            ) : (
              apiKeys.map((key) => (
                <tr
                  key={key.id}
                  className="border-b border-[#1c1c1c] hover:bg-[#0a0a0a]"
                >
                  <td className="py-3 px-4 text-sm text-white">
                    {key.name}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400 font-mono">
                    {key.keyPreview}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400">
                    {formatDate(key.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400">
                    {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <Button
                      onClick={() => setConfirmRevoke(key.id)}
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create API Key Dialog */}
      {showCreateApiKeyDialog && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowCreateApiKeyDialog(false);
            setNewApiKeyName('');
          }}
          title="Generate New API Key"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Device Name
              </label>
              <input
                type="text"
                value={newApiKeyName}
                onChange={(e) => setNewApiKeyName(e.target.value)}
                placeholder="e.g., My Laptop, Production Server"
                className="w-full bg-[#0a0a0a] border border-[#1c1c1c] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowCreateApiKeyDialog(false);
                  setNewApiKeyName('');
                }}
                variant="ghost"
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateApiKey}
                variant="primary"
                disabled={!newApiKeyName.trim() || creating}
              >
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Revoke Confirmation Modal */}
      {confirmRevoke && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmRevoke(null)}
          title="Revoke API Key"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Are you sure you want to revoke this API key? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setConfirmRevoke(null)}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  revokeApiKey(confirmRevoke);
                  setConfirmRevoke(null);
                }}
                variant="primary"
                className="bg-red-600 hover:bg-red-700"
              >
                Revoke
              </Button>
            </div>
          </div>
        </Modal>
      )}
      </div>
    </section>
  );
};
