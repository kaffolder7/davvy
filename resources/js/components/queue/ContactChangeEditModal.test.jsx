import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactChangeEditModal from "./ContactChangeEditModal";

describe("ContactChangeEditModal", () => {
  it("renders nothing when row is null", () => {
    const { container } = render(
      <ContactChangeEditModal
        row={null}
        payloadText="{}"
        onPayloadTextChange={vi.fn()}
        addressBookIdsText="[]"
        onAddressBookIdsTextChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        submitting={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders modal content and routes field/button handlers", async () => {
    const user = userEvent.setup();
    const onPayloadTextChange = vi.fn();
    const onAddressBookIdsTextChange = vi.fn();
    const onCancel = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ContactChangeEditModal
        row={{ id: 99 }}
        payloadText='{"name":"Alex"}'
        onPayloadTextChange={onPayloadTextChange}
        addressBookIdsText="[1]"
        onAddressBookIdsTextChange={onAddressBookIdsTextChange}
        onCancel={onCancel}
        onSubmit={onSubmit}
        submitting={false}
      />,
    );

    expect(screen.getByText("Edit Request #99 Before Approve")).toBeInTheDocument();

    const payloadInput = screen.getByLabelText("Resolved Payload JSON");
    const addressIdsInput = screen.getByLabelText(
      "Resolved Address Book IDs JSON Array",
    );

    fireEvent.change(payloadInput, { target: { value: '{"name":"Jamie"}' } });
    fireEvent.change(addressIdsInput, { target: { value: "[2,3]" } });

    expect(onPayloadTextChange).toHaveBeenCalledWith('{"name":"Jamie"}');
    expect(onAddressBookIdsTextChange).toHaveBeenCalledWith("[2,3]");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Save Edits & Approve" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables actions and updates submit text while submitting", () => {
    render(
      <ContactChangeEditModal
        row={{ id: 101 }}
        payloadText="{}"
        onPayloadTextChange={vi.fn()}
        addressBookIdsText="[]"
        onAddressBookIdsTextChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        submitting
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approving..." })).toBeDisabled();
  });
});
