import React from "react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import ProtectedRoute from "./ProtectedRoute";

function renderRoute({ path = "/private", auth, adminOnly = false } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/private"
          element={
            <ProtectedRoute auth={auth} adminOnly={adminOnly}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route path="/" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects unauthenticated users to login", () => {
    renderRoute({
      auth: {
        user: null,
      },
    });

    expect(screen.getByText("Login Screen")).toBeInTheDocument();
  });

  it("redirects non-admin users away from admin-only routes", () => {
    renderRoute({
      auth: {
        user: {
          id: 2,
          role: "user",
        },
      },
      adminOnly: true,
    });

    expect(screen.getByText("Dashboard Home")).toBeInTheDocument();
  });

  it("renders children when access requirements are met", () => {
    renderRoute({
      auth: {
        user: {
          id: 1,
          role: "admin",
        },
      },
      adminOnly: true,
    });

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });
});
