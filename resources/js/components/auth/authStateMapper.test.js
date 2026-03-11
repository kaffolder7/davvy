import { describe, expect, it } from "vitest";
import {
  buildAuthStateFromPayload,
  createDefaultAuthState,
  createSignedOutAuthState,
  parseSponsorshipConfig,
} from "./authStateMapper";

describe("authStateMapper", () => {
  it("builds default and signed-out auth states", () => {
    expect(createDefaultAuthState()).toEqual({
      loading: true,
      user: null,
      registrationEnabled: false,
      ownerShareManagementEnabled: false,
      davCompatibilityModeEnabled: false,
      contactManagementEnabled: false,
      contactChangeModerationEnabled: false,
      sponsorship: {
        enabled: false,
        links: [],
      },
    });

    expect(createSignedOutAuthState()).toEqual({
      loading: false,
      user: null,
      registrationEnabled: false,
      ownerShareManagementEnabled: false,
      davCompatibilityModeEnabled: false,
      contactManagementEnabled: false,
      contactChangeModerationEnabled: false,
      sponsorship: {
        enabled: false,
        links: [],
      },
    });
  });

  it("parses sponsorship links safely", () => {
    expect(parseSponsorshipConfig(null)).toEqual({
      enabled: false,
      links: [],
    });

    expect(
      parseSponsorshipConfig({
        enabled: true,
        links: [
          { name: "Valid", url: "https://example.com/support" },
          { name: "Missing URL", url: "" },
          { name: "", url: "https://invalid.example.com" },
          { name: "Invalid protocol", url: "ftp://example.com" },
          { name: "Trimmed", url: " https://example.com/trim " },
        ],
      }),
    ).toEqual({
      enabled: true,
      links: [
        { name: "Valid", url: "https://example.com/support" },
        { name: "Trimmed", url: "https://example.com/trim" },
      ],
    });
  });

  it("maps auth payload fields into UI auth state", () => {
    expect(
      buildAuthStateFromPayload(
        {
          registration_enabled: 1,
          owner_share_management_enabled: true,
          dav_compatibility_mode_enabled: 0,
          contact_management_enabled: true,
          contact_change_moderation_enabled: false,
          sponsorship: {
            enabled: true,
            links: [{ name: "Sponsor", url: "https://example.com/sponsor" }],
          },
        },
        { user: { id: 8, role: "admin" } },
      ),
    ).toEqual({
      loading: false,
      user: { id: 8, role: "admin" },
      registrationEnabled: true,
      ownerShareManagementEnabled: true,
      davCompatibilityModeEnabled: false,
      contactManagementEnabled: true,
      contactChangeModerationEnabled: false,
      sponsorship: {
        enabled: true,
        links: [{ name: "Sponsor", url: "https://example.com/sponsor" }],
      },
    });
  });
});
