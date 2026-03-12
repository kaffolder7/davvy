import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { buildAuthStateFromPayload } from "./authStateMapper";

export default function VerifyEmailPage({
  auth,
  theme,
  api,
  extractError,
  AuthShell,
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState(token ? "verifying" : "error");
  const [message, setMessage] = useState(
    token ? "Verifying your email address..." : "Verification token is missing.",
  );

  if (auth.user) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    const run = async () => {
      try {
        const { data } = await api.post("/api/auth/verify-email", {
          token,
        });

        if (!active) {
          return;
        }

        if (data?.user) {
          auth.setAuth(buildAuthStateFromPayload(data, { user: data.user }));
          navigate("/");
          return;
        }

        setStatus("success");
        setMessage(
          data?.message || "Email verified. You can now sign in to continue.",
        );
      } catch (err) {
        if (!active) {
          return;
        }

        setStatus("error");
        setMessage(
          extractError(err, "Unable to verify this email link. Request a new one."),
        );
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [auth, api, extractError, navigate, token]);

  return (
    <AuthShell
      theme={theme}
      themeControlPlacement="window-bottom-right"
      title="Verify Email"
      subtitle="One moment while we confirm your email address."
    >
      <p
        className={
          status === "error"
            ? "text-sm text-app-danger"
            : "text-sm text-app-muted"
        }
      >
        {message}
      </p>
      <p className="mt-5 text-sm text-app-muted">
        Return to{" "}
        <Link to="/login" className="font-semibold text-app-accent">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
