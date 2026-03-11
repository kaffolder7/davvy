import React, { useMemo, useState } from "react";

function sponsorshipFaviconUrl(targetUrl) {
  try {
    const host = new URL(targetUrl).hostname.replace(/^www\./i, "");
    return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : "";
  } catch {
    return "";
  }
}

export default function SponsorshipLinkIcon({ name, url }) {
  const [iconFailed, setIconFailed] = useState(false);
  const faviconUrl = useMemo(() => sponsorshipFaviconUrl(url), [url]);
  const fallbackLabel =
    String(name ?? "")
      .trim()
      .slice(0, 1)
      .toUpperCase() || "S";

  if (!faviconUrl || iconFailed) {
    return (
      <span className="sponsor-link-icon-fallback" aria-hidden="true">
        {fallbackLabel}
      </span>
    );
  }

  return (
    <img
      className="sponsor-link-icon-img"
      src={faviconUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setIconFailed(true)}
    />
  );
}
