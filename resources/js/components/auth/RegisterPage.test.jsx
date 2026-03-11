import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterPage from "./RegisterPage";

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
            id: 21,
            role: "user",
          },
          registration_enabled: true,
          owner_share_management_enabled: false,
          dav_compatibility_mode_enabled: false,
          contact_management_enabled: true,
          contact_change_moderation_enabled: false,
          sponsorship: {
            enabled: false,
            links: [],
          },
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
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<RegisterPage {...props} />} />
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route path="/" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RegisterPage", () => {
  it("redirects to login when registration is disabled", () => {
    const props = buildProps({
      auth: {
        user: null,
        registrationEnabled: false,
        setAuth: vi.fn(),
      },
    });

    renderPage(props);

    expect(screen.getByText("Login Screen")).toBeInTheDocument();
  });

  it("submits form, updates auth state, and navigates home", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    renderPage(props);

    await user.type(screen.getByLabelText("Name"), "New User");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(props.api.post).toHaveBeenCalledWith("/api/auth/register", {
        name: "New User",
        email: "new@example.com",
        password: "secret123",
        password_confirmation: "secret123",
      }),
    );
    expect(props.auth.setAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        loading: false,
        user: {
          id: 21,
          role: "user",
        },
        registrationEnabled: true,
        ownerShareManagementEnabled: false,
        davCompatibilityModeEnabled: false,
        contactManagementEnabled: true,
        contactChangeModerationEnabled: false,
        sponsorship: {
          enabled: false,
          links: [],
        },
      }),
    );
    expect(screen.getByText("Dashboard Home")).toBeInTheDocument();
  });

  it("shows extracted error when registration fails", async () => {
    const user = userEvent.setup();
    const err = new Error("validation");
    const props = buildProps({
      api: {
        post: vi.fn().mockRejectedValue(err),
      },
      extractError: vi.fn(() => "Registration failed."),
    });

    renderPage(props);

    await user.type(screen.getByLabelText("Name"), "New User");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("Registration failed.")).toBeInTheDocument();
    expect(props.extractError).toHaveBeenCalledWith(err, "Unable to register.");
    expect(props.auth.setAuth).not.toHaveBeenCalled();
  });
});
