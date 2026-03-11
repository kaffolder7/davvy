import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  PencilIcon,
  ResetIcon,
  TimesIcon,
} from "./AppIcons";

describe("AppIcons", () => {
  it("renders all icons with shared SVG attributes", () => {
    const icons = [
      DownloadIcon,
      PencilIcon,
      CheckIcon,
      TimesIcon,
      ResetIcon,
      ChevronRightIcon,
    ];

    for (const Icon of icons) {
      const { container, unmount } = render(<Icon className="h-4 w-4" />);
      const svg = container.querySelector("svg");

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass("h-4", "w-4");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      expect(svg).toHaveAttribute("stroke", "currentColor");

      unmount();
    }
  });
});
