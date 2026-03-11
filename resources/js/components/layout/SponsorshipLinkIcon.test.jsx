import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SponsorshipLinkIcon from "./SponsorshipLinkIcon";

describe("SponsorshipLinkIcon", () => {
  it("renders favicon image for valid URLs and falls back after load failure", () => {
    const { container } = render(
      <SponsorshipLinkIcon
        name="GitHub Sponsors"
        url="https://www.github.com/sponsors"
      />,
    );

    const image = container.querySelector("img.sponsor-link-icon-img");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute(
      "src",
      "https://icons.duckduckgo.com/ip3/github.com.ico",
    );

    fireEvent.error(image);

    expect(screen.getByText("G")).toBeInTheDocument();
    expect(container.querySelector("img.sponsor-link-icon-img")).toBeNull();
  });

  it("renders fallback label when URL is invalid", () => {
    render(<SponsorshipLinkIcon name="" url="invalid-url" />);

    const fallback = screen.getByText("S");
    expect(fallback).toHaveClass("sponsor-link-icon-fallback");
  });
});
