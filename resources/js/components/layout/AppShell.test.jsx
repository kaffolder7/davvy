import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import AppShell from "./AppShell";

function ThemeControlStub({ theme, setTheme, className = "" }) {
  return (
    <button
      type="button"
      className={className}
      data-testid="theme-control"
      onClick={() => setTheme("light")}
    >
      {theme}
    </button>
  );
}

function SponsorshipLinkIconStub({ name }) {
  return <span data-testid={`sponsor-icon-${name}`}>{name}</span>;
}

function PathProbe() {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
}

function createAuth(overrides = {}) {
  return {
    user: {
      id: 1,
      name: "Admin User",
      email: "admin@example.com",
      role: "admin",
    },
    contactManagementEnabled: true,
    contactChangeModerationEnabled: true,
    sponsorship: {
      enabled: false,
      links: [],
    },
    setAuth: vi.fn(),
    ...overrides,
  };
}

function createTheme(overrides = {}) {
  return {
    theme: "system",
    setTheme: vi.fn(),
    ...overrides,
  };
}

function renderShell({
  path = "/",
  auth = createAuth(),
  theme = createTheme(),
  api = {
    get: vi.fn().mockResolvedValue({ data: { needs_review_count: 0 } }),
    post: vi.fn().mockResolvedValue({}),
  },
} = {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PathProbe />
      <AppShell
        auth={auth}
        theme={theme}
        api={api}
        ThemeControl={ThemeControlStub}
        SponsorshipLinkIcon={SponsorshipLinkIconStub}
      >
        <div>Page Content</div>
      </AppShell>
    </MemoryRouter>,
  );

  return {
    user: userEvent.setup(),
    auth,
    theme,
    api,
  };
}

describe("AppShell", () => {
  it("shows review queue badge from summary endpoint when moderation is enabled", async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { needs_review_count: 12 } }),
      post: vi.fn().mockResolvedValue({}),
    };

    renderShell({ api });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/api/contact-change-requests/summary"),
    );
    expect(screen.getByRole("link", { name: /review queue/i })).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("logs out and navigates to login", async () => {
    const { user, api, auth } = renderShell({ path: "/profile" });

    await user.click(screen.getByRole("button", { name: "Sign Out" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/auth/logout"));
    expect(auth.setAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("path")).toHaveTextContent("/login");

    const updater = auth.setAuth.mock.calls[0][0];
    expect(typeof updater).toBe("function");
    expect(
      updater({ loading: true, user: { id: 1, email: "admin@example.com" } }),
    ).toEqual(
      expect.objectContaining({
        loading: false,
        user: null,
      }),
    );
  });

  it("opens and closes sponsor modal", async () => {
    const { user } = renderShell({
      auth: createAuth({
        sponsorship: {
          enabled: true,
          links: [{ name: "GitHub Sponsors", url: "https://example.com/sponsor" }],
        },
      }),
    });

    await user.click(screen.getByRole("button", { name: "Sponsor" }));
    expect(screen.getByText("Support Davvy")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /github sponsors/i }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText("Support Davvy")).not.toBeInTheDocument(),
    );
  });
});
