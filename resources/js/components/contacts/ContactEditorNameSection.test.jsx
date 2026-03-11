import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditorNameSection from "./ContactEditorNameSection";

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
      prefix: "",
      first_name: "",
      middle_name: "",
      last_name: "",
      suffix: "",
      nickname: "",
      maiden_name: "",
      phonetic_first_name: "",
      phonetic_last_name: "",
    },
    Field: FieldStub,
    isOptionalFieldVisible: vi.fn((id) => id === "prefix" || id === "nickname"),
    updateFormField: vi.fn(),
    ...overrides,
  };
}

describe("ContactEditorNameSection", () => {
  it("toggles the section and updates name fields", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<ContactEditorNameSection {...props} />);

    await user.click(screen.getByRole("button", { name: /name/i }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);

    expect(screen.getByLabelText("Prefix")).toBeInTheDocument();
    expect(screen.getByLabelText("Nickname")).toBeInTheDocument();

    await user.type(screen.getByLabelText("First Name"), "A");
    expect(props.updateFormField).toHaveBeenCalledWith("first_name", "A");
  });

  it("renders only the header when closed", () => {
    const props = buildProps({ isOpen: false });

    render(<ContactEditorNameSection {...props} />);

    expect(screen.getByRole("button", { name: /name/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("First Name")).not.toBeInTheDocument();
  });
});
