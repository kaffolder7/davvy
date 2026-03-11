import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InfoCard from "./InfoCard";

describe("InfoCard", () => {
  it("renders non-copyable value and helper text", () => {
    render(
      <InfoCard
        title="Role"
        value="ADMIN"
        helper="Admins can manage users."
        copyTextToClipboard={vi.fn()}
      />,
    );

    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByText("Admins can manage users.")).toBeInTheDocument();
  });

  it("copies value for copyable cards and shows success state", async () => {
    const user = userEvent.setup();
    const copyTextToClipboard = vi.fn().mockResolvedValue(undefined);

    render(
      <InfoCard
        title="DAV Endpoint"
        value="https://example.test/dav"
        helper="Use this URL."
        copyable
        copyTextToClipboard={copyTextToClipboard}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy DAV Endpoint" }));

    expect(copyTextToClipboard).toHaveBeenCalledWith("https://example.test/dav");
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("shows failed copy state when clipboard write fails", async () => {
    const user = userEvent.setup();

    render(
      <InfoCard
        title="DAV Endpoint"
        value="https://example.test/dav"
        helper="Use this URL."
        copyable
        copyTextToClipboard={vi.fn().mockRejectedValue(new Error("copy failed"))}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy DAV Endpoint" }));
    expect(screen.getByText("Copy failed")).toBeInTheDocument();
  });
});
