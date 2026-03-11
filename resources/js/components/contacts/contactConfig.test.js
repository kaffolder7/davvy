import { describe, expect, it } from "vitest";
import { CONTACTS_PAGE_SIZE, PRONOUN_OPTIONS } from "./contactConfig";

describe("contactConfig", () => {
  it("defines contacts page size as a positive integer", () => {
    expect(Number.isInteger(CONTACTS_PAGE_SIZE)).toBe(true);
    expect(CONTACTS_PAGE_SIZE).toBeGreaterThan(0);
  });

  it("includes the expected pronoun choices", () => {
    const values = PRONOUN_OPTIONS.map((option) => option.value);

    expect(values).toEqual([
      "",
      "she/her",
      "he/him",
      "they/them",
      "xe/xem",
      "custom",
    ]);
  });
});
