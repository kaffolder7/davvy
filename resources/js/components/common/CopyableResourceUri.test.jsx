import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CopyableResourceUri from "./CopyableResourceUri";

describe("CopyableResourceUri", () => {
  it("copies the full URL and shows success state", async () => {
    const user = userEvent.setup();
    const buildDavCollectionUrl = vi
      .fn()
      .mockReturnValue("https://example.test/dav/addressbooks/5/work");
    const copyTextToClipboard = vi.fn().mockResolvedValue(undefined);

    render(
      <CopyableResourceUri
        resourceKind="address-book"
        principalId={5}
        resourceUri="/work/"
        buildDavCollectionUrl={buildDavCollectionUrl}
        copyTextToClipboard={copyTextToClipboard}
      />,
    );

    const button = screen.getByRole("button", { name: "Copy work URL" });
    expect(button).toHaveTextContent("/work");

    await user.click(button);

    expect(buildDavCollectionUrl).toHaveBeenCalledWith("address-book", 5, "work");
    expect(copyTextToClipboard).toHaveBeenCalledWith(
      "https://example.test/dav/addressbooks/5/work",
    );
    expect(screen.getByText("Copied URL")).toBeInTheDocument();
  });

  it("shows failed copy state", async () => {
    const user = userEvent.setup();

    render(
      <CopyableResourceUri
        resourceKind="address-book"
        principalId={5}
        resourceUri="work"
        buildDavCollectionUrl={() => "https://example.test/dav/addressbooks/5/work"}
        copyTextToClipboard={vi.fn().mockRejectedValue(new Error("copy failed"))}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy work URL" }));
    expect(screen.getByText("Copy failed")).toBeInTheDocument();
  });
});
