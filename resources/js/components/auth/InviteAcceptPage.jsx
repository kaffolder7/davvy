import React, { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { buildAuthStateFromPayload } from "./authStateMapper";

export default function InviteAcceptPage({
  auth,
  theme,
  api,
  extractError,
  AuthShell,
  Field,
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [form, setForm] = useState({
    password: "",
    password_confirmation: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (auth.user) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    if (!token) {
      setSubmitting(false);
      setError("Invitation token is missing.");
      return;
    }

    try {
      const { data } = await api.post("/api/auth/invite/accept", {
        token,
        ...form,
      });

      if (data?.user) {
        auth.setAuth(buildAuthStateFromPayload(data, { user: data.user }));
        navigate("/");
        return;
      }

      if (data?.registration_pending_approval) {
        setNotice(
          data?.message ||
            "Invitation accepted. An administrator must approve your account before you can sign in.",
        );
        return;
      }

      setError("Unexpected invitation response.");
    } catch (err) {
      setError(extractError(err, "Unable to accept invitation."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      theme={theme}
      themeControlPlacement="window-bottom-right"
      title="Activate Account"
      subtitle="Set a password to complete your invitation."
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            required
          />
        </Field>
        <Field label="Confirm Password">
          <input
            className="input"
            type="password"
            value={form.password_confirmation}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                password_confirmation: event.target.value,
              }))
            }
            required
          />
        </Field>
        {error ? <p className="text-sm text-app-danger">{error}</p> : null}
        {notice ? <p className="text-sm text-app-accent">{notice}</p> : null}
        <button className="btn w-full" disabled={submitting}>
          {submitting ? "Activating account..." : "Set Password & Sign In"}
        </button>
      </form>
      <p className="mt-5 text-sm text-app-muted">
        Already activated?{" "}
        <Link to="/login" className="font-semibold text-app-accent">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
