import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./LoginPage";

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
      registrationEnabled: true,
      setAuth: vi.fn(),
    },
    theme: {
      theme: "system",
      setTheme: vi.fn(),
    },
    api: {
      post: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 7,
            role: "admin",
          },
          registration_enabled: true,
          owner_share_management_enabled: true,
          dav_compatibility_mode_enabled: false,
          contact_management_enabled: true,
          contact_change_moderation_enabled: true,
          sponsorship: {
            enabled: true,
            links: [{ name: "GitHub Sponsors", url: "https://example.com" }],
          },
        },
      }),
    },
    extractError: vi.fn((_, fallback) => fallback),
    parseSponsorshipConfig: vi.fn(() => ({
      enabled: true,
      links: [{ name: "GitHub Sponsors", url: "https://example.com" }],
    })),
    AuthShell: AuthShellStub,
    Field: FieldStub,
    ...overrides,
  };
}

function renderPage(props) {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage {...props} />} />
        <Route path="/" element={<div>Dashboard Home</div>} />
        <Route path="/register" element={<div>Register Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("submits credentials, updates auth state, and navigates home", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    renderPage(props);

    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() =>
      expect(props.api.post).toHaveBeenCalledWith("/api/auth/login", {
        email: "admin@example.com",
        password: "secret123",
      }),
    );
    expect(props.parseSponsorshipConfig).toHaveBeenCalledWith({
      enabled: true,
      links: [{ name: "GitHub Sponsors", url: "https://example.com" }],
    });
    expect(props.auth.setAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        loading: false,
        user: {
          id: 7,
          role: "admin",
        },
        registrationEnabled: true,
        ownerShareManagementEnabled: true,
        davCompatibilityModeEnabled: false,
        contactManagementEnabled: true,
        contactChangeModerationEnabled: true,
      }),
    );
    expect(screen.getByText("Dashboard Home")).toBeInTheDocument();
  });

  it("shows extracted error when sign-in fails", async () => {
    const user = userEvent.setup();
    const err = new Error("network");
    const props = buildProps({
      api: {
        post: vi.fn().mockRejectedValue(err),
      },
      extractError: vi.fn(() => "Sign in failed."),
    });

    renderPage(props);

    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Sign in failed.")).toBeInTheDocument();
    expect(props.extractError).toHaveBeenCalledWith(err, "Unable to sign in.");
    expect(props.auth.setAuth).not.toHaveBeenCalled();
  });
});
