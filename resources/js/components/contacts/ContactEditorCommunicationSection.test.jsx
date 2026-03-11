import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditorCommunicationSection from "./ContactEditorCommunicationSection";

function LabeledValueEditorStub({ title, setRows }) {
  return (
    <button type="button" onClick={() => setRows([{ value: `${title}-row` }])}>
      {title}
    </button>
  );
}

function AddressEditorStub({ setRows }) {
  return (
    <button type="button" onClick={() => setRows([{ street: "123 Main" }])}>
      Address
    </button>
  );
}

function buildProps(overrides = {}) {
  return {
    isOpen: true,
    onToggle: vi.fn(),
    form: {
      phones: [],
      emails: [],
      addresses: [],
      urls: [],
      instant_messages: [],
    },
    updateFormField: vi.fn(),
    labelOptions: {
      phones: [],
      emails: [],
      addresses: [],
      urls: [],
      instant_messages: [],
    },
    isOptionalFieldVisible: vi.fn((id) => id === "instant_messages"),
    LabeledValueEditor: LabeledValueEditorStub,
    AddressEditor: AddressEditorStub,
    ...overrides,
  };
}

describe("ContactEditorCommunicationSection", () => {
  it("renders editors and routes row updates", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<ContactEditorCommunicationSection {...props} />);

    await user.click(screen.getByRole("button", { name: /communication/i }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Phone" }));
    await user.click(screen.getByRole("button", { name: "Address" }));
    await user.click(screen.getByRole("button", { name: "Instant Message" }));

    expect(props.updateFormField).toHaveBeenCalledWith("phones", [
      { value: "Phone-row" },
    ]);
    expect(props.updateFormField).toHaveBeenCalledWith("addresses", [
      { street: "123 Main" },
    ]);
    expect(props.updateFormField).toHaveBeenCalledWith("instant_messages", [
      { value: "Instant Message-row" },
    ]);
  });

  it("renders collapsed state without body", () => {
    const props = buildProps({ isOpen: false });

    render(<ContactEditorCommunicationSection {...props} />);

    expect(screen.queryByRole("button", { name: "Phone" })).not.toBeInTheDocument();
  });
});
