import { useEffect, useMemo, useState } from "react";

/**
 * Central state manager for contact list filtering, editor form state, and CRUD actions.
 *
 * @param {Record<string, any>} deps
 * @returns {Record<string, any>}
 */
export default function useContactsPageState({
  auth,
  api,
  extractError,
  createEmptyContactForm,
  OPTIONAL_CONTACT_FIELDS,
  createContactSectionOpenState,
  normalizePositiveInt,
  buildSavedCustomLabelsByField,
  buildLabelOptions,
  PHONE_LABEL_OPTIONS,
  EMAIL_LABEL_OPTIONS,
  URL_LABEL_OPTIONS,
  ADDRESS_LABEL_OPTIONS,
  DATE_LABEL_OPTIONS,
  buildRelatedNameLabelOptions,
  IM_LABEL_OPTIONS,
  CONTACTS_PAGE_SIZE,
  hasTextValue,
  deriveOptionalFieldVisibility,
  deriveContactSectionOpenState,
  hydrateContactForm,
  normalizeDatePartInput,
  normalizeDatePartsForPayload,
  normalizeDateRowsForPayload,
  optionalFieldHasValue,
  clearOptionalFieldValue,
  navigate,
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [queueStatusNotice, setQueueStatusNotice] = useState("");
  const [contacts, setContacts] = useState([]);
  const [addressBooks, setAddressBooks] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [form, setForm] = useState(createEmptyContactForm());
  const [visibleOptionalFields, setVisibleOptionalFields] = useState([]);
  const [fieldToAdd, setFieldToAdd] = useState(
    OPTIONAL_CONTACT_FIELDS[0]?.id ?? "",
  );
  const [fieldSearchTerm, setFieldSearchTerm] = useState("");
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [pendingHideFieldId, setPendingHideFieldId] = useState(null);
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [contactAddressBookFilter, setContactAddressBookFilter] =
    useState("all");
  const [contactsPage, setContactsPage] = useState(1);
  const [openSections, setOpenSections] = useState(
    createContactSectionOpenState(),
  );

  const defaultAddressBookIds = useMemo(
    () => (addressBooks[0] ? [addressBooks[0].id] : []),
    [addressBooks],
  );

  const hiddenOptionalFields = useMemo(
    () =>
      OPTIONAL_CONTACT_FIELDS.filter(
        (field) => !visibleOptionalFields.includes(field.id),
      ),
    [visibleOptionalFields, OPTIONAL_CONTACT_FIELDS],
  );

  const relatedNameOptions = useMemo(() => {
    const activeContactId = normalizePositiveInt(form.id);

    return contacts
      .map((contact) => ({
        id: normalizePositiveInt(contact?.id),
        display_name: String(contact?.display_name ?? "").trim(),
        nickname: String(contact?.nickname ?? "").trim(),
      }))
      .filter(
        (contact) =>
          contact.id !== null &&
          contact.display_name !== "" &&
          contact.id !== activeContactId,
      )
      .sort((left, right) =>
        left.display_name.localeCompare(right.display_name, undefined, {
          sensitivity: "base",
        }),
      );
  }, [contacts, form.id, normalizePositiveInt]);

  const savedCustomLabels = useMemo(
    () => buildSavedCustomLabelsByField(contacts),
    [contacts, buildSavedCustomLabelsByField],
  );

  const labelOptions = useMemo(
    () => ({
      phones: buildLabelOptions(PHONE_LABEL_OPTIONS, savedCustomLabels.phones),
      emails: buildLabelOptions(EMAIL_LABEL_OPTIONS, savedCustomLabels.emails),
      urls: buildLabelOptions(URL_LABEL_OPTIONS, savedCustomLabels.urls),
      addresses: buildLabelOptions(
        ADDRESS_LABEL_OPTIONS,
        savedCustomLabels.addresses,
      ),
      dates: buildLabelOptions(DATE_LABEL_OPTIONS, savedCustomLabels.dates),
      related_names: buildRelatedNameLabelOptions(
        contacts,
        savedCustomLabels.related_names,
      ),
      instant_messages: buildLabelOptions(
        IM_LABEL_OPTIONS,
        savedCustomLabels.instant_messages,
      ),
    }),
    [
      contacts,
      savedCustomLabels,
      buildLabelOptions,
      PHONE_LABEL_OPTIONS,
      EMAIL_LABEL_OPTIONS,
      URL_LABEL_OPTIONS,
      ADDRESS_LABEL_OPTIONS,
      DATE_LABEL_OPTIONS,
      buildRelatedNameLabelOptions,
      IM_LABEL_OPTIONS,
    ],
  );

  const filteredHiddenOptionalFields = useMemo(() => {
    const query = fieldSearchTerm.trim().toLowerCase();
    if (!query) {
      return hiddenOptionalFields;
    }

    return hiddenOptionalFields.filter((field) =>
      field.label.toLowerCase().includes(query),
    );
  }, [fieldSearchTerm, hiddenOptionalFields]);

  const filteredContacts = useMemo(() => {
    const query = contactSearchTerm.trim().toLowerCase();
    const activeAddressBookId =
      contactAddressBookFilter === "all"
        ? null
        : Number(contactAddressBookFilter);

    const searchValueIncludesQuery = (value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(query);
    const rowValueIncludesQuery = (rows) =>
      Array.isArray(rows)
        ? rows.some(
            (row) =>
              searchValueIncludesQuery(row?.value) ||
              searchValueIncludesQuery(row?.custom_label),
          )
        : false;

    return contacts.filter((contact) => {
      if (activeAddressBookId !== null) {
        const assignedBookIds = Array.isArray(contact.address_book_ids)
          ? contact.address_book_ids
          : [];

        if (!assignedBookIds.some((id) => Number(id) === activeAddressBookId)) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      if (
        [
          contact.display_name,
          contact.first_name,
          contact.middle_name,
          contact.last_name,
          contact.nickname,
          contact.company,
          contact.job_title,
          contact.department,
          contact.profile,
        ].some(searchValueIncludesQuery)
      ) {
        return true;
      }

      if (
        Array.isArray(contact.address_books) &&
        contact.address_books.some(
          (book) =>
            searchValueIncludesQuery(book?.display_name) ||
            searchValueIncludesQuery(book?.uri),
        )
      ) {
        return true;
      }

      if (
        rowValueIncludesQuery(contact.phones) ||
        rowValueIncludesQuery(contact.emails) ||
        rowValueIncludesQuery(contact.urls) ||
        rowValueIncludesQuery(contact.related_names) ||
        rowValueIncludesQuery(contact.instant_messages)
      ) {
        return true;
      }

      return Array.isArray(contact.addresses)
        ? contact.addresses.some((address) =>
            [
              address?.street,
              address?.city,
              address?.state,
              address?.postal_code,
              address?.country,
              address?.custom_label,
            ].some(searchValueIncludesQuery),
          )
        : false;
    });
  }, [contactAddressBookFilter, contactSearchTerm, contacts]);

  const totalContactPages = Math.max(
    1,
    Math.ceil(filteredContacts.length / CONTACTS_PAGE_SIZE),
  );
  const currentContactPage = Math.min(contactsPage, totalContactPages);
  const firstContactIndex = (currentContactPage - 1) * CONTACTS_PAGE_SIZE;
  const paginatedContacts = filteredContacts.slice(
    firstContactIndex,
    firstContactIndex + CONTACTS_PAGE_SIZE,
  );
  const lastContactIndex =
    filteredContacts.length === 0
      ? 0
      : firstContactIndex + paginatedContacts.length;
  const hasContactFilters =
    hasTextValue(contactSearchTerm) || contactAddressBookFilter !== "all";

  useEffect(() => {
    setContactsPage(1);
  }, [contactAddressBookFilter, contactSearchTerm]);

  useEffect(() => {
    if (contactAddressBookFilter === "all") {
      return;
    }

    const filterExists = addressBooks.some(
      (book) => String(book.id) === contactAddressBookFilter,
    );

    if (!filterExists) {
      setContactAddressBookFilter("all");
    }
  }, [addressBooks, contactAddressBookFilter]);

  useEffect(() => {
    setContactsPage((prevPage) =>
      prevPage > totalContactPages ? totalContactPages : prevPage,
    );
  }, [totalContactPages]);

  useEffect(() => {
    if (hiddenOptionalFields.length === 0) {
      setFieldToAdd("");
      setFieldSearchTerm("");
      setFieldPickerOpen(false);
      return;
    }

    if (filteredHiddenOptionalFields.length === 0) {
      setFieldToAdd("");
      return;
    }

    if (!filteredHiddenOptionalFields.some((field) => field.id === fieldToAdd)) {
      setFieldToAdd(filteredHiddenOptionalFields[0].id);
    }
  }, [fieldToAdd, filteredHiddenOptionalFields, hiddenOptionalFields]);

  const applyFormState = (nextForm) => {
    setForm(nextForm);
    setVisibleOptionalFields(deriveOptionalFieldVisibility(nextForm));
    setOpenSections(deriveContactSectionOpenState(nextForm));
  };

  const redirectIfFeatureDisabled = async (err) => {
    const status = err?.response?.status;
    const message = String(err?.response?.data?.message ?? "").toLowerCase();

    if (status !== 403 || !message.includes("contact management")) {
      return false;
    }

    await auth.refreshAuth();
    navigate("/", { replace: true });
    return true;
  };

  const loadContacts = async ({
    preserveSelection = true,
    selectId = undefined,
  } = {}) => {
    setError("");
    setLoading(true);

    try {
      const response = await api.get("/api/contacts");
      const nextContacts = Array.isArray(response.data?.contacts)
        ? response.data.contacts
        : [];
      const nextAddressBooks = Array.isArray(response.data?.address_books)
        ? response.data.address_books
        : [];

      setContacts(nextContacts);
      setAddressBooks(nextAddressBooks);

      const fallbackIds = nextAddressBooks[0] ? [nextAddressBooks[0].id] : [];
      const hasExplicitSelectId = selectId !== undefined;
      const explicitContactId =
        hasExplicitSelectId &&
        selectId !== null &&
        nextContacts.some((contact) => contact.id === selectId)
          ? selectId
          : null;
      const preservedContactId =
        preserveSelection &&
        selectedContactId &&
        nextContacts.some((contact) => contact.id === selectedContactId)
          ? selectedContactId
          : null;
      const activeId = hasExplicitSelectId
        ? explicitContactId
        : preservedContactId;

      setSelectedContactId(activeId);

      const activeContact = nextContacts.find((contact) => contact.id === activeId);
      applyFormState(hydrateContactForm(activeContact, fallbackIds));
    } catch (err) {
      if (await redirectIfFeatureDisabled(err)) {
        return;
      }
      setError(extractError(err, "Unable to load contacts."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts({ preserveSelection: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!queueStatusNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setQueueStatusNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [queueStatusNotice]);

  const startNewContact = () => {
    setSelectedContactId(null);
    setError("");
    applyFormState(createEmptyContactForm(defaultAddressBookIds));
  };

  const selectContact = (contact) => {
    setSelectedContactId(contact.id);
    setError("");
    applyFormState(hydrateContactForm(contact, defaultAddressBookIds));
  };

  const updateFormField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateBirthdayField = (field, value) => {
    const normalizedValue = normalizeDatePartInput(field, value);
    setForm((prev) => ({
      ...prev,
      birthday: {
        ...prev.birthday,
        [field]: normalizedValue,
      },
    }));
  };

  const saveContact = async (event) => {
    event.preventDefault();

    if (!hasRequiredContactIdentity) {
      setError("Enter at least a First Name, Last Name, or Company.");
      return;
    }

    if (
      !Array.isArray(form.address_book_ids) ||
      form.address_book_ids.length === 0
    ) {
      setError("Select at least one address book.");
      return;
    }

    setSubmitting(true);
    setError("");

    const payload = {
      ...form,
      birthday: normalizeDatePartsForPayload(form.birthday),
      dates: normalizeDateRowsForPayload(form.dates),
      address_book_ids: form.address_book_ids.map((id) => Number(id)),
    };
    delete payload.id;

    try {
      const response = form.id
        ? await api.patch(`/api/contacts/${form.id}`, payload)
        : await api.post("/api/contacts", payload);

      if (response?.data?.queued) {
        setQueueStatusNotice(
          response.data?.message || "Change submitted for owner/admin approval.",
        );
        await loadContacts({
          preserveSelection: false,
          selectId: null,
        });
        return;
      }

      await loadContacts({
        preserveSelection: false,
        selectId: null,
      });
    } catch (err) {
      if (await redirectIfFeatureDisabled(err)) {
        return;
      }
      setError(extractError(err, "Unable to save contact."));
    } finally {
      setSubmitting(false);
    }
  };

  const removeContact = async () => {
    if (!form.id) {
      return;
    }

    if (!window.confirm("Delete this contact from all assigned address books?")) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await api.delete(`/api/contacts/${form.id}`);

      if (response?.data?.queued) {
        setQueueStatusNotice(
          response.data?.message ||
            "Delete request submitted for owner/admin approval.",
        );
        await loadContacts({ preserveSelection: true });
        return;
      }

      await loadContacts({ preserveSelection: false, selectId: null });
    } catch (err) {
      if (await redirectIfFeatureDisabled(err)) {
        return;
      }
      setError(extractError(err, "Unable to delete contact."));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAssignedAddressBook = (addressBookId, checked) => {
    setForm((prev) => {
      const current = Array.isArray(prev.address_book_ids)
        ? [...prev.address_book_ids]
        : [];

      if (checked) {
        if (!current.includes(addressBookId)) {
          current.push(addressBookId);
        }
      } else {
        const next = current.filter((id) => id !== addressBookId);
        return { ...prev, address_book_ids: next };
      }

      return { ...prev, address_book_ids: current };
    });
  };

  const showOptionalField = (fieldId) => {
    if (!fieldId) {
      return;
    }

    setVisibleOptionalFields((prev) =>
      prev.includes(fieldId) ? prev : [...prev, fieldId],
    );
  };

  const hideOptionalField = (fieldId) => {
    if (!fieldId) {
      return;
    }

    if (optionalFieldHasValue(form, fieldId)) {
      setPendingHideFieldId(fieldId);
      return;
    }

    setVisibleOptionalFields((prev) => prev.filter((id) => id !== fieldId));
  };

  const resolveHideOptionalField = (clearValue) => {
    if (!pendingHideFieldId) {
      return;
    }

    const hideFieldId = pendingHideFieldId;

    if (clearValue) {
      setForm((prev) => clearOptionalFieldValue(prev, hideFieldId));
    }

    setVisibleOptionalFields((prev) => prev.filter((id) => id !== hideFieldId));
    setPendingHideFieldId(null);
  };

  const cancelHideOptionalField = () => {
    setPendingHideFieldId(null);
  };

  const addSelectedOptionalField = () => {
    if (!fieldToAdd) {
      return;
    }

    showOptionalField(fieldToAdd);
    setFieldSearchTerm("");
    setFieldPickerOpen(false);
  };

  const toggleSection = (sectionId) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const isOptionalFieldVisible = (fieldId) =>
    visibleOptionalFields.includes(fieldId);
  const hasRequiredContactIdentity =
    hasTextValue(form.first_name) ||
    hasTextValue(form.last_name) ||
    hasTextValue(form.company);
  const selectedAddressBookCount = Array.isArray(form.address_book_ids)
    ? form.address_book_ids.length
    : 0;
  const pendingHideFieldLabel =
    OPTIONAL_CONTACT_FIELDS.find((field) => field.id === pendingHideFieldId)
      ?.label ?? pendingHideFieldId;

  return {
    loading,
    submitting,
    error,
    queueStatusNotice,
    contacts,
    addressBooks,
    selectedContactId,
    form,
    openSections,
    hiddenOptionalFields,
    filteredHiddenOptionalFields,
    filteredContacts,
    paginatedContacts,
    contactSearchTerm,
    setContactSearchTerm,
    contactAddressBookFilter,
    setContactAddressBookFilter,
    currentContactPage,
    totalContactPages,
    firstContactIndex,
    lastContactIndex,
    hasContactFilters,
    setContactsPage,
    selectedAddressBookCount,
    hasRequiredContactIdentity,
    pendingHideFieldId,
    pendingHideFieldLabel,
    fieldSearchTerm,
    setFieldSearchTerm,
    fieldPickerOpen,
    setFieldPickerOpen,
    fieldToAdd,
    setFieldToAdd,
    visibleOptionalFields,
    setForm,
    labelOptions,
    relatedNameOptions,
    saveContact,
    removeContact,
    startNewContact,
    selectContact,
    updateFormField,
    updateBirthdayField,
    toggleAssignedAddressBook,
    showOptionalField,
    hideOptionalField,
    addSelectedOptionalField,
    toggleSection,
    isOptionalFieldVisible,
    cancelHideOptionalField,
    resolveHideOptionalField,
  };
}
