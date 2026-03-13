import { afterEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: posthogMock,
}));

import {
  __resetAnalyticsForTests,
  refreshAnalyticsConfig,
  trackFeatureSnapshot,
  trackPageView,
} from "./analytics";

describe("analytics", () => {
  afterEach(() => {
    __resetAnalyticsForTests();
    vi.clearAllMocks();
  });

  it("initializes PostHog and tracks deduplicated page views", async () => {
    const api = {
      get: vi.fn().mockResolvedValue({
        data: {
          enabled: true,
          provider: "posthog",
          api_key: "phc_test",
          host: "https://us.i.posthog.com",
          distinct_id: "inst_test",
        },
      }),
    };

    await expect(refreshAnalyticsConfig(api)).resolves.toBe(true);

    expect(posthogMock.init).toHaveBeenCalledWith("phc_test", {
      api_host: "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
    });
    expect(posthogMock.identify).toHaveBeenCalledWith("inst_test");
    expect(posthogMock.opt_in_capturing).toHaveBeenCalled();

    trackPageView("/admin?tab=users");
    trackPageView("/admin/settings");
    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
    expect(posthogMock.capture).toHaveBeenLastCalledWith("app_page_view", {
      route_key: "/admin",
      page_name: "Admin Control Center",
    });
  });

  it("opts out and stops custom captures when analytics is disabled", async () => {
    const enabledApi = {
      get: vi.fn().mockResolvedValue({
        data: {
          enabled: true,
          api_key: "phc_test",
          host: "https://us.i.posthog.com",
          distinct_id: "inst_test",
        },
      }),
    };

    await refreshAnalyticsConfig(enabledApi);
    trackPageView("/");

    const disabledApi = {
      get: vi.fn().mockResolvedValue({
        data: {
          enabled: false,
        },
      }),
    };

    await expect(refreshAnalyticsConfig(disabledApi)).resolves.toBe(false);
    expect(posthogMock.opt_out_capturing).toHaveBeenCalled();

    trackPageView("/contacts");
    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
  });

  it("tracks feature snapshots once per state signature", async () => {
    const api = {
      get: vi.fn().mockResolvedValue({
        data: {
          enabled: true,
          api_key: "phc_test",
          host: "https://us.i.posthog.com",
          distinct_id: "inst_test",
        },
      }),
    };

    await refreshAnalyticsConfig(api);

    const authState = {
      user: { id: 7 },
      ownerShareManagementEnabled: true,
      davCompatibilityModeEnabled: false,
      contactManagementEnabled: true,
      contactChangeModerationEnabled: false,
      twoFactorEnforcementEnabled: true,
    };

    trackFeatureSnapshot(authState);
    trackFeatureSnapshot(authState);

    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
    expect(posthogMock.capture).toHaveBeenCalledWith(
      "features_enabled_snapshot",
      {
        owner_share_management_enabled: true,
        dav_compatibility_mode_enabled: false,
        contact_management_enabled: true,
        contact_change_moderation_enabled: false,
        two_factor_enforcement_enabled: true,
      },
    );
  });
});
