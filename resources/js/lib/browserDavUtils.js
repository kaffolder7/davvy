/**
 * Builds a lowercase filesystem-safe file stem for client-side exports.
 *
 * @param {unknown} value
 * @param {string} [fallback='export']
 * @returns {string}
 */
export function fileStem(value, fallback = "export") {
  const stem = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "");

  return stem || fallback;
}

/**
 * Parses a filename from a Content-Disposition response header.
 *
 * @param {string|null} header
 * @returns {string|null}
 */
export function parseDispositionFilename(header) {
  if (!header) {
    return null;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const standardMatch = header.match(/filename="?([^";]+)"?/i);
  return standardMatch?.[1] ?? null;
}

/**
 * Copies text to the clipboard using the async API with a legacy fallback.
 *
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function copyTextToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("copy-failed");
  }
}

/**
 * Builds an absolute DAV collection URL for a calendar or address book resource.
 *
 * @param {'calendar'|'addressbook'} resourceKind
 * @param {string|number} principalId
 * @param {string} resourceUri
 * @returns {string}
 */
export function buildDavCollectionUrl(resourceKind, principalId, resourceUri) {
  const collectionRoot =
    resourceKind === "calendar" ? "calendars" : "addressbooks";
  const normalizedUri = String(resourceUri ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return `${window.location.origin}/dav/${collectionRoot}/${principalId}/${normalizedUri}`;
}

/**
 * Downloads an export file and triggers a browser save dialog.
 *
 * @param {string} url
 * @param {string} fallbackName
 * @returns {Promise<void>}
 */
export async function downloadExport(url, fallbackName) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!response.ok) {
    let message = "Unable to download export.";

    try {
      const payload = await response.json();
      if (typeof payload?.message === "string" && payload.message) {
        message = payload.message;
      }
    } catch {
      // ignore parsing issues and use fallback message
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const fileName =
    parseDispositionFilename(response.headers.get("content-disposition")) ||
    fallbackName;

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}
