import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import VerifyEmailPage from "./VerifyEmailPage";

function AuthShellStub({ title, subtitle, children }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </section>
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
            id: 5,
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
    ...overrides,
  };
}

function renderPage(props, initialEntry = "/verify-email?token=verify-token") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage {...props} />} />
        <Route path="/" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VerifyEmailPage", () => {
  it("verifies token and signs user in", async () => {
    const props = buildProps();

    renderPage(props);

    await waitFor(() =>
      expect(props.api.post).toHaveBeenCalledWith("/api/auth/verify-email", {
        token: "verify-token",
      }),
    );

    await waitFor(() =>
      expect(props.auth.setAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          loading: false,
          user: { id: 5, role: "regular" },
        }),
      ),
    );
    expect(await screen.findByText("Dashboard Home")).toBeInTheDocument();
  });

  it("renders a malformed-link message when token is missing", () => {
    const props = buildProps();

    renderPage(props, "/verify-email");

    expect(screen.getByText("Verification token is missing.")).toBeInTheDocument();
    expect(props.api.post).not.toHaveBeenCalled();
  });
});
