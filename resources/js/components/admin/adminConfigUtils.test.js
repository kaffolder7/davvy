import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_DRAWER_ANIMATION_MS,
  BACKUP_RUN_TOAST_AUTO_HIDE_MS,
  MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS,
  MONTH_OPTIONS,
  RECOMMENDED_BACKUP_RETENTION,
  WEEKDAY_OPTIONS,
  areBackupConfigSnapshotsEqual,
  buildTimezoneGroups,
  formatAdminTimestamp,
  isRecommendedBackupRetention,
  parseBackupScheduleTimes,
} from "./adminConfigUtils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("adminConfigUtils", () => {
  it("exports expected admin timing/constants", () => {
    expect(MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS).toBe(6000);
    expect(BACKUP_RUN_TOAST_AUTO_HIDE_MS).toBe(3200);
    expect(BACKUP_DRAWER_ANIMATION_MS).toBe(220);
    expect(WEEKDAY_OPTIONS).toHaveLength(7);
    expect(MONTH_OPTIONS).toHaveLength(12);
    expect(RECOMMENDED_BACKUP_RETENTION).toEqual({
      daily: 7,
      weekly: 4,
      monthly: 12,
      yearly: 3,
    });
  });

  it("parses backup schedule times with validation, dedupe, and sorting", () => {
    expect(
      parseBackupScheduleTimes("23:59, 09:15\n09:15,invalid,24:00, 00:00"),
    ).toEqual(["00:00", "09:15", "23:59"]);
  });

  it("matches recommended backup retention values", () => {
    expect(
      isRecommendedBackupRetention({
        daily: "7",
        weekly: 4,
        monthly: "12",
        yearly: 3,
      }),
    ).toBe(true);
    expect(
      isRecommendedBackupRetention({
        daily: 8,
        weekly: 4,
        monthly: 12,
        yearly: 3,
      }),
    ).toBe(false);
  });

  it("compares normalized backup snapshots correctly", () => {
    const left = {
      backupEnabled: 1,
      backupLocalEnabled: 1,
      backupLocalPath: "/tmp/backups",
      backupS3Enabled: 0,
      backupS3Disk: "s3",
      backupS3Prefix: "davvy",
      backupTimezone: "UTC",
      backupScheduleTimes: "10:30,02:15\n02:15",
      backupWeeklyDay: "2",
      backupMonthlyDay: "5",
      backupYearlyMonth: "6",
      backupYearlyDay: "7",
      backupRetentionDaily: "7",
      backupRetentionWeekly: "4",
      backupRetentionMonthly: "12",
      backupRetentionYearly: "3",
      backupRetentionPreset: "recommended",
    };
    const right = {
      ...left,
      backupEnabled: true,
      backupScheduleTimes: "02:15,10:30",
      backupWeeklyDay: 2,
      backupMonthlyDay: 5,
      backupYearlyMonth: 6,
      backupYearlyDay: 7,
      backupRetentionDaily: 7,
      backupRetentionWeekly: 4,
      backupRetentionMonthly: 12,
      backupRetentionYearly: 3,
    };

    expect(areBackupConfigSnapshotsEqual(left, right)).toBe(true);
    expect(
      areBackupConfigSnapshotsEqual(
        left,
        {
          ...right,
          backupRetentionDaily: 8,
        },
      ),
    ).toBe(false);
  });

  it("formats admin timestamps safely", () => {
    expect(formatAdminTimestamp(null)).toBe("Never");
    expect(formatAdminTimestamp("not-a-date")).toBe("Invalid timestamp");

    const value = "2026-03-01T12:30:00Z";
    expect(formatAdminTimestamp(value)).toBe(new Date(value).toLocaleString());
  });

  it("builds timezone groups from supported values", () => {
    vi.spyOn(Intl, "supportedValuesOf").mockReturnValue([
      "America/New_York",
      "Europe/London",
      "America/Chicago",
    ]);

    const groups = buildTimezoneGroups(new Date("2026-01-15T12:00:00Z"));
    const values = groups.flatMap((group) =>
      group.options.map((option) => option.value),
    );

    expect(values).toEqual(
      expect.arrayContaining([
        "UTC",
        "America/New_York",
        "Europe/London",
        "America/Chicago",
      ]),
    );
    expect(groups.every((group) => Array.isArray(group.options))).toBe(true);
    expect(
      groups.flatMap((group) => group.options).every((option) =>
        option.label.startsWith("(UTC"),
      ),
    ).toBe(true);
  });

  it("falls back to UTC timezone group when supported values lookup fails", () => {
    vi.spyOn(Intl, "supportedValuesOf").mockImplementation(() => {
      throw new Error("unsupported");
    });

    const groups = buildTimezoneGroups(new Date("2026-01-15T12:00:00Z"));

    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(1);
    expect(groups[0].options[0].value).toBe("UTC");
  });
});
