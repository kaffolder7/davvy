import React from "react";

export default function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-app-base">
        {label}
      </span>
      {children}
    </label>
  );
}
