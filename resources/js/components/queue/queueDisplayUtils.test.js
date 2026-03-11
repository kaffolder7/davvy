import { describe, expect, it } from "vitest";
import {
  formatQueueTimestamp,
  queueOperationLabel,
  queueStatusLabel,
} from "./queueDisplayUtils";

describe("queueDisplayUtils", () => {
  it("formats missing/invalid timestamps as n/a", () => {
    expect(formatQueueTimestamp(null)).toBe("n/a");
    expect(formatQueueTimestamp("not-a-date")).toBe("n/a");
  });

  it("formats valid timestamps using locale string", () => {
    const value = formatQueueTimestamp("2026-03-01T12:30:00.000Z");
    expect(typeof value).toBe("string");
    expect(value).not.toBe("n/a");
  });

  it("maps status labels", () => {
    expect(queueStatusLabel("pending")).toBe("Pending");
    expect(queueStatusLabel("approved")).toBe("Approved (awaiting others)");
    expect(queueStatusLabel("manual_merge_needed")).toBe("Manual Merge Needed");
    expect(queueStatusLabel("applied")).toBe("Applied");
    expect(queueStatusLabel("denied")).toBe("Denied");
    expect(queueStatusLabel("mystery")).toBe("mystery");
    expect(queueStatusLabel("")).toBe("Unknown");
  });

  it("maps operation labels", () => {
    expect(queueOperationLabel("delete")).toBe("Delete");
    expect(queueOperationLabel("update")).toBe("Update");
  });
});
