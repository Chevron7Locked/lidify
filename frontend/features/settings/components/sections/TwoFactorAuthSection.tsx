import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useTwoFactor } from "../../hooks/useTwoFactor";

export function TwoFactorAuthSection() {
  const {
    twoFactorEnabled,
    settingUpTwoFactor,
    twoFactorQR,
    twoFactorSecret,
    recoveryCodes,
    showRecoveryCodes,
    load2FAStatus,
    setup2FA,
    enable2FA,
    disable2FA,
    cancel2FASetup,
    closeRecoveryCodes,
  } = useTwoFactor();

  const [token, setToken] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [showDisableFlow, setShowDisableFlow] = useState(false);

  useEffect(() => {
    load2FAStatus();
  }, [load2FAStatus]);

  const handleVerifySetup = async () => {
    await enable2FA(token);
    setToken("");
  };

  const handleDisable = async () => {
    await disable2FA(disablePassword, disableToken);
    setDisablePassword("");
    setDisableToken("");
    setShowDisableFlow(false);
  };

  const handleCancelSetup = () => {
    cancel2FASetup();
    setToken("");
  };

  const handleCancelDisable = () => {
    setShowDisableFlow(false);
    setDisablePassword("");
    setDisableToken("");
  };

  const handleCopyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
  };

  const handleDownloadRecoveryCodes = () => {
    const blob = new Blob([recoveryCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lidify-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section id="two-factor" className="bg-[#111] rounded-lg p-6 scroll-mt-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Two-Factor Authentication
            </h2>
            <p className="text-sm text-gray-400">
              Add an extra layer of security to your account
            </p>
          </div>

          {!settingUpTwoFactor && !showDisableFlow && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Status:</span>
                {twoFactorEnabled ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
                    Disabled
                  </span>
                )}
              </div>

              {twoFactorEnabled ? (
                <Button
                  variant="danger"
                  onClick={() => setShowDisableFlow(true)}
                >
                  Disable Two-Factor Authentication
                </Button>
              ) : (
                <Button onClick={setup2FA}>
                  Enable Two-Factor Authentication
                </Button>
              )}
            </div>
          )}

          {settingUpTwoFactor && (
            <div className="space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <p className="text-sm text-blue-300">
                  Scan the QR code with your authenticator app (such as Google
                  Authenticator, Authy, or 1Password), then enter the 6-digit
                  code to verify and enable two-factor authentication.
                </p>
              </div>

              {twoFactorQR && (
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg border border-[#1c1c1c]">
                    <img
                      src={twoFactorQR}
                      alt="Two-Factor Authentication QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                </div>
              )}

              {twoFactorSecret && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white">
                    Manual Entry Code
                  </label>
                  <div className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-lg p-3">
                    <code className="text-sm text-white font-mono">
                      {twoFactorSecret}
                    </code>
                  </div>
                  <p className="text-xs text-gray-400">
                    If you can't scan the QR code, enter this code manually in
                    your authenticator app.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="setup-token"
                  className="block text-sm font-medium text-white"
                >
                  Verification Code
                </label>
                <Input
                  id="setup-token"
                  type="text"
                  inputMode="numeric"
                  value={token}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    if (value.length <= 6) {
                      setToken(value);
                    }
                  }}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleVerifySetup}
                  disabled={token.length !== 6}
                >
                  Verify and Enable
                </Button>
                <Button variant="secondary" onClick={handleCancelSetup}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {showDisableFlow && (
            <div className="space-y-6">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-sm text-yellow-300">
                  To disable two-factor authentication, please enter your
                  password and a current verification code from your
                  authenticator app.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="disable-password"
                    className="block text-sm font-medium text-white"
                  >
                    Password
                  </label>
                  <Input
                    id="disable-password"
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="disable-token"
                    className="block text-sm font-medium text-white"
                  >
                    Verification Code
                  </label>
                  <Input
                    id="disable-token"
                    type="text"
                    inputMode="numeric"
                    value={disableToken}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "");
                      if (value.length <= 6) {
                        setDisableToken(value);
                      }
                    }}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="danger"
                  onClick={handleDisable}
                  disabled={!disablePassword || disableToken.length !== 6}
                >
                  Confirm Disable
                </Button>
                <Button variant="secondary" onClick={handleCancelDisable}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <Modal
        isOpen={showRecoveryCodes}
        onClose={closeRecoveryCodes}
        title="Recovery Codes"
      >
        <div className="space-y-6">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-300 font-medium">
              Important: Store these recovery codes in a safe place
            </p>
            <p className="text-sm text-red-400 mt-1">
              You'll need them to recover access to your account if you lose
              your authenticator device. Each code can only be used once.
            </p>
          </div>

          <div className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-lg p-4">
            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((code, index) => (
                <div
                  key={index}
                  className="font-mono text-sm text-white bg-[#111] px-3 py-2 rounded border border-[#1c1c1c]"
                >
                  {code}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleCopyRecoveryCodes}>
              Copy All
            </Button>
            <Button variant="secondary" onClick={handleDownloadRecoveryCodes}>
              Download
            </Button>
          </div>

          <Button onClick={closeRecoveryCodes} className="w-full">
            I've Saved My Codes
          </Button>
        </div>
      </Modal>
    </>
  );
}
