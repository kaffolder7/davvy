/**
 * Formats a queue timestamp for local display.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function formatQueueTimestamp(value) {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "n/a";
  }

  return parsed.toLocaleString();
}

/**
 * Maps a queue status code to its user-facing label.
 *
 * @param {string|null|undefined} status
 * @returns {string}
 */
export function queueStatusLabel(status) {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved (awaiting others)";
    case "manual_merge_needed":
      return "Manual Merge Needed";
    case "applied":
      return "Applied";
    case "denied":
      return "Denied";
    default:
      return status || "Unknown";
  }
}

/**
 * Maps queue operation type to a user-facing label.
 *
 * @param {string|null|undefined} operation
 * @returns {string}
 */
export function queueOperationLabel(operation) {
  return operation === "delete" ? "Delete" : "Update";
}
