export const OPTIONAL_CONTACT_FIELDS = [
  { id: "prefix", label: "Prefix" },
  { id: "middle_name", label: "Middle Name" },
  { id: "suffix", label: "Suffix" },
  { id: "nickname", label: "Nickname" },
  { id: "maiden_name", label: "Maiden Name" },
  { id: "phonetic_first_name", label: "Phonetic First Name" },
  { id: "phonetic_last_name", label: "Phonetic Last Name" },
  { id: "phonetic_company", label: "Phonetic Company" },
  { id: "department", label: "Department" },
  { id: "pronouns_custom", label: "Custom Pronouns" },
  { id: "ringtone", label: "Ringtone" },
  { id: "text_tone", label: "Text Tone" },
  { id: "verification_code", label: "Verification Code" },
  { id: "profile", label: "Profile" },
  { id: "instant_messages", label: "Instant Message" },
  { id: "dates", label: "Date" },
];

export function hasTextValue(value) {
  return typeof value === "string" ? value.trim() !== "" : false;
}

function sanitizeDatePartInput(value, maxLength) {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, maxLength);
}

export function normalizeDatePartInput(field, value) {
  if (field === "month" || field === "day") {
    return sanitizeDatePartInput(value, 2);
  }

  if (field === "year") {
    return sanitizeDatePartInput(value, 4);
  }

  return String(value ?? "");
}

function formatDatePartForInput(value, padLength = 0) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }

  return padLength > 0 ? normalized.padStart(padLength, "0") : normalized;
}

function normalizeDatePartForPayload(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDatePartsForPayload(parts) {
  return {
    year: normalizeDatePartForPayload(parts?.year),
    month: normalizeDatePartForPayload(parts?.month),
    day: normalizeDatePartForPayload(parts?.day),
  };
}

export function normalizeDateRowsForPayload(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    ...row,
    year: normalizeDatePartForPayload(row?.year),
    month: normalizeDatePartForPayload(row?.month),
    day: normalizeDatePartForPayload(row?.day),
  }));
}

export function normalizePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasValueRowContent(rows) {
  return Array.isArray(rows)
    ? rows.some(
        (row) => hasTextValue(row?.value) || hasTextValue(row?.custom_label),
      )
    : false;
}

function hasDateRowContent(rows) {
  return Array.isArray(rows)
    ? rows.some((row) => hasTextValue(row?.month) || hasTextValue(row?.day))
    : false;
}

function hasAddressRowContent(rows) {
  return Array.isArray(rows)
    ? rows.some(
        (row) =>
          hasTextValue(row?.street) ||
          hasTextValue(row?.city) ||
          hasTextValue(row?.state) ||
          hasTextValue(row?.postal_code) ||
          hasTextValue(row?.country) ||
          hasTextValue(row?.custom_label),
      )
    : false;
}

export function createContactSectionOpenState() {
  return {
    name: true,
    work: false,
    personal: false,
    communication: false,
    addressBooks: true,
  };
}

export function deriveContactSectionOpenState(form) {
  const defaults = createContactSectionOpenState();

  const workHasValue =
    hasTextValue(form.company) ||
    hasTextValue(form.job_title) ||
    hasTextValue(form.phonetic_company) ||
    hasTextValue(form.department);

  const personalHasValue =
    hasTextValue(form.pronouns) ||
    hasTextValue(form.pronouns_custom) ||
    hasTextValue(form.ringtone) ||
    hasTextValue(form.text_tone) ||
    hasTextValue(form.verification_code) ||
    hasTextValue(form.profile) ||
    form.head_of_household === true ||
    form.exclude_milestone_calendars === true ||
    hasTextValue(form.birthday?.month) ||
    hasTextValue(form.birthday?.day) ||
    hasTextValue(form.birthday?.year) ||
    hasDateRowContent(form.dates);

  const communicationHasValue =
    hasValueRowContent(form.phones) ||
    hasValueRowContent(form.emails) ||
    hasValueRowContent(form.urls) ||
    hasValueRowContent(form.instant_messages) ||
    hasValueRowContent(form.related_names) ||
    hasAddressRowContent(form.addresses);

  return {
    ...defaults,
    work: defaults.work || workHasValue,
    personal: defaults.personal || personalHasValue,
    communication: defaults.communication || communicationHasValue,
  };
}

export function deriveOptionalFieldVisibility(form) {
  return OPTIONAL_CONTACT_FIELDS.filter((field) => {
    if (field.id === "instant_messages") {
      return hasValueRowContent(form.instant_messages);
    }

    if (field.id === "dates") {
      return hasDateRowContent(form.dates);
    }

    if (field.id === "pronouns_custom") {
      return hasTextValue(form.pronouns_custom) || form.pronouns === "custom";
    }

    return hasTextValue(form[field.id]);
  }).map((field) => field.id);
}

export function optionalFieldHasValue(form, fieldId) {
  if (fieldId === "instant_messages") {
    return hasValueRowContent(form.instant_messages);
  }

  if (fieldId === "dates") {
    return hasDateRowContent(form.dates);
  }

  if (fieldId === "pronouns_custom") {
    return hasTextValue(form.pronouns_custom);
  }

  return hasTextValue(form[fieldId]);
}

