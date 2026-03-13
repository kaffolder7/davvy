import posthog from "posthog-js";

const ANALYTICS_SETTINGS_ENDPOINT = "/api/settings/analytics";

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  apiKey: null,
  host: null,
  distinctId: null,
});

let activeConfig = DEFAULT_CONFIG;
let initialized = false;
let initializedConfigKey = "";
let lastTrackedPathKey = "";
let lastFeatureSnapshotKey = "";

/**
 * Refreshes analytics runtime config from backend settings.
 *
 * @param {{get: (url: string) => Promise<{data: unknown}>}} apiClient
 * @returns {Promise<boolean>}
 */
export async function refreshAnalyticsConfig(apiClient) {
  if (!apiClient || typeof apiClient.get !== "function") {
    disableAnalytics();
    return false;
  }

  try {
    const { data } = await apiClient.get(ANALYTICS_SETTINGS_ENDPOINT);
    const config = normalizeAnalyticsConfig(data);

    if (!config.enabled) {
      disableAnalytics();
      return false;
    }

    initializePosthog(config);
    activeConfig = config;
    return true;
  } catch {
    disableAnalytics();
    return false;
  }
}

/**
 * Tracks a sanitized app page view event.
 *
 * @param {string} pathname
 * @returns {void}
 */
export function trackPageView(pathname) {
  if (!isClientCaptureEnabled()) {
    return;
  }

  const routeKey = normalizeRouteKey(pathname);
  if (routeKey === lastTrackedPathKey) {
    return;
  }

  lastTrackedPathKey = routeKey;

  posthog.capture("app_page_view", {
    route_key: routeKey,
    page_name: routeNameFromKey(routeKey),
  });
}

/**
 * Tracks a deduplicated feature flag snapshot for authenticated users.
 *
 * @param {unknown} authState
 * @returns {void}
 */
export function trackFeatureSnapshot(authState) {
  if (!isClientCaptureEnabled()) {
    return;
  }

  if (!authState || typeof authState !== "object" || !authState.user) {
    return;
  }

  const payload = {
    owner_share_management_enabled: Boolean(authState.ownerShareManagementEnabled),
    dav_compatibility_mode_enabled: Boolean(authState.davCompatibilityModeEnabled),
    contact_management_enabled: Boolean(authState.contactManagementEnabled),
    contact_change_moderation_enabled: Boolean(
      authState.contactChangeModerationEnabled,
    ),
    two_factor_enforcement_enabled: Boolean(authState.twoFactorEnforcementEnabled),
  };

  const snapshotKey = JSON.stringify(payload);
  if (snapshotKey === lastFeatureSnapshotKey) {
    return;
  }

  lastFeatureSnapshotKey = snapshotKey;
  posthog.capture("features_enabled_snapshot", payload);
}

/**
 * Resets module state for deterministic tests.
 *
 * @returns {void}
 */
export function __resetAnalyticsForTests() {
  activeConfig = DEFAULT_CONFIG;
  initialized = false;
  initializedConfigKey = "";
  lastTrackedPathKey = "";
  lastFeatureSnapshotKey = "";
}

/**
 * Applies opt-out when analytics is disabled.
 *
 * @returns {void}
 */
function disableAnalytics() {
  if (typeof posthog.opt_out_capturing === "function") {
    posthog.opt_out_capturing();
  }

  activeConfig = DEFAULT_CONFIG;
  lastTrackedPathKey = "";
  lastFeatureSnapshotKey = "";
}

/**
 * Initializes PostHog runtime and reenables capturing.
 *
 * @param {{enabled:true,apiKey:string,host:string,distinctId:string|null}} config
 * @returns {void}
 */
function initializePosthog(config) {
  const configKey = buildConfigKey(config);

  if (!initialized || initializedConfigKey !== configKey) {
    posthog.init(config.apiKey, {
      api_host: config.host,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
    });
    initialized = true;
    initializedConfigKey = configKey;
  }

  if (config.distinctId) {
    posthog.identify(config.distinctId);
  }

  if (typeof posthog.opt_in_capturing === "function") {
    posthog.opt_in_capturing();
  }
}

/**
 * Checks if custom client captures should be emitted.
 *
 * @returns {boolean}
 */
function isClientCaptureEnabled() {
  return activeConfig.enabled;
}

/**
 * Normalizes analytics bootstrap config.
 *
 * @param {unknown} raw
 * @returns {{enabled:false,apiKey:null,host:null,distinctId:null}|{enabled:true,apiKey:string,host:string,distinctId:string|null}}
 */
function normalizeAnalyticsConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_CONFIG;
  }

  const enabled = Boolean(raw.enabled);
  const apiKey = String(raw.api_key ?? "").trim();
  const host = String(raw.host ?? "").trim();
  const distinctId = String(raw.distinct_id ?? "").trim();

  if (!enabled || apiKey === "" || host === "") {
    return DEFAULT_CONFIG;
  }

  return {
    enabled: true,
    apiKey,
    host,
    distinctId: distinctId === "" ? null : distinctId,
  };
}

/**
 * Creates a stable key for a client config snapshot.
 *
 * @param {{enabled:true,apiKey:string,host:string,distinctId:string|null}} config
 * @returns {string}
 */
function buildConfigKey(config) {
  return [config.apiKey, config.host, config.distinctId ?? ""].join("|");
}

/**
 * Normalizes paths into a stable route key set.
 *
 * @param {string} pathname
 * @returns {string}
 */
function normalizeRouteKey(pathname) {
  const normalized = String(pathname || "/").trim().split("?")[0] || "/";

  if (normalized === "/" || normalized === "") {
    return "/";
  }

  if (normalized.startsWith("/contacts")) {
    return "/contacts";
  }

  if (normalized.startsWith("/admin")) {
    return "/admin";
  }

  if (normalized.startsWith("/review-queue")) {
    return "/review-queue";
  }

  if (normalized.startsWith("/profile")) {
    return "/profile";
  }

  if (normalized.startsWith("/login/2fa")) {
    return "/login/2fa";
  }

  if (normalized.startsWith("/login")) {
    return "/login";
  }

  if (normalized.startsWith("/register")) {
    return "/register";
  }

  if (normalized.startsWith("/verify-email")) {
    return "/verify-email";
  }

  if (normalized.startsWith("/invite")) {
    return "/invite";
  }

  return "/other";
}

/**
 * Returns a display label for a route key.
 *
 * @param {string} routeKey
 * @returns {string}
 */
function routeNameFromKey(routeKey) {
  switch (routeKey) {
    case "/":
      return "Dashboard";
    case "/contacts":
      return "Contacts";
    case "/admin":
      return "Admin Control Center";
    case "/review-queue":
      return "Review Queue";
    case "/profile":
      return "Profile";
    case "/login":
      return "Login";
    case "/login/2fa":
      return "Login 2FA";
    case "/register":
      return "Register";
    case "/verify-email":
      return "Verify Email";
    case "/invite":
      return "Invite Accept";
    default:
      return "Other";
  }
}
