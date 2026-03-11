import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useThemePreference from "./useThemePreference";

function createMatchMedia({ isDark = false } = {}) {
  const listeners = new Set();
  const media = {
    matches: isDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn((event, callback) => {
      if (event === "change") {
        listeners.add(callback);
      }
    }),
    removeEventListener: vi.fn((event, callback) => {
      if (event === "change") {
        listeners.delete(callback);
      }
    }),
    addListener: vi.fn((callback) => listeners.add(callback)),
    removeListener: vi.fn((callback) => listeners.delete(callback)),
    dispatch(nextIsDark) {
      media.matches = nextIsDark;
      const event = { matches: nextIsDark, media: media.media };
      for (const callback of listeners) {
        callback(event);
      }
    },
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => media),
  });

  return media;
}

function resetThemeDom() {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.style.colorScheme = "";
  delete root.dataset.theme;
}

describe("useThemePreference", () => {
  beforeEach(() => {
    resetThemeDom();
    window.localStorage.clear();
  });

  it("loads and applies persisted dark theme", async () => {
    window.localStorage.setItem("davvy-theme", "dark");
    createMatchMedia({ isDark: false });

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.theme).toBe("dark");
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("dark"),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("normalizes invalid stored theme to system and follows system changes", async () => {
    window.localStorage.setItem("davvy-theme", "purple");
    const media = createMatchMedia({ isDark: false });

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.theme).toBe("system");
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("light"),
    );
    await waitFor(() => expect(window.localStorage.getItem("davvy-theme")).toBeNull());

    act(() => {
      media.dispatch(true);
    });

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("dark"),
    );
  });

  it("persists explicit theme and clears storage when switching back to system", async () => {
    createMatchMedia({ isDark: false });

    const { result } = renderHook(() => useThemePreference());

    act(() => {
      result.current.setTheme("dark");
    });

    await waitFor(() =>
      expect(window.localStorage.getItem("davvy-theme")).toBe("dark"),
    );
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("dark"),
    );

    act(() => {
      result.current.setTheme("system");
    });

    await waitFor(() => expect(window.localStorage.getItem("davvy-theme")).toBeNull());
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("light"),
    );
  });
});
