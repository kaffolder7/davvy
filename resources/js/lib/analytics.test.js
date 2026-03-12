import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAnalyticsForTests,
  configureAnalytics,
  trackClientEvent,
  trackPageView,
} from "./analytics";

describe("analytics", () => {
  beforeEach(() => {
    window.op = vi.fn();
    history.replaceState({}, "", "/");
    __resetAnalyticsForTests();
    window.op = vi.fn();
  });

  afterEach(() => {
    __resetAnalyticsForTests();
  });

  it("does not initialize or track when disabled", () => {
    const enabled = configureAnalytics({
      enabled: false,
      clientId: "ignored",
      apiUrl: "https://analytics.example.test",
      scriptUrl: "https://analytics.example.test/op1.js",
    });

    trackPageView("/dashboard");
    trackClientEvent("custom_event", { path: "/dashboard" });

    expect(enabled).toBe(false);
    expect(window.op).not.toHaveBeenCalled();
    expect(document.getElementById("davvy-openpanel-script")).toBeNull();
  });

  it("initializes openpanel and sends one session event", () => {
    const enabled = configureAnalytics({
      enabled: true,
      clientId: "client_123",
      apiUrl: "https://analytics.example.test",
      scriptUrl: "https://analytics.example.test/op1.js",
      profileId: "hashed-user-id",
    });

    expect(enabled).toBe(true);
    expect(window.op).toHaveBeenCalledWith(
      "init",
      expect.objectContaining({
        clientId: "client_123",
        apiUrl: "https://analytics.example.test",
        trackScreenViews: false,
      }),
    );
    expect(window.op).toHaveBeenCalledWith("identify", {
      profileId: "hashed-user-id",
    });
    expect(window.op).toHaveBeenCalledWith("track", "session_started", {
      path: "/",
    });

    const script = document.getElementById("davvy-openpanel-script");
    expect(script).not.toBeNull();
    expect(script?.getAttribute("src")).toBe("https://analytics.example.test/op1.js");
  });

  it("tracks sanitized page views once per path", () => {
    configureAnalytics({
      enabled: true,
      clientId: "client_123",
      apiUrl: "https://analytics.example.test",
      scriptUrl: "https://analytics.example.test/op1.js",
      profileId: null,
    });
    window.op.mockClear();

    trackPageView("/contacts/123?foo=bar");
    trackPageView("/contacts/123");

    expect(window.op).toHaveBeenCalledTimes(1);
    expect(window.op).toHaveBeenCalledWith("track", "page_view", {
      path: "/contacts/:id",
    });
  });
});

