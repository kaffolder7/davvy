import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { trackFeatureInteraction } from "../../lib/analytics";

/**
 * Renders the Profile Page.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function ProfilePage({
  auth,
  theme,
  api,
  extractError,
  AppShell,
  InfoCard,
  Field,
  copyTextToClipboard,
}) {
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    password: "",
    password_confirmation: "",
  });

  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityError, setSecurityError] = useState("");
  const [securitySuccess, setSecuritySuccess] = useState("");

  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorActionCode, setTwoFactorActionCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [backupCodesCopyState, setBackupCodesCopyState] = useState("idle");
  const backupCodesFieldRef = useRef(null);

  const [appPasswords, setAppPasswords] = useState([]);
  const [appPasswordLoading, setAppPasswordLoading] = useState(false);
  const [appPasswordName, setAppPasswordName] = useState("");
  const [appPasswordCode, setAppPasswordCode] = useState("");
  const [appPasswordPlaintext, setAppPasswordPlaintext] = useState("");

  const graceDeadlineLabel = useMemo(() => {
    if (!auth.twoFactorGraceExpiresAt) {
      return null;
    }

    const parsed = new Date(auth.twoFactorGraceExpiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toLocaleString();
  }, [auth.twoFactorGraceExpiresAt]);
  const backupCodesText = useMemo(() => backupCodes.join("\n"), [backupCodes]);

  useEffect(() => {
    if (backupCodesCopyState === "idle") {
      return undefined;
    }

    const timer = window.setTimeout(() => setBackupCodesCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [backupCodesCopyState]);

  const selectAllBackupCodes = () => {
    if (!backupCodesFieldRef.current) {
      return;
    }

    backupCodesFieldRef.current.focus();
    backupCodesFieldRef.current.select();
  };

  const copyAllBackupCodes = async () => {
    if (!backupCodesText || !copyTextToClipboard) {
      return;
    }

    try {
      await copyTextToClipboard(backupCodesText);
      setBackupCodesCopyState("copied");
    } catch {
      setBackupCodesCopyState("failed");
    }
  };

  const selectAndCopyBackupCodes = async () => {
    selectAllBackupCodes();
    await copyAllBackupCodes();
  };

  const loadAppPasswords = async () => {
    setAppPasswordLoading(true);

    try {
      const { data } = await api.get("/api/auth/app-passwords");
      setAppPasswords(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setSecurityError(
        extractError(err, "Unable to load DAV app passwords right now."),
      );
    } finally {
      setAppPasswordLoading(false);
    }
  };

  useEffect(() => {
    if (!auth.twoFactorEnabled) {
      setAppPasswords([]);
      return;
    }

    loadAppPasswords();
  }, [auth.twoFactorEnabled]);

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordSubmitting(true);
    setPasswordError("");
    setPasswordSuccess("");

    try {
      await api.patch("/api/auth/password", passwordForm);
      setPasswordSuccess(
        "Password updated. Use your new password for app login and DAV clients.",
      );
      setPasswordForm({
        current_password: "",
        password: "",
        password_confirmation: "",
      });
    } catch (err) {
      setPasswordError(extractError(err, "Unable to update password."));
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const startTwoFactorSetup = async () => {
    trackFeatureInteraction("two_factor_auth", "setup_start", {
      surface: "profile",
    });

    setSecurityBusy(true);
    setSecurityError("");
    setSecuritySuccess("");

    try {
      const { data } = await api.post("/api/auth/2fa/setup");
      setTwoFactorSetup(data);
      setBackupCodes([]);
      setSecuritySuccess(
        "Setup initialized. Scan the QR code and enter a verification code.",
      );
    } catch (err) {
      setSecurityError(extractError(err, "Unable to start two-factor setup."));
    } finally {
      setSecurityBusy(false);
    }
  };

  const enableTwoFactor = async (event) => {
    event.preventDefault();
    trackFeatureInteraction("two_factor_auth", "enable_submit", {
      surface: "profile",
    });

    setSecurityBusy(true);
    setSecurityError("");
    setSecuritySuccess("");

    try {
      const { data } = await api.post("/api/auth/2fa/enable", {
        code: twoFactorCode,
      });
      setBackupCodes(Array.isArray(data?.backup_codes) ? data.backup_codes : []);
      setTwoFactorCode("");
      setTwoFactorSetup(null);
      await auth.refreshAuth?.();
      setSecuritySuccess("Two-factor authentication has been enabled.");
    } catch (err) {
      setSecurityError(extractError(err, "Unable to enable two-factor."));
    } finally {
      setSecurityBusy(false);
    }
  };

  const disableTwoFactor = async () => {
    if (
      !window.confirm(
        "Disable two-factor authentication and revoke all DAV app passwords?",
      )
    ) {
      return;
    }

    trackFeatureInteraction("two_factor_auth", "disable_submit", {
      surface: "profile",
    });

    setSecurityBusy(true);
    setSecurityError("");
    setSecuritySuccess("");

    try {
      await api.post("/api/auth/2fa/disable", {
        code: twoFactorActionCode,
      });
      setTwoFactorActionCode("");
      setBackupCodes([]);
      setAppPasswordPlaintext("");
      setAppPasswords([]);
      await auth.refreshAuth?.();
      setSecuritySuccess(
        "Two-factor authentication has been disabled and DAV app passwords were revoked.",
      );
    } catch (err) {
      setSecurityError(extractError(err, "Unable to disable two-factor."));
    } finally {
      setSecurityBusy(false);
    }
  };

  const regenerateBackupCodes = async () => {
    trackFeatureInteraction("two_factor_auth", "backup_codes_regenerate", {
      surface: "profile",
    });

    setSecurityBusy(true);
    setSecurityError("");
    setSecuritySuccess("");

    try {
      const { data } = await api.post("/api/auth/2fa/backup-codes/regenerate", {
        code: twoFactorActionCode,
      });
      setBackupCodes(Array.isArray(data?.backup_codes) ? data.backup_codes : []);
      setTwoFactorActionCode("");
      setSecuritySuccess("Backup codes regenerated.");
    } catch (err) {
      setSecurityError(extractError(err, "Unable to regenerate backup codes."));
    } finally {
      setSecurityBusy(false);
    }
  };

  const createAppPassword = async (event) => {
    event.preventDefault();
    trackFeatureInteraction("dav_app_passwords", "create_submit", {
      surface: "profile",
    });

    setSecurityBusy(true);
    setSecurityError("");
    setSecuritySuccess("");

    try {
      const { data } = await api.post("/api/auth/app-passwords", {
        name: appPasswordName,
        code: appPasswordCode,
      });
      setAppPasswordPlaintext(data?.token || "");
      setAppPasswordName("");
      setAppPasswordCode("");
      await loadAppPasswords();
      setSecuritySuccess("DAV app password created.");
    } catch (err) {
      setSecurityError(extractError(err, "Unable to create DAV app password."));
    } finally {
      setSecurityBusy(false);
    }
  };

  const revokeAppPassword = async (appPasswordId) => {
    trackFeatureInteraction("dav_app_passwords", "revoke_submit", {
      surface: "profile",
    });

    setSecurityBusy(true);
    setSecurityError("");
    setSecuritySuccess("");

    try {
      await api.delete(`/api/auth/app-passwords/${appPasswordId}`, {
        data: {
          code: appPasswordCode,
        },
      });
      await loadAppPasswords();
      setSecuritySuccess("DAV app password revoked.");
    } catch (err) {
      setSecurityError(extractError(err, "Unable to revoke DAV app password."));
    } finally {
      setSecurityBusy(false);
    }
  };

  return (
    <AppShell auth={auth} theme={theme}>
      <section className="fade-up grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Name"
          value={auth.user.name}
          helper="Displayed to other users when sharing resources."
        />
        <InfoCard
          title="Email"
          value={auth.user.email}
          helper="Used for web sign-in and DAV clients."
        />
        <InfoCard
          title="Role"
          value={auth.user.role.toUpperCase()}
          helper="Access level for administrative features."
        />
      </section>

      <section className="surface mt-6 rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-app-strong">Change Password</h2>
        <p className="mt-1 text-sm text-app-muted">
          Change your password for both web access and DAV client connections.
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-3"
          onSubmit={changePassword}
        >
          <Field label="Current password">
            <input
              className="input"
              type="password"
              value={passwordForm.current_password}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  current_password: event.target.value,
                })
              }
              required
            />
          </Field>
          <Field label="New password">
            <input
              className="input"
              type="password"
              value={passwordForm.password}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  password: event.target.value,
                })
              }
              required
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className="input"
              type="password"
              value={passwordForm.password_confirmation}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  password_confirmation: event.target.value,
                })
              }
              required
            />
          </Field>

          {passwordError ? (
            <p className="md:col-span-3 text-sm text-app-danger">{passwordError}</p>
          ) : null}
          {passwordSuccess ? (
            <p className="md:col-span-3 text-sm text-app-accent">{passwordSuccess}</p>
          ) : null}

          <div className="md:col-span-3 flex flex-wrap items-center gap-2">
            <button className="btn" disabled={passwordSubmitting} type="submit">
              {passwordSubmitting ? "Updating password..." : "Update Password"}
            </button>
          </div>
        </form>
      </section>

      <section className="surface mt-6 rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-app-strong">Security</h2>
        <p className="mt-1 text-sm text-app-muted">
          Configure two-factor authentication and manage DAV app passwords.
        </p>

        {auth.twoFactorMandated && !auth.twoFactorEnabled ? (
          <p className="mt-3 rounded-xl border border-app-warning-edge bg-app-warning/10 px-3 py-2 text-sm text-app-warning-text">
            Two-factor enrollment is required by administrators.
            {graceDeadlineLabel
              ? ` Set up 2FA before ${graceDeadlineLabel}.`
              : ""}
          </p>
        ) : null}

        {auth.twoFactorSetupRequired ? (
          <p className="mt-3 rounded-xl border border-app-danger-edge bg-app-danger/10 px-3 py-2 text-sm text-app-danger">
            Your grace period has ended. Complete two-factor setup to continue
            accessing all app features.
          </p>
        ) : null}

        {!auth.twoFactorEnabled ? (
          <div className="mt-4 space-y-4">
            <button
              className="btn-outline btn-outline-sm"
              type="button"
              onClick={startTwoFactorSetup}
              disabled={securityBusy}
            >
              {twoFactorSetup ? "Recreate Setup Secret" : "Start 2FA Setup"}
            </button>

            {twoFactorSetup ? (
              <div className="rounded-2xl border border-app-edge bg-app-surface p-4">
                <p className="text-sm text-app-muted">
                  1. Scan this QR code in Google Authenticator, 1Password, or a
                  compatible authenticator app.
                </p>
                {twoFactorSetup?.otpauth_uri ? (
                  <div className="mt-3 inline-flex rounded-lg border border-app-edge bg-white p-2">
                    <QRCodeSVG
                      value={twoFactorSetup.otpauth_uri}
                      size={176}
                      title="Two-factor setup QR code"
                    />
                  </div>
                ) : null}
                <p className="mt-3 text-sm text-app-muted">
                  2. If needed, enter this key manually:
                </p>
                <code className="mt-1 block break-all rounded-lg border border-app-edge bg-app-panel px-2 py-1 text-sm text-app-strong">
                  {twoFactorSetup.manual_key}
                </code>

                <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={enableTwoFactor}>
                  <Field label="3. Verification code">
                    <input
                      className="input w-44"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value)}
                      autoComplete="one-time-code"
                      required
                    />
                  </Field>
                  <button className="btn" disabled={securityBusy} type="submit">
                    {securityBusy ? "Enabling..." : "Enable 2FA"}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-app-accent">
              Two-factor authentication is enabled.
            </p>
            <Field label="Authenticator or backup code for sensitive actions">
              <input
                className="input max-w-xs"
                value={twoFactorActionCode}
                onChange={(event) => setTwoFactorActionCode(event.target.value)}
                autoComplete="one-time-code"
                placeholder="Enter code"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={regenerateBackupCodes}
                disabled={securityBusy || !twoFactorActionCode}
              >
                Regenerate Backup Codes
              </button>
              <button
                className="btn-outline btn-outline-sm text-app-danger"
                type="button"
                onClick={disableTwoFactor}
                disabled={securityBusy || !twoFactorActionCode}
              >
                Disable 2FA
              </button>
            </div>
          </div>
        )}

        {backupCodes.length > 0 ? (
          <div className="backup-codes-ticket mt-4 rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-app-strong">
                Save these backup codes now.
              </p>
              <span className="backup-codes-ticket-label">Shown once</span>
            </div>
            <p className="mt-1 text-xs text-app-muted">
              Each backup code can be used once. You will not be able to view
              these exact codes again.
            </p>
            <div className="mt-3">
              <textarea
                ref={backupCodesFieldRef}
                className="input backup-codes-ticket-field min-h-36 resize-y font-mono leading-6"
                value={backupCodesText}
                rows={Math.max(4, backupCodes.length)}
                aria-label="Backup codes"
                readOnly
                onFocus={selectAllBackupCodes}
                onClick={selectAllBackupCodes}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={selectAllBackupCodes}
              >
                Select All
              </button>
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={() => void selectAndCopyBackupCodes()}
              >
                Copy All Codes
              </button>
              {backupCodesCopyState === "copied" ? (
                <span className="text-xs font-semibold text-app-accent">
                  Copied all codes.
                </span>
              ) : null}
              {backupCodesCopyState === "failed" ? (
                <span className="text-xs font-semibold text-app-danger">
                  Copy failed. Use Select All, then copy manually.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {auth.twoFactorEnabled ? (
          <div className="mt-6 rounded-2xl border border-app-edge bg-app-surface p-4">
            <h3 className="text-lg font-semibold text-app-strong">
              DAV App Passwords
            </h3>
            <p className="mt-1 text-sm text-app-muted">
              Use these one-time generated passwords for CalDAV/CardDAV clients
              that cannot complete interactive two-factor sign-in.
            </p>

            <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={createAppPassword}>
              <Field label="Password name">
                <input
                  className="input"
                  value={appPasswordName}
                  onChange={(event) => setAppPasswordName(event.target.value)}
                  placeholder="iPhone"
                  required
                />
              </Field>
              <Field label="Authenticator/backup code">
                <input
                  className="input"
                  value={appPasswordCode}
                  onChange={(event) => setAppPasswordCode(event.target.value)}
                  placeholder="Required"
                  required
                />
              </Field>
              <div className="flex items-end">
                <button className="btn" disabled={securityBusy} type="submit">
                  Create App Password
                </button>
              </div>
            </form>

            {appPasswordPlaintext ? (
              <div className="mt-3 rounded-xl border border-app-warning-edge bg-app-warning/10 p-3">
                <p className="text-xs uppercase tracking-wide text-app-faint">
                  Shown once
                </p>
                <code className="mt-1 block break-all text-sm text-app-strong">
                  {appPasswordPlaintext}
                </code>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {appPasswordLoading ? (
                <p className="text-sm text-app-muted">Loading app passwords...</p>
              ) : appPasswords.length === 0 ? (
                <p className="text-sm text-app-muted">No app passwords created.</p>
              ) : (
                appPasswords.map((appPassword) => (
                  <div
                    key={appPassword.id}
                    className="rounded-xl border border-app-edge bg-app-panel p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-app-strong">
                        {appPassword.name}
                      </p>
                      <button
                        className="text-xs font-semibold text-app-danger"
                        type="button"
                        disabled={securityBusy || !appPasswordCode}
                        onClick={() => revokeAppPassword(appPassword.id)}
                      >
                        Revoke
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-app-faint">
                      Prefix: {appPassword.token_prefix}
                    </p>
                    <p className="mt-1 text-xs text-app-faint">
                      Last used: {appPassword.last_used_at || "Never"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {securityError ? (
          <p className="mt-3 text-sm text-app-danger">{securityError}</p>
        ) : null}
        {securitySuccess ? (
          <p className="mt-3 text-sm text-app-accent">{securitySuccess}</p>
        ) : null}
      </section>
    </AppShell>
  );
}
