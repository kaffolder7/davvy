import { describe, expect, it } from "vitest";
import {
  clearOptionalFieldValue,
  createContactSectionOpenState,
  createEmptyContactForm,
  deriveContactSectionOpenState,
  deriveOptionalFieldVisibility,
  hasTextValue,
  hydrateContactForm,
  normalizeDatePartInput,
  normalizeDatePartsForPayload,
  normalizeDateRowsForPayload,
  normalizePositiveInt,
  optionalFieldHasValue,
} from "./contactFormUtils";

describe("contactFormUtils", () => {
  it("normalizes text, positive integers, and date part input", () => {
    expect(hasTextValue("  value ")).toBe(true);
    expect(hasTextValue("   ")).toBe(false);

    expect(normalizePositiveInt("42")).toBe(42);
    expect(normalizePositiveInt("0")).toBeNull();
    expect(normalizePositiveInt("-1")).toBeNull();

    expect(normalizeDatePartInput("month", "a1b29")).toBe("12");
    expect(normalizeDatePartInput("day", "09x")).toBe("09");
    expect(normalizeDatePartInput("year", "20a26x99")).toBe("2026");
    expect(normalizeDatePartInput("note", "abc")).toBe("abc");
  });

  it("normalizes date payloads", () => {
    expect(
      normalizeDatePartsForPayload({
        year: " 2026 ",
        month: "03",
        day: "",
      }),
    ).toEqual({
      year: 2026,
      month: 3,
      day: null,
    });

    expect(
      normalizeDateRowsForPayload([
        { label: "anniversary", year: "", month: " 07", day: "09 " },
      ]),
    ).toEqual([
      { label: "anniversary", year: null, month: 7, day: 9 },
    ]);
  });

  it("builds empty contact forms with expected defaults", () => {
    const form = createEmptyContactForm([9, 10]);

    expect(form.address_book_ids).toEqual([9, 10]);
    expect(form.phones).toEqual([{ label: "mobile", custom_label: "", value: "" }]);
    expect(form.emails).toEqual([{ label: "home", custom_label: "", value: "" }]);
    expect(form.addresses[0]).toEqual(
      expect.objectContaining({ label: "home", city: "", country: "" }),
    );
    expect(form.related_names[0]).toEqual(
      expect.objectContaining({ label: "other", related_contact_id: null }),
    );
  });

  it("hydrates contacts and preserves safe defaults", () => {
    const hydrated = hydrateContactForm(
      {
        id: 11,
        first_name: "Alex",
        birthday: { year: 1990, month: 3, day: 5 },
        related_names: [{ label: "spouse", value: "Taylor", related_contact_id: "42" }],
        dates: [{ label: "anniversary", year: "2020", month: "7", day: "9" }],
        addresses: [],
        emails: [{ label: "home", value: "alex@example.com", custom_label: "" }],
        address_book_ids: [],
      },
      [5],
    );

    expect(hydrated.id).toBe(11);
    expect(hydrated.first_name).toBe("Alex");
    expect(hydrated.birthday).toEqual({ year: "1990", month: "03", day: "05" });
    expect(hydrated.related_names[0]).toEqual(
      expect.objectContaining({ label: "spouse", related_contact_id: 42 }),
    );
    expect(hydrated.dates[0]).toEqual(
      expect.objectContaining({ year: "2020", month: "07", day: "09" }),
    );
    expect(hydrated.addresses[0]).toEqual(
      expect.objectContaining({ label: "home", city: "" }),
    );
    expect(hydrated.address_book_ids).toEqual([5]);
  });

  it("derives section openness from populated form values", () => {
    const defaults = createContactSectionOpenState();
    expect(deriveContactSectionOpenState(createEmptyContactForm())).toEqual(defaults);

    const populated = createEmptyContactForm();
    populated.company = "Example Co";
    populated.pronouns = "they/them";
    populated.phones = [{ label: "mobile", value: "555-0100", custom_label: "" }];

    expect(deriveContactSectionOpenState(populated)).toEqual({
      ...defaults,
      work: true,
      personal: true,
      communication: true,
    });
  });

  it("manages optional field visibility and clearing", () => {
    const form = createEmptyContactForm();
    form.pronouns = "custom";
    form.pronouns_custom = "ze/zir";
    form.instant_messages = [{ label: "other", custom_label: "", value: "alex-im" }];
    form.dates = [{ label: "other", custom_label: "", year: "", month: "12", day: "" }];

    const visible = deriveOptionalFieldVisibility(form);
    expect(visible).toEqual(
      expect.arrayContaining(["pronouns_custom", "instant_messages", "dates"]),
    );

    expect(optionalFieldHasValue(form, "pronouns_custom")).toBe(true);
    expect(optionalFieldHasValue(form, "dates")).toBe(true);
    expect(optionalFieldHasValue(form, "instant_messages")).toBe(true);

    const clearedPronouns = clearOptionalFieldValue(form, "pronouns_custom");
    expect(clearedPronouns.pronouns_custom).toBe("");
    expect(clearedPronouns.pronouns).toBe("");

    const clearedDates = clearOptionalFieldValue(form, "dates");
    expect(clearedDates.dates).toEqual([
      { label: "anniversary", custom_label: "", year: "", month: "", day: "" },
    ]);
  });
});
