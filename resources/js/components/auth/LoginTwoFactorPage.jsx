import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { buildAuthStateFromPayload } from "./authStateMapper";

export default function LoginTwoFactorPage({
  auth,
  theme,
  api,
  extractError,
  AuthShell,
  Field,
}) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const checkChallenge = async () => {
      try {
        const { data } = await api.get("/api/auth/login/2fa/status");
        if (!active) {
          return;
        }

        if (!data?.required) {
          navigate("/login", { replace: true });
          return;
        }

        setLoading(false);
      } catch {
        if (!active) {
          return;
        }

        navigate("/login", { replace: true });
      }
    };

    checkChallenge();

    return () => {
      active = false;
    };
  }, [api, navigate]);

  if (auth.user) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const { data } = await api.post("/api/auth/login/2fa", { code });
      auth.setAuth(buildAuthStateFromPayload(data, { user: data.user }));
      navigate("/", { replace: true });
    } catch (err) {
      setError(extractError(err, "Unable to verify authentication code."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      theme={theme}
      themeControlPlacement="window-bottom-right"
      title="Two-Factor Verification"
      subtitle="Enter your 6-digit authenticator code or a backup code."
    >
      {loading ? (
        <p className="text-sm text-app-muted">Checking sign-in challenge...</p>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Authenticator or backup code">
            <input
              className="input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </Field>
          {error ? <p className="text-sm text-app-danger">{error}</p> : null}
          <button className="btn w-full" disabled={submitting}>
            {submitting ? "Verifying..." : "Verify & Sign In"}
          </button>
        </form>
      )}

      <p className="mt-5 text-sm text-app-muted">
        Need to use different credentials?{" "}
        <Link to="/login" className="font-semibold text-app-accent">
          Return to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
