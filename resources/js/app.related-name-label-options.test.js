import { describe, expect, it } from "vitest";
import { buildRelatedNameLabelOptions } from "./app.jsx";

describe("buildRelatedNameLabelOptions", () => {
  it("adds derived family labels from existing contacts", () => {
    const options = buildRelatedNameLabelOptions([
      {
        related_names: [
          { label: "father_in_law" },
          { label: "grandpa" },
          { label: "spouse" },
        ],
      },
    ]);

    const labelsByValue = Object.fromEntries(
      options.map((option) => [option.value, option.label]),
    );

    expect(labelsByValue.father_in_law).toBe("Father-in-Law");
    expect(labelsByValue.grandpa).toBe("Grandpa");
    expect(options.filter((option) => option.value === "spouse")).toHaveLength(
      1,
    );
  });

  it("removes saved custom labels when equivalent derived labels are present", () => {
    const options = buildRelatedNameLabelOptions(
      [
        {
          related_names: [{ label: "grandpa" }],
        },
      ],
      ["Grandpa"],
    );

    expect(
      options.some((option) => option.saved_custom_key === "grandpa"),
    ).toBe(false);
    expect(options.filter((option) => option.value === "grandpa")).toHaveLength(
      1,
    );
  });
});
