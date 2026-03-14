import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditorOptionalFieldsSection from "./ContactEditorOptionalFieldsSection";

function buildProps(overrides = {}) {
  return {
    hiddenOptionalFields: [{ id: "nickname", label: "Nickname" }],
    fieldSearchTerm: "",
    setFieldSearchTerm: vi.fn(),
    fieldPickerOpen: true,
    setFieldPickerOpen: vi.fn(),
    addSelectedOptionalField: vi.fn(),
    filteredHiddenOptionalFields: [{ id: "nickname", label: "Nickname" }],
    fieldToAdd: "nickname",
    setFieldToAdd: vi.fn(),
    visibleOptionalFields: ["nickname"],
    hideOptionalField: vi.fn(),
    OPTIONAL_CONTACT_FIELDS: [{ id: "nickname", label: "Nickname" }],
    ...overrides,
  };
}

describe("ContactEditorOptionalFieldsSection", () => {
  it("handles optional-field search and add/hide interactions", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<ContactEditorOptionalFieldsSection {...props} />);

    const input = screen.getByPlaceholderText("Search optional fields...");
    await user.click(input);
    await user.type(input, "n");

    expect(
      document.getElementById("optional-field-combobox-list"),
    ).toHaveClass("z-30");
    expect(props.setFieldPickerOpen).toHaveBeenCalledWith(true);
    expect(props.setFieldSearchTerm).toHaveBeenCalledWith("n");

    fireEvent.mouseDown(screen.getByRole("button", { name: "Nickname" }));
    expect(props.setFieldToAdd).toHaveBeenCalledWith("nickname");
    expect(props.setFieldSearchTerm).toHaveBeenCalledWith("Nickname");

    await user.click(screen.getByRole("button", { name: "Add Field" }));
    expect(props.addSelectedOptionalField).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Hide Nickname" }));
    expect(props.hideOptionalField).toHaveBeenCalledWith("nickname");
  });

  it("shows empty optional-fields state", () => {
    const props = buildProps({
      visibleOptionalFields: [],
      hiddenOptionalFields: [],
      fieldPickerOpen: false,
      filteredHiddenOptionalFields: [],
      fieldToAdd: "",
    });

    render(<ContactEditorOptionalFieldsSection {...props} />);

    expect(screen.getByText("Optional fields are hidden by default.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("All optional fields added")).toBeDisabled();
  });
});
