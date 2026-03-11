import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDavCollectionUrl,
  copyTextToClipboard,
  downloadExport,
  fileStem,
  parseDispositionFilename,
} from "./browserDavUtils";

const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;
const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  vi.restoreAllMocks();

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });

  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: originalExecCommand,
  });

  globalThis.fetch = originalFetch;

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: originalRevokeObjectURL,
  });
});

describe("browserDavUtils", () => {
  it("normalizes file stems and falls back when blank", () => {
    expect(fileStem("  Team Calendar  ")).toBe("team-calendar");
    expect(fileStem("___", "backup")).toBe("backup");
  });

  it("parses content-disposition filenames", () => {
    expect(
      parseDispositionFilename("attachment; filename*=UTF-8''davvy%20export.zip"),
    ).toBe("davvy export.zip");
    expect(parseDispositionFilename('attachment; filename="backup.zip"')).toBe(
      "backup.zip",
    );
    expect(parseDispositionFilename(null)).toBeNull();
  });

  it("builds DAV collection URLs for calendars and address books", () => {
    expect(buildDavCollectionUrl("calendar", 9, "/work/")).toBe(
      `${window.location.origin}/dav/calendars/9/work`,
    );
    expect(buildDavCollectionUrl("address-book", 3, "family")).toBe(
      `${window.location.origin}/dav/addressbooks/3/family`,
    );
  });

  it("copies via navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await copyTextToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand copy path and throws when copy fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    const execSuccess = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execSuccess,
    });

    await copyTextToClipboard("fallback");
    expect(execSuccess).toHaveBeenCalledWith("copy");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);

    const execFail = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execFail,
    });

    await expect(copyTextToClipboard("fail")).rejects.toThrow("copy-failed");
  });

  it("downloads export blobs and names file from response headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["x"], { type: "text/plain" })),
      headers: {
        get: vi
          .fn()
          .mockReturnValue('attachment; filename="davvy-export.zip"'),
      },
    });
    globalThis.fetch = fetchMock;

    const createObjectURL = vi.fn().mockReturnValue("blob:davvy");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    await downloadExport("/api/exports/calendars", "fallback.zip");

    expect(fetchMock).toHaveBeenCalledWith("/api/exports/calendars", {
      credentials: "include",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:davvy");
  });

  it("throws API message for failed export requests", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: "Export unavailable." }),
    });

    await expect(downloadExport("/api/exports/calendars", "fallback.zip")).rejects.toThrow(
      "Export unavailable.",
    );
  });
});
