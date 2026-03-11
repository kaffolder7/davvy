import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "davvy-theme";
const VALID_THEMES = new Set(["system", "light", "dark"]);

export function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function normalizeTheme(value) {
  return VALID_THEMES.has(value) ? value : "system";
}

export function resolveTheme(theme) {
  return theme === "system" ? getSystemTheme() : theme;
}

export function applyTheme(theme) {
  if (typeof document === "undefined") {
    return;
  }

  const resolved = resolveTheme(theme);
  const root = document.documentElement;

  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export default function useThemePreference() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") {
      return "system";
    }

    try {
      return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    applyTheme(theme);

    if (
      typeof window === "undefined" ||
      theme !== "system" ||
      !window.matchMedia
    ) {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => applyTheme("system");

    if (media.addEventListener) {
      media.addEventListener("change", syncTheme);
      return () => media.removeEventListener("change", syncTheme);
    }

    media.addListener(syncTheme);
    return () => media.removeListener(syncTheme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (theme === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [theme]);

  return { theme, setTheme };
}
