import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditorAddressBooksSection from "./ContactEditorAddressBooksSection";

function buildProps(overrides = {}) {
  return {
    isOpen: true,
    onToggle: vi.fn(),
    selectedAddressBookCount: 1,
    addressBooks: [
      {
        id: 1,
        display_name: "Personal",
        uri: "personal",
        scope: "owned",
        owner_name: "",
      },
      {
        id: 2,
        display_name: "Family",
        uri: "family",
        scope: "shared",
        owner_name: "Owner",
      },
    ],
    form: {
      address_book_ids: [1],
    },
    toggleAssignedAddressBook: vi.fn(),
    ...overrides,
  };
}

describe("ContactEditorAddressBooksSection", () => {
  it("toggles section and updates assigned address books", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<ContactEditorAddressBooksSection {...props} />);

    await user.click(screen.getByRole("button", { name: /address books/i }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);

    expect(screen.getByText("1 selected")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);

    expect(props.toggleAssignedAddressBook).toHaveBeenCalledWith(2, true);
  });

  it("shows empty-state message when no books are available", () => {
    const props = buildProps({
      addressBooks: [],
      form: { address_book_ids: [] },
      selectedAddressBookCount: 0,
    });

    render(<ContactEditorAddressBooksSection {...props} />);

    expect(screen.getByText("No writable address books.")).toBeInTheDocument();
  });
});
