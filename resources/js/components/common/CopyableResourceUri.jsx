import React, { useEffect, useState } from "react";

/**
 * Renders the Copyable Resource Uri component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function CopyableResourceUri({
  resourceKind,
  principalId,
  resourceUri,
  buildDavCollectionUrl,
  copyTextToClipboard,
}) {
  const [copyState, setCopyState] = useState("idle");
  const normalizedUri = String(resourceUri ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const fullUrl = buildDavCollectionUrl(resourceKind, principalId, normalizedUri);

  useEffect(() => {
    if (copyState === "idle") {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copyUrl = async () => {
    try {
      await copyTextToClipboard(fullUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const copyLabel =
    copyState === "copied"
      ? "Copied URL"
      : copyState === "failed"
        ? "Copy failed"
        : "";
  const copyTone = copyState === "failed" ? "bg-red-700" : "bg-teal-700";

  return (
    <div className="relative mt-1">
      <button
        type="button"
        onClick={() => void copyUrl()}
        className="break-all bg-transparent p-0 text-left text-xs font-normal text-app-faint focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-teal-500"
        title={fullUrl}
        aria-label={`Copy ${normalizedUri || "resource"} URL`}
      >
        /{normalizedUri}
      </button>
      <span
        className={`pointer-events-none absolute left-0 top-full mt-1 rounded-md px-2 py-0.5 text-[10px] font-semibold text-white transition-opacity duration-150 ${
          copyState === "idle" ? "opacity-0" : "opacity-100"
        } ${copyTone}`}
      >
        {copyLabel}
      </span>
    </div>
  );
}
