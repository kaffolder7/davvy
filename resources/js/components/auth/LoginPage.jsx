import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

export default function LoginPage({
  auth,
  theme,
  api,
  extractError,
  parseSponsorshipConfig,
  AuthShell,
  Field,
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (auth.user) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const { data } = await api.post("/api/auth/login", form);
      auth.setAuth({
        loading: false,
        user: data.user,
        registrationEnabled: !!data.registration_enabled,
        ownerShareManagementEnabled: !!data.owner_share_management_enabled,
        davCompatibilityModeEnabled: !!data.dav_compatibility_mode_enabled,
        contactManagementEnabled: !!data.contact_management_enabled,
        contactChangeModerationEnabled:
          !!data.contact_change_moderation_enabled,
        sponsorship: parseSponsorshipConfig(data.sponsorship),
      });
      navigate("/");
    } catch (err) {
      setError(extractError(err, "Unable to sign in."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      theme={theme}
      themeControlPlacement="window-bottom-right"
      title="Welcome Back"
      subtitle="Sign in to manage your CalDAV and CardDAV resources."
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </Field>
        {error ? <p className="text-sm text-app-danger">{error}</p> : null}
        <button className="btn w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p className="mt-5 text-sm text-app-muted">
        Need an account?{" "}
        {auth.registrationEnabled ? (
          <Link to="/register" className="font-semibold text-app-accent">
            Register here
          </Link>
        ) : (
          "Public sign-up is disabled by administrators."
        )}
      </p>
    </AuthShell>
  );
}
