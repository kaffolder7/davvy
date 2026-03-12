import React from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({
  auth,
  adminOnly = false,
  children,
}) {
  const location = useLocation();

  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  if (
    auth.twoFactorSetupRequired &&
    !location.pathname.startsWith("/profile")
  ) {
    return <Navigate to="/profile" replace />;
  }

  if (adminOnly && auth.user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
