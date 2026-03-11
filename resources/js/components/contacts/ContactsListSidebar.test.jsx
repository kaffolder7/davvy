import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactsListSidebar from "./ContactsListSidebar";

const CONTACTS = [
  {
    id: 11,
    display_name: "Alice Smith",
    address_books: [{ id: 1 }],
  },
  {
    id: 12,
    display_name: "Bob Jones",
    address_books: [{ id: 1 }, { id: 2 }],
  },
];

const ADDRESS_BOOKS = [
  { id: 1, display_name: "Personal" },
  { id: 2, display_name: "Family" },
];

function buildProps(overrides = {}) {
  return {
    contacts: CONTACTS,
    filteredContacts: CONTACTS,
    paginatedContacts: CONTACTS,
    addressBooks: ADDRESS_BOOKS,
    contactSearchTerm: "",
    onContactSearchTermChange: vi.fn(),
    contactAddressBookFilter: "all",
    onContactAddressBookFilterChange: vi.fn(),
    selectedContactId: 12,
    onSelectContact: vi.fn(),
    onStartNewContact: vi.fn(),
    hasContactFilters: true,
    onClearFilters: vi.fn(),
    contactsPageSize: 1,
    firstContactIndex: 1,
    lastContactIndex: 2,
    currentContactPage: 2,
    totalContactPages: 3,
    setContactsPage: vi.fn(),
    ...overrides,
  };
}

describe("ContactsListSidebar", () => {
  it("wires list/filter toolbar interactions and pagination callbacks", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<ContactsListSidebar {...props} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    expect(props.onStartNewContact).toHaveBeenCalledTimes(1);

    await user.type(screen.getByPlaceholderText("Search contacts..."), "a");
    expect(props.onContactSearchTermChange).toHaveBeenCalledWith("a");

    await user.selectOptions(
      screen.getByRole("combobox"),
      screen.getByRole("option", { name: "Family" }),
    );
    expect(props.onContactAddressBookFilterChange).toHaveBeenCalledWith("2");

    await user.click(screen.getByRole("button", { name: /Alice Smith/i }));
    expect(props.onSelectContact).toHaveBeenCalledWith(CONTACTS[0]);

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(props.onClearFilters).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Prev" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    const prevUpdater = props.setContactsPage.mock.calls[0][0];
    const nextUpdater = props.setContactsPage.mock.calls[1][0];
    expect(prevUpdater(2)).toBe(1);
    expect(nextUpdater(2)).toBe(3);
  });

  it("shows empty states when no contacts are available", () => {
    const props = buildProps({
      contacts: [],
      filteredContacts: [],
      paginatedContacts: [],
      hasContactFilters: false,
      contactsPageSize: 20,
      firstContactIndex: 0,
      lastContactIndex: 0,
      currentContactPage: 1,
      totalContactPages: 1,
    });

    render(<ContactsListSidebar {...props} />);

    expect(screen.getByText("No contacts yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
