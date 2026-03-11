import { describe, expect, it } from "vitest";
import {
  EMAIL_LABEL_OPTIONS,
  buildLabelOptions,
  buildRelatedNameLabelOptions,
  buildSavedCustomLabelsByField,
  resolveLabelSelectValue,
} from "./contactLabelUtils";

describe("contactLabelUtils", () => {
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

  it("collects sorted unique custom labels by contact field", () => {
    const labelsByField = buildSavedCustomLabelsByField([
      {
        emails: [
          { label: "custom", custom_label: "Zeta Team" },
          { label: "custom", custom_label: "  alpha  team  " },
          { label: "custom", custom_label: "Alpha Team" },
          { label: "work", custom_label: "Ignored built-in" },
        ],
        phones: [
          { label: "custom", custom_label: "Pager Duty" },
          { label: "custom", custom_label: "mobile" },
        ],
      },
    ]);

    expect(labelsByField.emails).toEqual(["alpha team", "Zeta Team"]);
    expect(labelsByField.phones).toEqual(["Pager Duty"]);
  });

  it("builds label options with saved custom values before custom action", () => {
    const options = buildLabelOptions(EMAIL_LABEL_OPTIONS, ["Team Inbox"]);
    expect(options.map((option) => option.value)).toEqual([
      "home",
      "work",
      "other",
      "saved-custom:team inbox",
      "custom",
    ]);
  });

  it("resolves select values for saved custom and fallback rows", () => {
    const options = buildLabelOptions(EMAIL_LABEL_OPTIONS, ["Team Inbox"]);

    expect(
      resolveLabelSelectValue(
        { label: "custom", custom_label: "team inbox" },
        options,
      ),
    ).toBe("saved-custom:team inbox");

    expect(resolveLabelSelectValue({ label: "x-unknown" }, options, "other")).toBe(
      "other",
    );
  });
});
