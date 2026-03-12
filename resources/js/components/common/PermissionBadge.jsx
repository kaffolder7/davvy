import React from "react";

/**
 * Renders the Permission Badge component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function PermissionBadge({ permission }) {
  if (permission === "admin") {
    return <span className="pill pill-admin">Admin</span>;
  }

  if (permission === "editor") {
    return <span className="pill pill-editor">Editor</span>;
  }

  return <span className="pill pill-read">General</span>;
}
