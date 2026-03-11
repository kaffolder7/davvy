import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PermissionBadge from "./PermissionBadge";

describe("PermissionBadge", () => {
  it("renders admin badge", () => {
    render(<PermissionBadge permission="admin" />);

    const badge = screen.getByText("Admin");
    expect(badge).toHaveClass("pill", "pill-admin");
  });

  it("renders editor badge", () => {
    render(<PermissionBadge permission="editor" />);

    const badge = screen.getByText("Editor");
    expect(badge).toHaveClass("pill", "pill-editor");
  });

  it("falls back to general badge", () => {
    render(<PermissionBadge permission="anything-else" />);

    const badge = screen.getByText("General");
    expect(badge).toHaveClass("pill", "pill-read");
  });
});
