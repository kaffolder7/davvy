import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditorWorkSection from "./ContactEditorWorkSection";

function FieldStub({ label, children }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function buildProps(overrides = {}) {
  return {
    isOpen: true,
    onToggle: vi.fn(),
    form: {
      company: "",
      phonetic_company: "",
      job_title: "",
      department: "",
    },
    Field: FieldStub,
    isOptionalFieldVisible: vi.fn((id) => id === "department"),
    updateFormField: vi.fn(),
    ...overrides,
  };
}

describe("ContactEditorWorkSection", () => {
  it("toggles section and updates work fields", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<ContactEditorWorkSection {...props} />);

    await user.click(screen.getByRole("button", { name: /work/i }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText("Company"), "A");
    expect(props.updateFormField).toHaveBeenCalledWith("company", "A");
    expect(screen.getByLabelText("Department")).toBeInTheDocument();
  });

  it("hides fields when section is closed", () => {
    const props = buildProps({ isOpen: false });

    render(<ContactEditorWorkSection {...props} />);

    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();
  });
});
