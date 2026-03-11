import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({
  auth,
  adminOnly = false,
  children,
}) {
  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && auth.user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
