import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { buildAuthStateFromPayload } from "./authStateMapper";

export default function RegisterPage({
  auth,
  theme,
  api,
  extractError,
  AuthShell,
  Field,
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (auth.user) {
    return <Navigate to="/" replace />;
  }

  if (!auth.registrationEnabled) {
    return <Navigate to="/login" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const { data } = await api.post("/api/auth/register", form);
      if (data?.user) {
        auth.setAuth(buildAuthStateFromPayload(data, { user: data.user }));
        navigate("/");

        return;
      }

      if (data?.registration_pending_approval) {
        setForm({
          name: "",
          email: "",
          password: "",
          password_confirmation: "",
        });
        setNotice(
          data?.message ||
            "Registration submitted. An administrator must approve your account before you can sign in.",
        );

        return;
      }

      setError("Unexpected registration response.");
    } catch (err) {
      setError(extractError(err, "Unable to register."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      theme={theme}
      themeControlPlacement="window-bottom-right"
      title="Create Account"
      subtitle="Your default calendar and address book are generated automatically."
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Name">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
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
        <Field label="Confirm Password">
          <input
            className="input"
            type="password"
            value={form.password_confirmation}
            onChange={(e) =>
              setForm({ ...form, password_confirmation: e.target.value })
            }
            required
          />
        </Field>
        {error ? <p className="text-sm text-app-danger">{error}</p> : null}
        {notice ? <p className="text-sm text-app-accent">{notice}</p> : null}
        <button className="btn w-full" disabled={submitting}>
          {submitting ? "Creating account..." : "Register"}
        </button>
      </form>
      <p className="mt-5 text-sm text-app-muted">
        Already registered?{" "}
        <Link to="/login" className="font-semibold text-app-accent">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
