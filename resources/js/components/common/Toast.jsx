import React from "react";

export default function Toast({ status = "status", message = "" }) {
  const normalizedStatus = String(status || "").toLowerCase();
  const toneClass =
    normalizedStatus === "failed"
      ? "text-app-danger"
      : normalizedStatus === "success"
        ? "text-app-accent"
        : "text-app-faint";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-30 w-[min(92vw,28rem)] rounded-xl border border-app-edge bg-app-surface px-3 py-2 shadow-2xl"
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${toneClass}`}>
        {String(status || "status").toUpperCase()}
      </p>
      <p className="mt-1 text-sm text-app-strong">{String(message || "")}</p>
    </div>
  );
}
