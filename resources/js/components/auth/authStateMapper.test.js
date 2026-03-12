import { describe, expect, it } from "vitest";
import {
  buildAuthStateFromPayload,
  createDefaultAuthState,
  parseAnalyticsConfig,
  createSignedOutAuthState,
  parseSponsorshipConfig,
} from "./authStateMapper";

describe("authStateMapper", () => {
  it("builds default and signed-out auth states", () => {
    expect(createDefaultAuthState()).toEqual({
      loading: true,
      user: null,
      registrationEnabled: false,
      registrationApprovalRequired: false,
      emailVerificationRequired: false,
      ownerShareManagementEnabled: false,
      davCompatibilityModeEnabled: false,
      contactManagementEnabled: false,
      contactChangeModerationEnabled: false,
      twoFactorEnforcementEnabled: false,
      twoFactorGracePeriodDays: 14,
      twoFactorEnabled: false,
      twoFactorSetupRequired: false,
      twoFactorMandated: false,
      twoFactorGraceExpiresAt: null,
      analytics: {
        enabled: false,
        clientId: null,
        apiUrl: null,
        scriptUrl: null,
        profileId: null,
      },
      sponsorship: {
        enabled: false,
        links: [],
      },
    });

    expect(createSignedOutAuthState()).toEqual({
      loading: false,
      user: null,
      registrationEnabled: false,
      registrationApprovalRequired: false,
      emailVerificationRequired: false,
      ownerShareManagementEnabled: false,
      davCompatibilityModeEnabled: false,
      contactManagementEnabled: false,
      contactChangeModerationEnabled: false,
      twoFactorEnforcementEnabled: false,
      twoFactorGracePeriodDays: 14,
      twoFactorEnabled: false,
      twoFactorSetupRequired: false,
      twoFactorMandated: false,
      twoFactorGraceExpiresAt: null,
      analytics: {
        enabled: false,
        clientId: null,
        apiUrl: null,
        scriptUrl: null,
        profileId: null,
      },
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

  it("parses analytics config safely", () => {
    expect(parseAnalyticsConfig(null)).toEqual({
      enabled: false,
      clientId: null,
      apiUrl: null,
      scriptUrl: null,
      profileId: null,
    });

    expect(
      parseAnalyticsConfig({
        enabled: true,
        client_id: "client_123",
        api_url: "https://openpanel.example.test",
        script_url: "https://openpanel.example.test/op1.js",
        profile_id: "hashed_user_id",
      }),
    ).toEqual({
      enabled: true,
      clientId: "client_123",
      apiUrl: "https://openpanel.example.test",
      scriptUrl: "https://openpanel.example.test/op1.js",
      profileId: "hashed_user_id",
    });

    expect(
      parseAnalyticsConfig({
        enabled: true,
        client_id: "",
        api_url: "https://openpanel.example.test",
      }),
    ).toEqual({
      enabled: false,
      clientId: null,
      apiUrl: null,
      scriptUrl: null,
      profileId: null,
    });
  });

  it("maps auth payload fields into UI auth state", () => {
    expect(
      buildAuthStateFromPayload(
        {
          registration_enabled: 1,
          registration_approval_required: 1,
          email_verification_required: 1,
          owner_share_management_enabled: true,
          dav_compatibility_mode_enabled: 0,
          contact_management_enabled: true,
          contact_change_moderation_enabled: false,
          two_factor_enforcement_enabled: true,
          two_factor_grace_period_days: 10,
          two_factor_enabled: true,
          two_factor_setup_required: false,
          two_factor_mandated: true,
          two_factor_grace_expires_at: "2026-03-20T00:00:00Z",
          analytics: {
            enabled: true,
            client_id: "client_abc",
            api_url: "https://openpanel.example.test",
            script_url: "https://openpanel.example.test/op1.js",
            profile_id: "hashed-profile",
          },
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
      registrationApprovalRequired: true,
      emailVerificationRequired: true,
      ownerShareManagementEnabled: true,
      davCompatibilityModeEnabled: false,
      contactManagementEnabled: true,
      contactChangeModerationEnabled: false,
      twoFactorEnforcementEnabled: true,
      twoFactorGracePeriodDays: 10,
      twoFactorEnabled: true,
      twoFactorSetupRequired: false,
      twoFactorMandated: true,
      twoFactorGraceExpiresAt: "2026-03-20T00:00:00Z",
      analytics: {
        enabled: true,
        clientId: "client_abc",
        apiUrl: "https://openpanel.example.test",
        scriptUrl: "https://openpanel.example.test/op1.js",
        profileId: "hashed-profile",
      },
      sponsorship: {
        enabled: true,
        links: [{ name: "Sponsor", url: "https://example.com/sponsor" }],
      },
    });
  });
});
