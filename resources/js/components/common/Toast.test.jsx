import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Toast from "./Toast";

describe("Toast", () => {
  it("renders status and message", () => {
    render(<Toast status="success" message="Saved successfully." />);

    expect(screen.getByText("SUCCESS")).toBeInTheDocument();
    expect(screen.getByText("Saved successfully.")).toBeInTheDocument();
  });

  it("applies failed tone styling", () => {
    render(<Toast status="failed" message="Request failed." />);

    expect(screen.getByText("FAILED")).toHaveClass("text-app-danger");
  });
});
