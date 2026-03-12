import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginTwoFactorPage from "./LoginTwoFactorPage";

function AuthShellStub({ title, subtitle, children }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </section>
  );
}

function FieldStub({ label, children }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function buildProps(overrides = {}) {
  return {
    auth: {
      user: null,
      setAuth: vi.fn(),
    },
    theme: {},
    api: {
      get: vi.fn().mockResolvedValue({ data: { required: true } }),
      post: vi.fn().mockResolvedValue({
        data: {
          user: { id: 7, role: "admin" },
          registration_enabled: true,
          owner_share_management_enabled: true,
          dav_compatibility_mode_enabled: false,
          contact_management_enabled: true,
          contact_change_moderation_enabled: true,
          two_factor_enabled: true,
          two_factor_setup_required: false,
          two_factor_mandated: false,
          two_factor_enforcement_enabled: false,
          two_factor_grace_period_days: 14,
          two_factor_grace_expires_at: null,
          sponsorship: { enabled: false, links: [] },
        },
      }),
    },
    extractError: vi.fn((_, fallback) => fallback),
    AuthShell: AuthShellStub,
    Field: FieldStub,
    ...overrides,
  };
}

function renderPage(props) {
  render(
    <MemoryRouter initialEntries={["/login/2fa"]}>
      <Routes>
        <Route path="/login/2fa" element={<LoginTwoFactorPage {...props} />} />
        <Route path="/" element={<div>Dashboard Home</div>} />
        <Route path="/login" element={<div>Login Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginTwoFactorPage", () => {
  it("verifies challenge and signs in", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    renderPage(props);

    await waitFor(() =>
      expect(props.api.get).toHaveBeenCalledWith("/api/auth/login/2fa/status"),
    );

    await user.type(
      screen.getByLabelText("Authenticator or backup code"),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: "Verify & Sign In" }));

    await waitFor(() =>
      expect(props.api.post).toHaveBeenCalledWith("/api/auth/login/2fa", {
        code: "123456",
      }),
    );

    expect(props.auth.setAuth).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Dashboard Home")).toBeInTheDocument();
  });

  it("redirects to login when challenge is missing", async () => {
    const props = buildProps({
      api: {
        get: vi.fn().mockResolvedValue({ data: { required: false } }),
        post: vi.fn(),
      },
    });

    renderPage(props);

    expect(await screen.findByText("Login Screen")).toBeInTheDocument();
  });
});
