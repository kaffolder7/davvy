import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminFeatureToggle from "./AdminFeatureToggle";

describe("AdminFeatureToggle", () => {
  it("renders enabled state and handles clicks", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <AdminFeatureToggle label="Feature A" enabled onClick={onClick} />,
    );

    const button = screen.getByRole("button", { name: /feature a/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("On")).toBeInTheDocument();

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled state label", () => {
    render(<AdminFeatureToggle label="Feature B" enabled={false} onClick={() => {}} />);

    expect(screen.getByRole("button", { name: /feature b/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("Off")).toBeInTheDocument();
  });
});
