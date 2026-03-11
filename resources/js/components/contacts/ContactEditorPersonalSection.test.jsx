import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditorPersonalSection from "./ContactEditorPersonalSection";

function FieldStub({ label, children }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function DateEditorStub({ setRows }) {
  return (
    <button type="button" onClick={() => setRows([{ value: "anniversary" }])}>
      DateEditor
    </button>
  );
}

function RelatedNameEditorStub({ setRows }) {
  return (
    <button
      type="button"
      onClick={() => setRows([{ value: "Partner", label: "spouse" }])}
    >
      RelatedNameEditor
    </button>
  );
}

function buildProps(overrides = {}) {
  return {
    isOpen: true,
    onToggle: vi.fn(),
    form: {
      pronouns: "",
      pronouns_custom: "",
      ringtone: "",
      text_tone: "",
      verification_code: "",
      profile: "",
      head_of_household: false,
      birthday: { month: "", day: "", year: "" },
      dates: [],
      related_names: [],
      exclude_milestone_calendars: false,
    },
    Field: FieldStub,
    isOptionalFieldVisible: vi.fn(
      (id) => id === "pronouns_custom" || id === "dates",
    ),
    updateFormField: vi.fn(),
    PRONOUN_OPTIONS: [
      { value: "", label: "None" },
      { value: "custom", label: "Custom" },
    ],
    showOptionalField: vi.fn(),
    updateBirthdayField: vi.fn(),
    DateEditor: DateEditorStub,
    labelOptions: { dates: [], related_names: [] },
    RelatedNameEditor: RelatedNameEditorStub,
    relatedNameOptions: [],
    setForm: vi.fn(),
    ...overrides,
  };
}

describe("ContactEditorPersonalSection", () => {
  it("wires personal-section controls and nested editors", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<ContactEditorPersonalSection {...props} />);

    await user.click(screen.getByRole("button", { name: /personal/i }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText("Pronouns"), "custom");
    expect(props.updateFormField).toHaveBeenCalledWith("pronouns", "custom");
    expect(props.showOptionalField).toHaveBeenCalledWith("pronouns_custom");

    await user.type(screen.getByLabelText("Month"), "1");
    expect(props.updateBirthdayField).toHaveBeenCalledWith("month", "1");

    await user.click(screen.getByRole("checkbox", { name: "Head of Household" }));
    expect(props.updateFormField).toHaveBeenCalledWith("head_of_household", true);

    await user.click(
      screen.getByRole("checkbox", { name: "Exclude From Milestone Calendars" }),
    );
    expect(props.updateFormField).toHaveBeenCalledWith(
      "exclude_milestone_calendars",
      true,
    );

    await user.click(screen.getByRole("button", { name: "DateEditor" }));
    expect(props.updateFormField).toHaveBeenCalledWith("dates", [
      { value: "anniversary" },
    ]);

    await user.click(screen.getByRole("button", { name: "RelatedNameEditor" }));
    expect(props.setForm).toHaveBeenCalledTimes(1);

    const setFormUpdater = props.setForm.mock.calls[0][0];
    const updated = setFormUpdater({ related_names: [] });
    expect(updated.related_names).toEqual([{ value: "Partner", label: "spouse" }]);
  });

  it("renders collapsed section without body", () => {
    const props = buildProps({ isOpen: false });

    render(<ContactEditorPersonalSection {...props} />);

    expect(screen.queryByLabelText("Pronouns")).not.toBeInTheDocument();
  });
});
