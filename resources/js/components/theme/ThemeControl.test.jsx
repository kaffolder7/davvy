import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeControl from "./ThemeControl";

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

describe("ThemeControl", () => {
  it("cycles dark theme to system when system is already light", async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    mockSystemTheme(false);

    render(<ThemeControl theme="dark" setTheme={setTheme} className="extra" />);

    const button = screen.getByRole("button", {
      name: "Switch to light theme",
    });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("theme-control-toggle-dark");
    expect(button.parentElement).toHaveClass("theme-control");
    expect(button.parentElement).toHaveClass("extra");

    await user.click(button);
    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("toggles system/light to dark when system is light", async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    mockSystemTheme(false);

    render(<ThemeControl theme="system" setTheme={setTheme} />);

    const button = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).not.toHaveClass("theme-control-toggle-dark");

    await user.click(button);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
