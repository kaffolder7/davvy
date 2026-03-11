import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthShell from "./AuthShell";

function mockSystemTheme(isDark = false) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: isDark,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

function buildTheme(overrides = {}) {
  return {
    theme: "system",
    setTheme: vi.fn(),
    ...overrides,
  };
}

describe("AuthShell", () => {
  it("renders inline theme control by default", async () => {
    const user = userEvent.setup();
    const theme = buildTheme();
    mockSystemTheme(false);

    const { container } = render(
      <AuthShell
        theme={theme}
        title="Welcome"
        subtitle="Sign in to continue."
      >
        <button type="button">Submit</button>
      </AuthShell>,
    );

    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByText("Sign in to continue.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(container.querySelector(".theme-control-inline")).not.toBeNull();
    expect(container.querySelector(".theme-control-window-bottom-right")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(theme.setTheme).toHaveBeenCalledWith("dark");
  });

  it("renders window-bottom-right theme control when requested", async () => {
    const user = userEvent.setup();
    const theme = buildTheme({ theme: "dark" });
    mockSystemTheme(false);

    const { container } = render(
      <AuthShell
        theme={theme}
        title="Create Account"
        subtitle="Get started."
        themeControlPlacement="window-bottom-right"
      >
        <div>Form</div>
      </AuthShell>,
    );

    expect(container.querySelector(".theme-control-inline")).toBeNull();
    expect(container.querySelector(".theme-control-window-bottom-right")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(theme.setTheme).toHaveBeenCalledWith("system");
  });
});
