import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import FullPageState from "./FullPageState";

describe("FullPageState", () => {
  it("renders default full-page layout", () => {
    render(<FullPageState label="Loading..." />);

    const label = screen.getByText("Loading...");
    expect(label).toHaveClass(
      "flex",
      "min-h-screen",
      "items-center",
      "justify-center",
      "text-lg",
      "font-semibold",
      "text-app-base",
    );
  });

  it("renders compact layout", () => {
    render(<FullPageState label="Loading compact" compact />);

    const label = screen.getByText("Loading compact");
    expect(label).toHaveClass("mt-4", "text-sm", "font-semibold", "text-app-muted");
  });
});