export function clearOptionalFieldValue(form, fieldId) {
  switch (fieldId) {
    case "instant_messages":
      return { ...form, instant_messages: [createEmptyLabeledValue("other")] };
    case "dates":
      return { ...form, dates: [createEmptyDate("anniversary")] };
    case "pronouns_custom":
      return {
        ...form,
        pronouns_custom: "",
        pronouns: form.pronouns === "custom" ? "" : form.pronouns,
      };
    default:
      return { ...form, [fieldId]: "" };
  }
}

export function createEmptyLabeledValue(label = "other") {
  return { label, custom_label: "", value: "" };
}

export function createEmptyRelatedName(label = "other") {
  return { label, custom_label: "", value: "", related_contact_id: null };
}

export function createEmptyAddress(label = "home") {
  return {
    label,
    custom_label: "",
    street: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
  };
}

export function createEmptyDate(label = "other") {
  return { label, custom_label: "", year: "", month: "", day: "" };
}

export function createEmptyContactForm(defaultAddressBookIds = []) {
  return {
    id: null,
    prefix: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    nickname: "",
    company: "",
    job_title: "",
    department: "",
    pronouns: "",
    pronouns_custom: "",
    ringtone: "",
    text_tone: "",
    phonetic_first_name: "",
    phonetic_last_name: "",
    phonetic_company: "",
    maiden_name: "",
    verification_code: "",
    profile: "",
    head_of_household: false,
    exclude_milestone_calendars: false,
    birthday: { year: "", month: "", day: "" },
    phones: [createEmptyLabeledValue("mobile")],
    emails: [createEmptyLabeledValue("home")],
    urls: [createEmptyLabeledValue("homepage")],
    addresses: [createEmptyAddress("home")],
    dates: [createEmptyDate("anniversary")],
    related_names: [createEmptyRelatedName("other")],
    instant_messages: [createEmptyLabeledValue("other")],
    address_book_ids: defaultAddressBookIds,
  };
}

function datePartsToFormValue(parts) {
  return {
    year: formatDatePartForInput(parts?.year),
    month: formatDatePartForInput(parts?.month, 2),
    day: formatDatePartForInput(parts?.day, 2),
  };
}

export function hydrateContactForm(contact, defaultAddressBookIds = []) {
  const fallback = createEmptyContactForm(defaultAddressBookIds);

  if (!contact) {
    return fallback;
  }

  const nonEmptyRows = (rows, makeDefault) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [makeDefault()];
    }

    return rows.map((row) => ({
      label: row?.label ?? "other",
      custom_label: row?.custom_label ?? "",
      value: row?.value ?? "",
    }));
  };

  const nonEmptyAddresses = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [createEmptyAddress("home")];
    }

    return rows.map((row) => ({
      label: row?.label ?? "home",
      custom_label: row?.custom_label ?? "",
      street: row?.street ?? "",
      city: row?.city ?? "",
      state: row?.state ?? "",
      postal_code: row?.postal_code ?? "",
      country: row?.country ?? "",
    }));
  };

  const nonEmptyDates = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [createEmptyDate("anniversary")];
    }

    return rows.map((row) => ({
      label: row?.label ?? "other",
      custom_label: row?.custom_label ?? "",
      year: formatDatePartForInput(row?.year),
      month: formatDatePartForInput(row?.month, 2),
      day: formatDatePartForInput(row?.day, 2),
    }));
  };

  const nonEmptyRelatedNames = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [createEmptyRelatedName("other")];
    }

    return rows.map((row) => ({
      label: row?.label ?? "other",
      custom_label: row?.custom_label ?? "",
      value: row?.value ?? "",
      related_contact_id: normalizePositiveInt(row?.related_contact_id),
    }));
  };

  const addressBookIds =
    Array.isArray(contact.address_book_ids) &&
    contact.address_book_ids.length > 0
      ? contact.address_book_ids
      : defaultAddressBookIds;

  return {
    ...fallback,
    id: contact.id ?? null,
    prefix: contact.prefix ?? "",
    first_name: contact.first_name ?? "",
    middle_name: contact.middle_name ?? "",
    last_name: contact.last_name ?? "",
    suffix: contact.suffix ?? "",
    nickname: contact.nickname ?? "",
    company: contact.company ?? "",
    job_title: contact.job_title ?? "",
    department: contact.department ?? "",
    pronouns: contact.pronouns ?? "",
    pronouns_custom: contact.pronouns_custom ?? "",
    ringtone: contact.ringtone ?? "",
    text_tone: contact.text_tone ?? "",
    phonetic_first_name: contact.phonetic_first_name ?? "",
    phonetic_last_name: contact.phonetic_last_name ?? "",
    phonetic_company: contact.phonetic_company ?? "",
    maiden_name: contact.maiden_name ?? "",
    verification_code: contact.verification_code ?? "",
    profile: contact.profile ?? "",
    head_of_household: !!contact.head_of_household,
    exclude_milestone_calendars: !!contact.exclude_milestone_calendars,
    birthday: datePartsToFormValue(contact.birthday),
    phones: nonEmptyRows(contact.phones, () =>
      createEmptyLabeledValue("mobile"),
    ),
    emails: nonEmptyRows(contact.emails, () => createEmptyLabeledValue("home")),
    urls: nonEmptyRows(contact.urls, () => createEmptyLabeledValue("homepage")),
    addresses: nonEmptyAddresses(contact.addresses),
    dates: nonEmptyDates(contact.dates),
    related_names: nonEmptyRelatedNames(contact.related_names),
    instant_messages: nonEmptyRows(contact.instant_messages, () =>
      createEmptyLabeledValue("other"),
    ),
    address_book_ids: addressBookIds,
  };
}
