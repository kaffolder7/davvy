export const MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS = 6000;
export const BACKUP_RUN_TOAST_AUTO_HIDE_MS = 3200;
export const BACKUP_DRAWER_ANIMATION_MS = 220;
export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];
export const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];
export const RECOMMENDED_BACKUP_RETENTION = {
  daily: 7,
  weekly: 4,
  monthly: 12,
  yearly: 3,
};

function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");

  return `UTC${sign}${hours}:${minutes}`;
}

function timezoneOffsetMinutes(timeZone, referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(referenceDate);
  const values = Object.create(null);
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUtcTimestamp = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((asUtcTimestamp - referenceDate.getTime()) / 60000);
}

function formatTimezoneDisplayName(timeZone) {
  return timeZone.replace(/_/g, " ");
}

/**
 * Builds grouped timezone options sorted by offset then region.
 *
 * @param {Date} [referenceDate=new Date()]
 * @returns {Array<{region: string, minOffset: number, options: Array<{value: string, offset: number, region: string, label: string}>}>}
 */
export function buildTimezoneGroups(referenceDate = new Date()) {
  let names = ["UTC"];

  if (typeof Intl?.supportedValuesOf === "function") {
    try {
      names = Array.from(
        new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]),
      );
    } catch {
      names = ["UTC"];
    }
  }

  const options = names
    .map((timeZone) => {
      try {
        const offset = timezoneOffsetMinutes(timeZone, referenceDate);
        return {
          value: timeZone,
          offset,
          region: timeZone.includes("/") ? timeZone.split("/")[0] : "Global",
          label: `(${formatUtcOffset(offset)}) ${formatTimezoneDisplayName(
            timeZone,
          )}`,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.offset - b.offset ||
        a.region.localeCompare(b.region) ||
        a.value.localeCompare(b.value),
    );

  const map = new Map();
  for (const option of options) {
    if (!map.has(option.region)) {
      map.set(option.region, []);
    }

    map.get(option.region).push(option);
  }

  return Array.from(map.entries())
    .map(([region, values]) => ({
      region,
      minOffset: values[0]?.offset ?? 0,
      options: values,
    }))
    .sort(
      (a, b) => a.minOffset - b.minOffset || a.region.localeCompare(b.region),
    );
}

/**
 * Parses comma/newline-separated HH:mm schedule values into sorted unique times.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseBackupScheduleTimes(value) {
  const parsed = String(value ?? "")
    .split(/[,\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item));

  return Array.from(new Set(parsed)).sort();
}

/**
 * Checks whether a retention config matches the recommended preset.
 *
 * @param {{daily: unknown, weekly: unknown, monthly: unknown, yearly: unknown}} retention
 * @returns {boolean}
 */
export function isRecommendedBackupRetention({
  daily,
  weekly,
  monthly,
  yearly,
}) {
  return (
    Number(daily) === RECOMMENDED_BACKUP_RETENTION.daily &&
    Number(weekly) === RECOMMENDED_BACKUP_RETENTION.weekly &&
    Number(monthly) === RECOMMENDED_BACKUP_RETENTION.monthly &&
    Number(yearly) === RECOMMENDED_BACKUP_RETENTION.yearly
  );
}

function normalizeBackupConfigSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    backupEnabled: !!snapshot.backupEnabled,
    backupLocalEnabled: !!snapshot.backupLocalEnabled,
    backupLocalPath: String(snapshot.backupLocalPath ?? ""),
    backupS3Enabled: !!snapshot.backupS3Enabled,
    backupS3Disk: String(snapshot.backupS3Disk ?? ""),
    backupS3Prefix: String(snapshot.backupS3Prefix ?? ""),
    backupTimezone: String(snapshot.backupTimezone ?? ""),
    backupScheduleTimes: parseBackupScheduleTimes(
      snapshot.backupScheduleTimes,
    ).join(","),
    backupWeeklyDay: Number(snapshot.backupWeeklyDay ?? 0),
    backupMonthlyDay: Number(snapshot.backupMonthlyDay ?? 1),
    backupYearlyMonth: Number(snapshot.backupYearlyMonth ?? 1),
    backupYearlyDay: Number(snapshot.backupYearlyDay ?? 1),
    backupRetentionDaily: Number(snapshot.backupRetentionDaily ?? 0),
    backupRetentionWeekly: Number(snapshot.backupRetentionWeekly ?? 0),
    backupRetentionMonthly: Number(snapshot.backupRetentionMonthly ?? 0),
    backupRetentionYearly: Number(snapshot.backupRetentionYearly ?? 0),
    backupRetentionPreset: String(snapshot.backupRetentionPreset ?? ""),
  };
}

/**
 * Compares two backup config snapshots by normalized persisted fields.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function areBackupConfigSnapshotsEqual(left, right) {
  const normalizedLeft = normalizeBackupConfigSnapshot(left);
  const normalizedRight = normalizeBackupConfigSnapshot(right);

  if (!normalizedLeft || !normalizedRight) {
    return normalizedLeft === normalizedRight;
  }

  for (const key of Object.keys(normalizedLeft)) {
    if (normalizedLeft[key] !== normalizedRight[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Formats admin timestamps used in status and backup history displays.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function formatAdminTimestamp(value) {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Invalid timestamp";
  }

  return parsed.toLocaleString();
}
