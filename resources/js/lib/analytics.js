const OPENPANEL_SCRIPT_ID = "davvy-openpanel-script";
const BLOCKED_PROPERTY_TOKENS = [
  "email",
  "name",
  "phone",
  "address",
  "password",
  "token",
  "secret",
];

const DEFAULT_ANALYTICS_CONFIG = Object.freeze({
  enabled: false,
  clientId: null,
  apiUrl: null,
  scriptUrl: null,
  profileId: null,
});

let currentConfig = DEFAULT_ANALYTICS_CONFIG;
let initializedConfigKey = "";
let sessionTrackedConfigKey = "";
let lastTrackedPath = "";
let lastTrackedFeatureKey = "";

/**
 * Configures OpenPanel runtime from auth bootstrap config.
 *
 * @param {unknown} rawConfig
 * @returns {boolean}
 */
export function configureAnalytics(rawConfig) {
  const config = normalizeAnalyticsConfig(rawConfig);
  currentConfig = config;

  if (!config.enabled) {
    initializedConfigKey = "";
    sessionTrackedConfigKey = "";
    lastTrackedPath = "";
    lastTrackedFeatureKey = "";

    return false;
  }

  const configKey = buildConfigKey(config);
  if (initializedConfigKey !== configKey) {
    ensureOpenPanelQueueStub();
    ensureOpenPanelScript(config.scriptUrl);

    window.op("init", {
      clientId: config.clientId,
      apiUrl: config.apiUrl,
      disabled: false,
      trackScreenViews: false,
      trackOutgoingLinks: false,
      trackAttributes: false,
      filter: eventFilter,
    });

    if (config.profileId) {
      window.op("identify", {
        profileId: config.profileId,
      });
    }

    initializedConfigKey = configKey;
  }

  if (sessionTrackedConfigKey !== configKey) {
    const path = sanitizePath(window.location?.pathname ?? "/");
    trackClientEvent("ui.session_started", {
      path,
    });
    sessionTrackedConfigKey = configKey;
  }

  return true;
}

/**
 * Tracks a SPA screen-view event with sanitized route path.
 *
 * @param {string} pathname
 * @returns {void}
 */
export function trackPageView(pathname) {
  if (!currentConfig.enabled) {
    return;
  }

  const path = sanitizePath(pathname);
  if (path === lastTrackedPath) {
    return;
  }

  lastTrackedPath = path;
  trackClientEvent("screen_view", {
    __path: path,
  });

  const featureKey = featureKeyFromPath(path);
  if (featureKey && featureKey !== lastTrackedFeatureKey) {
    lastTrackedFeatureKey = featureKey;
    trackClientEvent("ui.feature_view", {
      feature_key: featureKey,
      path,
    });
  }
}

/**
 * Tracks a named UI feature interaction event.
 *
 * @param {string} featureKey
 * @param {string} [action]
 * @param {Record<string, unknown>} [properties]
 * @returns {void}
 */
export function trackFeatureInteraction(
  featureKey,
  action = "interact",
  properties = {},
) {
  const normalizedFeatureKey = normalizeFeatureKey(featureKey);
  if (!normalizedFeatureKey) {
    return;
  }

  const normalizedAction = normalizeFeatureAction(action);

  trackClientEvent("ui.feature_interaction", {
    feature_key: normalizedFeatureKey,
    action: normalizedAction,
    ...properties,
  });
}

/**
 * Tracks a custom client-side analytics event.
 *
 * @param {string} name
 * @param {Record<string, unknown>} [properties]
 * @returns {void}
 */
export function trackClientEvent(name, properties = {}) {
  if (!currentConfig.enabled || typeof window === "undefined") {
    return;
  }

  if (typeof window.op !== "function") {
    return;
  }

  const eventName = String(name || "").trim();
  if (eventName === "") {
    return;
  }

  const sanitizedProperties = sanitizeProperties(properties);
  if (!eventFilter({ name: eventName, properties: sanitizedProperties })) {
    return;
  }

  window.op("track", eventName, sanitizedProperties);
}

/**
 * Resets module state for deterministic tests.
 *
 * @returns {void}
 */
export function __resetAnalyticsForTests() {
  currentConfig = DEFAULT_ANALYTICS_CONFIG;
  initializedConfigKey = "";
  sessionTrackedConfigKey = "";
  lastTrackedPath = "";
  lastTrackedFeatureKey = "";

  if (typeof window !== "undefined" && window.op && Array.isArray(window.op.q)) {
    delete window.op;
  }

  const existing = document.getElementById(OPENPANEL_SCRIPT_ID);
  if (existing?.parentNode) {
    existing.parentNode.removeChild(existing);
  }
}

/**
 * Normalizes bootstrap analytics config from auth payload.
 *
 * @param {unknown} raw
 * @returns {{enabled:boolean,clientId:string|null,apiUrl:string|null,scriptUrl:string|null,profileId:string|null}}
 */
function normalizeAnalyticsConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_ANALYTICS_CONFIG;
  }

  const enabled = Boolean(raw.enabled);
  const clientId = String(raw.clientId ?? "").trim();
  const apiUrl = String(raw.apiUrl ?? "").trim();
  const scriptUrl = String(raw.scriptUrl ?? "").trim();
  const profileId = String(raw.profileId ?? "").trim();

  if (!enabled || clientId === "" || apiUrl === "" || scriptUrl === "") {
    return DEFAULT_ANALYTICS_CONFIG;
  }

  return {
    enabled: true,
    clientId,
    apiUrl,
    scriptUrl,
    profileId: profileId === "" ? null : profileId,
  };
}

