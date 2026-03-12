import React from "react";

/**
 * Renders the Admin Feature Toggle component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function AdminFeatureToggle({ label, enabled, onClick }) {
  return (
    <button
      className={`btn-outline inline-flex items-center gap-1.5 rounded-lg !px-2.5 !py-1.5 !text-sm ${
        enabled
          ? "border-app-accent-edge bg-app-surface text-app-strong ring-1 ring-teal-500/25 hover:border-app-accent-edge"
          : "border-app-edge bg-app-surface text-app-muted hover:border-app-edge"
      }`}
      type="button"
      aria-pressed={enabled}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${
          enabled
            ? "bg-teal-500 shadow-[0_0_0_2px_rgba(20,184,166,0.2)]"
            : "bg-zinc-400"
        }`}
      />
      <span className="whitespace-nowrap text-sm">{label}</span>
      <span
        className={`rounded-full border px-1.5 py-0.5 text-[9px] leading-[12px] font-semibold uppercase tracking-wide ${
          enabled
            ? "border-app-accent-edge text-app-accent"
            : "border-app-edge text-app-faint"
        }`}
      >
        {enabled ? "On" : "Off"}
      </span>
    </button>
  );
}
