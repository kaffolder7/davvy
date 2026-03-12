import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import useContactsPageState from "./useContactsPageState";

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
    address_book_ids: addressBookIds,
  };
}

function createBaseDependencies(overrides = {}) {
  return {
    auth: {
      refreshAuth: vi.fn().mockResolvedValue(undefined),
    },
    api: {
      get: vi.fn().mockResolvedValue({
        data: {
          contacts: [
            {
              id: 9,
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
    },
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
    navigate: vi.fn(),
    ...overrides,
  };
}

describe("useContactsPageState", () => {
  it("loads contacts on mount and computes summary state", async () => {
    const deps = createBaseDependencies();

    const { result } = renderHook(() => useContactsPageState(deps));

    await waitFor(() => expect(deps.api.get).toHaveBeenCalledWith("/api/contacts"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.addressBooks).toHaveLength(1);
    expect(result.current.form.id).toBe(null);
    expect(result.current.hasContactFilters).toBe(false);
  });

  it("returns validation error when saveContact lacks required identity", async () => {
    const deps = createBaseDependencies({
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

    const { result } = renderHook(() => useContactsPageState(deps));

    await waitFor(() => expect(deps.api.get).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.saveContact({ preventDefault() {} });
    });

    await waitFor(() =>
      expect(result.current.error).toBe(
        "Enter at least a First Name, Last Name, or Company.",
      ),
    );
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(deps.api.patch).not.toHaveBeenCalled();
  });

  it("refreshes auth and navigates home when feature is disabled", async () => {
    const deps = createBaseDependencies({
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

    renderHook(() => useContactsPageState(deps));

    await waitFor(() => expect(deps.auth.refreshAuth).toHaveBeenCalledTimes(1));
    expect(deps.navigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
