import React from "react";
import { getSystemTheme, resolveTheme } from "./useThemePreference";

/**
 * Renders the Theme Control component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function ThemeControl({ theme, setTheme, className = "" }) {
  const resolvedTheme = resolveTheme(theme);
  const isDark = resolvedTheme === "dark";
  const systemTheme = getSystemTheme();
  const targetTheme = isDark ? "light" : "dark";
  const nextTheme = targetTheme === systemTheme ? "system" : targetTheme;
  const toggleLabel = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <div className={`theme-control ${className}`.trim()}>
      <button
        type="button"
        className={`theme-control-toggle ${isDark ? "theme-control-toggle-dark" : ""}`.trim()}
        onClick={() => setTheme(nextTheme)}
        aria-pressed={isDark}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {isDark ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
            className="theme-control-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
            className="theme-control-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
          </svg>
        )}
      </button>
    </div>
  );
}
