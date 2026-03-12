import React from "react";

/**
 * Renders the Full Page State component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function FullPageState({ label, compact = false }) {
  return (
    <div
      className={
        compact
          ? "mt-4 text-sm font-semibold text-app-muted"
          : "flex min-h-screen items-center justify-center text-lg font-semibold text-app-base"
      }
    >
      {label}
    </div>
  );
}
