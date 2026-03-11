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

export function queueOperationLabel(operation) {
  return operation === "delete" ? "Delete" : "Update";
}
