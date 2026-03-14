import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import ContactsPage from "./ContactsPage";

function AppShellStub({ children }) {
  return <div>{children}</div>;
}

function InfoCardStub({ title, value }) {
  return (
    <p>
      {title}:{value}
    </p>
  );
}

function FullPageStateStub({ label }) {
  return <p>{label}</p>;
}

function ContactsListSidebarStub({
  contacts,
  onStartNewContact,
  onSelectContact,
}) {
  return (
    <div>
      <p>Sidebar contacts: {contacts.length}</p>
      <button type="button" onClick={onStartNewContact}>
        Stub New Contact
      </button>
      <button type="button" onClick={() => onSelectContact(contacts[0])}>
        Stub Select Contact
      </button>
    </div>
  );
}

function ContactEditorPanelStub({ saveContact }) {
  return (
    <button type="button" onClick={() => saveContact({ preventDefault() {} })}>
      Trigger Save
    </button>
  );
}

function ContactEditorHideFieldModalStub() {
  return null;
}

function noopComponent() {
  return null;
}

function FieldStub({ children }) {
  return <div>{children}</div>;
}

function PathProbe() {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

function createEmptyContactForm(addressBookIds = []) {
  return {
    id: null,
    first_name: "",
    last_name: "",
    company: "",
    birthday: { month: "", day: "", year: "" },
    dates: [],
    related_names: [],
    phones: [],
    emails: [],
    urls: [],
    addresses: [],
    instant_messages: [],
    pronouns: "",
    pronouns_custom: "",
    address_book_ids: addressBookIds,
  };
}

function buildProps(overrides = {}) {
  const baseApi = {
    get: vi.fn().mockResolvedValue({
      data: {
        contacts: [
          {
            id: 7,
            display_name: "Alex Doe",
            first_name: "Alex",
            address_book_ids: [3],
          },
        ],
        address_books: [{ id: 3, display_name: "Personal", uri: "personal" }],
      },
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  };

  const auth = {
    user: {
      id: 1,
      name: "Owner",
    },
    refreshAuth: vi.fn().mockResolvedValue(undefined),
  };

  return {
    auth,
    theme: {},
    api: baseApi,
    extractError: vi.fn((_, fallback) => fallback),
    createEmptyContactForm,
    OPTIONAL_CONTACT_FIELDS: [{ id: "nickname", label: "Nickname" }],
    createContactSectionOpenState: () => ({
      name: false,
      work: false,
      personal: false,
      communication: false,
      addressBooks: true,
    }),
    normalizePositiveInt: (value) => {
      const normalized = Number(value);
      return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
    },
    buildSavedCustomLabelsByField: () => ({
      phones: [],
      emails: [],
      urls: [],
      addresses: [],
      dates: [],
      related_names: [],
      instant_messages: [],
    }),
    buildLabelOptions: (baseOptions) => baseOptions,
    PHONE_LABEL_OPTIONS: [],
    EMAIL_LABEL_OPTIONS: [],
    URL_LABEL_OPTIONS: [],
    ADDRESS_LABEL_OPTIONS: [],
    DATE_LABEL_OPTIONS: [],
    buildRelatedNameLabelOptions: () => [],
    IM_LABEL_OPTIONS: [],
    CONTACTS_PAGE_SIZE: 20,
    hasTextValue: (value) => String(value ?? "").trim() !== "",
    deriveOptionalFieldVisibility: () => [],
    deriveContactSectionOpenState: () => ({
      name: false,
      work: false,
      personal: false,
      communication: false,
      addressBooks: true,
    }),
    hydrateContactForm: (contact, fallbackIds = []) => {
      if (!contact) {
        return createEmptyContactForm(fallbackIds);
      }

      return {
        ...createEmptyContactForm(contact.address_book_ids ?? fallbackIds),
        id: contact.id,
        first_name: contact.first_name ?? "",
        last_name: contact.last_name ?? "",
        company: contact.company ?? "",
      };
    },
    normalizeDatePartInput: (_, value) => value,
    normalizeDatePartsForPayload: (value) => value,
    normalizeDateRowsForPayload: (value) => value,
    optionalFieldHasValue: () => false,
    clearOptionalFieldValue: (form) => form,
    PRONOUN_OPTIONS: [{ value: "", label: "None" }],
    AppShell: AppShellStub,
    InfoCard: InfoCardStub,
    FullPageState: FullPageStateStub,
    ContactsListSidebar: ContactsListSidebarStub,
    ContactEditorPanel: ContactEditorPanelStub,
    ContactEditorHideFieldModal: ContactEditorHideFieldModalStub,
    DateEditor: noopComponent,
    LabeledValueEditor: noopComponent,
    AddressEditor: noopComponent,
    RelatedNameEditor: noopComponent,
    Field: FieldStub,
    ...overrides,
  };
}

describe("ContactsPage", () => {
  it("loads contacts and renders summary + sidebar content", async () => {
    const props = buildProps();

    render(
      <MemoryRouter>
        <ContactsPage {...props} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Loading contacts...")).toBeInTheDocument();

    await waitFor(() =>
      expect(props.api.get).toHaveBeenCalledWith("/api/contacts"),
    );

    expect(screen.getByText("Contacts:1")).toBeInTheDocument();
    expect(screen.getByText("Writable Books:1")).toBeInTheDocument();
    expect(screen.getByText("User:Owner")).toBeInTheDocument();
    expect(screen.getByText("Sidebar contacts: 1")).toBeInTheDocument();
  });

  it("shows validation error when saving without required identity", async () => {
    const user = userEvent.setup();
    const props = buildProps({
      api: {
        get: vi.fn().mockResolvedValue({
          data: {
            contacts: [],
            address_books: [{ id: 3, display_name: "Personal", uri: "personal" }],
          },
        }),
        post: vi.fn().mockResolvedValue({ data: {} }),
        patch: vi.fn().mockResolvedValue({ data: {} }),
        delete: vi.fn().mockResolvedValue({ data: {} }),
      },
    });

    render(
      <MemoryRouter>
        <ContactsPage {...props} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(props.api.get).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Trigger Save" }));

    expect(
      screen.getByText("Enter at least a First Name, Last Name, or Company."),
    ).toBeInTheDocument();
    expect(props.api.post).not.toHaveBeenCalled();
    expect(props.api.patch).not.toHaveBeenCalled();
  });

  it("supports switching mobile panels and auto-opens editor from sidebar actions", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(
      <MemoryRouter>
        <ContactsPage {...props} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(props.api.get).toHaveBeenCalledTimes(1));

    const contactsTab = screen.getByRole("tab", { name: "Contacts" });
    expect(contactsTab).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Stub New Contact" }));
    expect(screen.getByRole("tab", { name: "New/Edit" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(contactsTab);
    expect(contactsTab).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Stub Select Contact" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  });

  it("refreshes auth and redirects when contact management is disabled", async () => {
    const props = buildProps({
      api: {
        get: vi.fn().mockRejectedValue({
          response: {
            status: 403,
            data: {
              message: "Contact management is disabled.",
            },
          },
        }),
        post: vi.fn().mockResolvedValue({ data: {} }),
        patch: vi.fn().mockResolvedValue({ data: {} }),
        delete: vi.fn().mockResolvedValue({ data: {} }),
      },
    });

    render(
      <MemoryRouter initialEntries={["/contacts"]}>
        <PathProbe />
        <ContactsPage {...props} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(props.auth.refreshAuth).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/"),
    );
  });
});
