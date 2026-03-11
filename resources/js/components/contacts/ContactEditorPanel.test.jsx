import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditorPanel from "./ContactEditorPanel";

function FieldStub({ label, children }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function noopComponent(name) {
  return function StubComponent() {
    return <div>{name}</div>;
  };
}

function buildProps(overrides = {}) {
  return {
    form: {
      id: null,
      address_book_ids: [1],
      related_names: [],
    },
    submitting: false,
    addressBooks: [
      {
        id: 1,
        display_name: "Personal",
        uri: "personal",
        scope: "owned",
        owner_name: "",
      },
    ],
    selectedAddressBookCount: 1,
    hasRequiredContactIdentity: true,
    saveContact: vi.fn((event) => event.preventDefault()),
    removeContact: vi.fn(),
    openSections: {
      name: false,
      work: false,
      personal: false,
      communication: false,
      addressBooks: true,
    },
    toggleSection: vi.fn(),
    isOptionalFieldVisible: vi.fn(() => false),
    Field: FieldStub,
    updateFormField: vi.fn(),
    PRONOUN_OPTIONS: [{ value: "", label: "None" }],
    showOptionalField: vi.fn(),
    updateBirthdayField: vi.fn(),
    DateEditor: noopComponent("DateEditor"),
    LabeledValueEditor: noopComponent("LabeledValueEditor"),
    AddressEditor: noopComponent("AddressEditor"),
    RelatedNameEditor: noopComponent("RelatedNameEditor"),
    labelOptions: {
      phones: [],
      emails: [],
      urls: [],
      addresses: [],
      dates: [],
      related_names: [],
      instant_messages: [],
    },
    relatedNameOptions: [],
    setForm: vi.fn(),
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
    toggleAssignedAddressBook: vi.fn(),
    ...overrides,
  };
}

describe("ContactEditorPanel", () => {
  it("submits contact form and wires delete/address-book actions", async () => {
    const user = userEvent.setup();
    const props = buildProps({
      form: {
        id: 44,
        address_book_ids: [1],
        related_names: [],
      },
    });

    render(<ContactEditorPanel {...props} />);

    const saveButtons = screen.getAllByRole("button", { name: "Save Contact" });
    expect(saveButtons.length).toBe(2);

    await user.click(saveButtons[0]);
    expect(props.saveContact).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(props.removeContact).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("checkbox"));
    expect(props.toggleAssignedAddressBook).toHaveBeenCalledWith(1, false);
  });

  it("handles section toggle and optional field picker interactions", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<ContactEditorPanel {...props} />);

    await user.click(screen.getByText("Name").closest("button"));
    expect(props.toggleSection).toHaveBeenCalledWith("name");

    const optionalFieldInput = screen.getByPlaceholderText("Search optional fields...");
    await user.click(optionalFieldInput);
    await user.type(optionalFieldInput, "n");

    expect(props.setFieldPickerOpen).toHaveBeenCalledWith(true);
    expect(props.setFieldSearchTerm).toHaveBeenCalledWith("n");

    fireEvent.mouseDown(screen.getByRole("button", { name: "Nickname" }));
    expect(props.setFieldToAdd).toHaveBeenCalledWith("nickname");
    expect(props.setFieldSearchTerm).toHaveBeenCalledWith("Nickname");
    expect(props.setFieldPickerOpen).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Add Field" }));
    expect(props.addSelectedOptionalField).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Hide Nickname" }));
    expect(props.hideOptionalField).toHaveBeenCalledWith("nickname");
  });
});
