import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InviteAcceptPage from "./InviteAcceptPage";

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
    theme: {
      theme: "system",
      setTheme: vi.fn(),
    },
    api: {
      post: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 44,
            role: "regular",
          },
          registration_enabled: true,
          registration_approval_required: false,
          email_verification_required: true,
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

function renderPage(props, initialEntry = "/invite?token=invite-token") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/invite" element={<InviteAcceptPage {...props} />} />
        <Route path="/" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InviteAcceptPage", () => {
  it("submits token/password and signs in invited user", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    renderPage(props);

    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.type(screen.getByLabelText("Confirm Password"), "Password123!");
    await user.click(
      screen.getByRole("button", { name: "Set Password & Sign In" }),
    );

    await waitFor(() =>
      expect(props.api.post).toHaveBeenCalledWith("/api/auth/invite/accept", {
        token: "invite-token",
        password: "Password123!",
        password_confirmation: "Password123!",
      }),
    );

    expect(props.auth.setAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        loading: false,
        user: { id: 44, role: "regular" },
      }),
    );
    expect(screen.getByText("Dashboard Home")).toBeInTheDocument();
  });

  it("shows token missing error when invite link is malformed", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    renderPage(props, "/invite");

    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.type(screen.getByLabelText("Confirm Password"), "Password123!");
    await user.click(
      screen.getByRole("button", { name: "Set Password & Sign In" }),
    );

    expect(await screen.findByText("Invitation token is missing.")).toBeInTheDocument();
    expect(props.api.post).not.toHaveBeenCalled();
  });
});
