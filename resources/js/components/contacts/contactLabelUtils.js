export const PHONE_LABEL_OPTIONS = [
  { value: "mobile", label: "Mobile" },
  { value: "iphone", label: "iPhone" },
  { value: "apple_watch", label: "Apple Watch" },
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "main", label: "Main" },
  { value: "home_fax", label: "Home Fax" },
  { value: "work_fax", label: "Work Fax" },
  { value: "other_fax", label: "Other Fax" },
  { value: "pager", label: "Pager" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

export const EMAIL_LABEL_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

export const URL_LABEL_OPTIONS = [
  { value: "homepage", label: "Home Page" },
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

export const ADDRESS_LABEL_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "school", label: "School" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

export const DATE_LABEL_OPTIONS = [
  { value: "anniversary", label: "Anniversary" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

export const RELATED_LABEL_OPTIONS = [
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
  { value: "sibling", label: "Sibling" },
  { value: "assistant", label: "Assistant" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const RELATED_LABEL_DERIVED_VALUES = new Set([
  "spouse",
  "husband",
  "wife",
  "partner",
  "boyfriend",
  "girlfriend",
  "fiance",
  "fiancee",
  "parent",
  "father",
  "mother",
  "dad",
  "mom",
  "child",
  "son",
  "daughter",
  "stepson",
  "stepdaughter",
  "parent_in_law",
  "father_in_law",
  "mother_in_law",
  "child_in_law",
  "son_in_law",
  "daughter_in_law",
  "sibling",
  "brother",
  "sister",
  "sibling_in_law",
  "brother_in_law",
  "sister_in_law",
  "aunt_uncle",
  "aunt",
  "uncle",
  "niece_nephew",
  "niece",
  "nephew",
  "grandparent",
  "grandfather",
  "grandpa",
  "grandmother",
  "grandma",
  "grandchild",
  "grandson",
  "granddaughter",
  "cousin",
  "assistant",
  "friend",
  "other",
]);

const RELATED_LABEL_DISPLAY_OVERRIDES = {
  parent_in_law: "Parent-in-Law",
  father_in_law: "Father-in-Law",
  mother_in_law: "Mother-in-Law",
  child_in_law: "Child-in-Law",
  son_in_law: "Son-in-Law",
  daughter_in_law: "Daughter-in-Law",
  sibling_in_law: "Sibling-in-Law",
  brother_in_law: "Brother-in-Law",
  sister_in_law: "Sister-in-Law",
  aunt_uncle: "Aunt/Uncle",
  niece_nephew: "Niece/Nephew",
  grandpa: "Grandpa",
  grandma: "Grandma",
};

export const IM_LABEL_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const SAVED_CUSTOM_LABEL_VALUE_PREFIX = "saved-custom:";
const CONTACT_LABEL_FIELD_OPTIONS = {
  phones: PHONE_LABEL_OPTIONS,
  emails: EMAIL_LABEL_OPTIONS,
  urls: URL_LABEL_OPTIONS,
  addresses: ADDRESS_LABEL_OPTIONS,
  dates: DATE_LABEL_OPTIONS,
  related_names: RELATED_LABEL_OPTIONS,
  instant_messages: IM_LABEL_OPTIONS,
};
const CONTACT_LABEL_FIELD_KEYS = Object.keys(CONTACT_LABEL_FIELD_OPTIONS);
const CONTACT_LABEL_BUILTIN_VALUE_SETS = Object.fromEntries(
  CONTACT_LABEL_FIELD_KEYS.map((fieldKey) => [
    fieldKey,
    new Set(
      CONTACT_LABEL_FIELD_OPTIONS[fieldKey]
        .map((option) => String(option?.value ?? "").trim().toLowerCase())
        .filter((value) => value !== "" && value !== "custom"),
    ),
  ]),
);
const EMPTY_CONTACT_CUSTOM_LABELS = Object.fromEntries(
  CONTACT_LABEL_FIELD_KEYS.map((fieldKey) => [fieldKey, []]),
);

function normalizeLabelValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCustomLabelText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function customLabelKey(value) {
  return normalizeCustomLabelText(value).toLowerCase();
}

function savedCustomOptionValue(label) {
  return `${SAVED_CUSTOM_LABEL_VALUE_PREFIX}${customLabelKey(label)}`;
}

/**
 * Collects custom labels used across contacts, grouped by contact field key.
 *
 * @param {unknown} contacts
 * @returns {Record<string, string[]>}
 */
export function buildSavedCustomLabelsByField(contacts) {
  const mapsByField = Object.fromEntries(
    CONTACT_LABEL_FIELD_KEYS.map((fieldKey) => [fieldKey, new Map()]),
  );

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return EMPTY_CONTACT_CUSTOM_LABELS;
  }

  for (const contact of contacts) {
    for (const fieldKey of CONTACT_LABEL_FIELD_KEYS) {
      const builtInValues = CONTACT_LABEL_BUILTIN_VALUE_SETS[fieldKey];
      const rows = Array.isArray(contact?.[fieldKey]) ? contact[fieldKey] : [];

      for (const row of rows) {
        if (!row || typeof row !== "object") {
          continue;
        }

        const normalizedLabel = normalizeLabelValue(row?.label);
        if (normalizedLabel !== "custom") {
          continue;
        }

        const candidateLabel = normalizeCustomLabelText(row?.custom_label);

        const candidateKey = customLabelKey(candidateLabel);
        if (candidateKey === "" || builtInValues.has(candidateKey)) {
          continue;
        }

        if (!mapsByField[fieldKey].has(candidateKey)) {
          mapsByField[fieldKey].set(candidateKey, candidateLabel);
        }
      }
    }
  }

  return Object.fromEntries(
    CONTACT_LABEL_FIELD_KEYS.map((fieldKey) => [
      fieldKey,
      Array.from(mapsByField[fieldKey].values()).sort((left, right) =>
        left.localeCompare(right, undefined, {
          sensitivity: "base",
        }),
      ),
    ]),
  );
}

/**
 * Builds label select options with saved custom labels inserted before "Custom...".
 *
 * @param {Array<{value: string, label: string}>} baseOptions
 * @param {string[]} [savedCustomLabels=[]]
 * @returns {Array<{value: string, label: string, saved_custom_label?: string, saved_custom_key?: string}>}
 */
export function buildLabelOptions(baseOptions, savedCustomLabels = []) {
  const primaryOptions = baseOptions.filter((option) => option.value !== "custom");
  const customOption = baseOptions.find((option) => option.value === "custom");
  const customLabelOptions = savedCustomLabels.map((label) => ({
    value: savedCustomOptionValue(label),
    label,
    saved_custom_label: label,
    saved_custom_key: customLabelKey(label),
  }));

  if (!customOption) {
    return [...primaryOptions, ...customLabelOptions];
  }

  return [...primaryOptions, ...customLabelOptions, customOption];
}

function formatRelatedLabelOptionLabel(value) {
  const normalized = normalizeLabelValue(value);
  if (!normalized) {
    return "";
  }

  if (RELATED_LABEL_DISPLAY_OVERRIDES[normalized]) {
    return RELATED_LABEL_DISPLAY_OVERRIDES[normalized];
  }

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Derives additional related-name label options from existing contact data.
 *
 * @param {unknown} contacts
 * @returns {Array<{value: string, label: string}>}
 */
export function buildDerivedRelatedLabelOptions(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return [];
  }

  const builtInValues = CONTACT_LABEL_BUILTIN_VALUE_SETS.related_names ?? new Set();
  const derivedValues = new Set();

  for (const contact of contacts) {
    const rows = Array.isArray(contact?.related_names) ? contact.related_names : [];

    for (const row of rows) {
      const normalizedLabel = normalizeLabelValue(row?.label);
      if (
        normalizedLabel === "" ||
        normalizedLabel === "custom" ||
        builtInValues.has(normalizedLabel) ||
        !RELATED_LABEL_DERIVED_VALUES.has(normalizedLabel)
      ) {
        continue;
      }

      derivedValues.add(normalizedLabel);
    }
  }

  return Array.from(derivedValues)
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        sensitivity: "base",
      }),
    )
    .map((value) => ({
      value,
      label: formatRelatedLabelOptionLabel(value),
    }));
}

/**
 * Builds related-name label options with built-in, saved custom, and derived labels.
 *
 * @param {unknown} contacts
 * @param {string[]} [savedCustomLabels=[]]
 * @returns {Array<{value: string, label: string, saved_custom_label?: string, saved_custom_key?: string}>}
 */
export function buildRelatedNameLabelOptions(contacts, savedCustomLabels = []) {
  const baseOptions = buildLabelOptions(RELATED_LABEL_OPTIONS, savedCustomLabels);
  const derivedOptions = buildDerivedRelatedLabelOptions(contacts);
  if (derivedOptions.length === 0) {
    return baseOptions;
  }

  const customOption = baseOptions.find(
    (option) => normalizeLabelValue(option?.value) === "custom",
  );
  const nonCustomOptions = baseOptions.filter(
    (option) => normalizeLabelValue(option?.value) !== "custom",
  );
  const existingValues = new Set(
    nonCustomOptions.map((option) => normalizeLabelValue(option?.value)),
  );
  const dedupedDerivedOptions = derivedOptions.filter(
    (option) => !existingValues.has(normalizeLabelValue(option?.value)),
  );
  const dedupedDerivedKeys = new Set(
    dedupedDerivedOptions.map((option) => normalizeLabelValue(option?.value)),
  );
  const dedupedOptions = nonCustomOptions.filter(
    (option) =>
      !option?.saved_custom_key ||
      !dedupedDerivedKeys.has(normalizeLabelValue(option.saved_custom_key)),
  );

  if (!customOption) {
    return [...dedupedOptions, ...dedupedDerivedOptions];
  }

  return [...dedupedOptions, ...dedupedDerivedOptions, customOption];
}

/**
 * Resolves the selected option value for a row's current label/custom-label state.
 *
 * @param {Record<string, any>} row
 * @param {Array<{value: string, saved_custom_key?: string}>} labelOptions
 * @param {string} [fallbackValue='other']
 * @returns {string}
 */
export function resolveLabelSelectValue(
  row,
  labelOptions,
  fallbackValue = "other",
) {
  const normalizedLabel = normalizeLabelValue(row?.label);

  if (normalizedLabel === "custom") {
    const selectedCustomKey = customLabelKey(row?.custom_label);
    if (selectedCustomKey !== "") {
      const customOption = labelOptions.find(
        (option) => option.saved_custom_key === selectedCustomKey,
      );
      if (customOption) {
        return customOption.value;
      }
    }

    return "custom";
  }

  const directOption = labelOptions.find(
    (option) => normalizeLabelValue(option.value) === normalizedLabel,
  );
  if (directOption) {
    return directOption.value;
  }

  return fallbackValue;
}