/**
 * Builds a deterministic config key for dedupe checks.
 *
 * @param {{clientId:string,apiUrl:string,scriptUrl:string,profileId:string|null}} config
 * @returns {string}
 */
function buildConfigKey(config) {
  return [config.clientId, config.apiUrl, config.scriptUrl, config.profileId ?? ""].join("|");
}

/**
 * Creates a queueing OpenPanel stub until script hydration completes.
 *
 * @returns {void}
 */
function ensureOpenPanelQueueStub() {
  if (typeof window === "undefined" || typeof window.op === "function") {
    return;
  }

  const queue = [];
  const queuedFunction = (...args) => {
    queue.push(args);
  };

  queuedFunction.q = queue;
  window.op = queuedFunction;
}

/**
 * Injects the OpenPanel browser script once per page load.
 *
 * @param {string} scriptUrl
 * @returns {void}
 */
function ensureOpenPanelScript(scriptUrl) {
  if (typeof document === "undefined") {
    return;
  }

  const existing = document.getElementById(OPENPANEL_SCRIPT_ID);
  if (existing) {
    return;
  }

  const script = document.createElement("script");
  script.id = OPENPANEL_SCRIPT_ID;
  script.src = scriptUrl;
  script.async = true;
  script.defer = true;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
}

/**
 * Removes disallowed keys/values from event properties.
 *
 * @param {Record<string, unknown>} properties
 * @returns {Record<string, string|number|boolean>}
 */
function sanitizeProperties(properties) {
  const sanitized = {};

  Object.entries(properties || {}).forEach(([rawKey, value]) => {
    const key = String(rawKey || "").trim();
    if (key === "" || hasBlockedToken(key)) {
      return;
    }

    if (typeof value === "boolean" || typeof value === "number") {
      sanitized[key] = value;

      return;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "" || looksLikeEmail(trimmed)) {
        return;
      }

      sanitized[key] = trimmed.slice(0, 160);
    }
  });

  return sanitized;
}

/**
 * Determines whether an event is safe to send.
 *
 * @param {{name?: unknown,properties?: Record<string, unknown>}} event
 * @returns {boolean}
 */
function eventFilter(event) {
  const name = String(event?.name ?? "").trim();
  if (name === "") {
    return false;
  }

  const properties = event && typeof event === "object" ? event.properties : {};
  if (!properties || typeof properties !== "object") {
    return true;
  }

  return Object.keys(properties).every((key) => !hasBlockedToken(key));
}

/**
 * Sanitizes route paths before client analytics transport.
 *
 * @param {string} inputPath
 * @returns {string}
 */
function sanitizePath(inputPath) {
  const pathname = String(inputPath || "/").split("?")[0].split("#")[0];
  const segments = pathname.split("/").map((segment) => {
    const normalized = segment.trim();
    if (normalized === "") {
      return "";
    }

    if (/^\d+$/.test(normalized) || /^[a-f0-9-]{8,}$/i.test(normalized)) {
      return ":id";
    }

    return normalized.slice(0, 64);
  });

  const rebuilt = segments.join("/");
  return rebuilt.startsWith("/") ? rebuilt : `/${rebuilt}`;
}

/**
 * Maps a sanitized route path to a stable feature key.
 *
 * @param {string} path
 * @returns {string|null}
 */
function featureKeyFromPath(path) {
  const normalizedPath = String(path || "/").split("?")[0].split("#")[0];

  if (normalizedPath === "/") {
    return "dashboard";
  }

  if (normalizedPath.startsWith("/admin")) {
    return "admin_control_center";
  }

  if (normalizedPath.startsWith("/contacts")) {
    return "contacts";
  }

  if (normalizedPath.startsWith("/review-queue")) {
    return "review_queue";
  }

  if (normalizedPath.startsWith("/profile")) {
    return "profile_security";
  }

  if (normalizedPath.startsWith("/login")) {
    return "auth_login";
  }

  if (normalizedPath.startsWith("/register")) {
    return "auth_register";
  }

  if (normalizedPath.startsWith("/verify-email")) {
    return "auth_verify_email";
  }

  if (normalizedPath.startsWith("/invite")) {
    return "auth_invite_accept";
  }

  return null;
}

/**
 * Returns a safe feature key for analytics transport.
 *
 * @param {unknown} featureKey
 * @returns {string|null}
 */
function normalizeFeatureKey(featureKey) {
  const value = String(featureKey ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 64);

  return value === "" ? null : value;
}

/**
 * Returns a safe feature action for analytics transport.
 *
 * @param {unknown} action
 * @returns {string}
 */
function normalizeFeatureAction(action) {
  const value = String(action ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 32);

  return value === "" ? "interact" : value;
}

/**
 * Determines whether a key contains blocked sensitive tokens.
 *
 * @param {string} value
 * @returns {boolean}
 */
function hasBlockedToken(value) {
  const normalized = String(value || "").toLowerCase();
  return BLOCKED_PROPERTY_TOKENS.some((token) => normalized.includes(token));
}

/**
 * Determines whether a value appears to be an email address.
 *
 * @param {string} value
 * @returns {boolean}
 */
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
