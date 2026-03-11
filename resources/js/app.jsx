import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import AdminFeatureToggleComponent from "./components/admin/AdminFeatureToggle";
import AdminPageComponent from "./components/admin/AdminPage";
import CopyableResourceUriComponent from "./components/common/CopyableResourceUri";
import FieldComponent from "./components/common/Field";
import InfoCardComponent from "./components/common/InfoCard";
import { api, extractError } from "./lib/api";
import AddressBookMilestoneControlsComponent from "./components/contacts/AddressBookMilestoneControls";
import AddressEditorComponent from "./components/contacts/AddressEditor";
import ContactEditorHideFieldModalComponent from "./components/contacts/ContactEditorHideFieldModal";
import ContactsListSidebarComponent from "./components/contacts/ContactsListSidebar";
import DateEditorComponent from "./components/contacts/DateEditor";
import LabeledValueEditorComponent from "./components/contacts/LabeledValueEditor";
import RowReorderControls from "./components/contacts/RowReorderControls";
import RelatedNameEditorComponent from "./components/contacts/RelatedNameEditor";
import { useRowReorder } from "./components/contacts/useRowReorder";
import ResourcePanelComponent from "./components/dashboard/ResourcePanel";
import DashboardPageComponent from "./components/dashboard/DashboardPage";
import ContactChangeQueuePageComponent from "./components/queue/ContactChangeQueuePage";
import AppShellComponent from "./components/layout/AppShell";
import ProfilePageComponent from "./components/profile/ProfilePage";

function fileStem(value, fallback = "export") {
  const stem = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "");

  return stem || fallback;
}

function parseDispositionFilename(header) {
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

async function copyTextToClipboard(value) {
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

function buildDavCollectionUrl(resourceKind, principalId, resourceUri) {
  const collectionRoot =
    resourceKind === "calendar" ? "calendars" : "addressbooks";
  const normalizedUri = String(resourceUri ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return `${window.location.origin}/dav/${collectionRoot}/${principalId}/${normalizedUri}`;
}

async function downloadExport(url, fallbackName) {
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

const THEME_STORAGE_KEY = "davvy-theme";
const VALID_THEMES = new Set(["system", "light", "dark"]);
const MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS = 6000;
const BACKUP_RUN_TOAST_AUTO_HIDE_MS = 3200;
const BACKUP_DRAWER_ANIMATION_MS = 220;
const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];
const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];
const RECOMMENDED_BACKUP_RETENTION = {
  daily: 7,
  weekly: 4,
  monthly: 12,
  yearly: 3,
};

function parseSponsorshipConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object") {
    return {
      enabled: false,
      links: [],
    };
  }

  const links = Array.isArray(rawConfig.links)
    ? rawConfig.links
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          name: String(item.name ?? "").trim(),
          url: String(item.url ?? "").trim(),
        }))
        .filter(
          (item) => item.name !== "" && /^https?:\/\/\S+$/i.test(item.url),
        )
    : [];

  return {
    enabled: Boolean(rawConfig.enabled) && links.length > 0,
    links,
  };
}

function sponsorshipFaviconUrl(targetUrl) {
  try {
    const host = new URL(targetUrl).hostname.replace(/^www\./i, "");
    return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : "";
  } catch {
    return "";
  }
}

function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");

  return `UTC${sign}${hours}:${minutes}`;
}

function timezoneOffsetMinutes(timeZone, referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(referenceDate);
  const values = Object.create(null);
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUtcTimestamp = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((asUtcTimestamp - referenceDate.getTime()) / 60000);
}

function formatTimezoneDisplayName(timeZone) {
  return timeZone.replace(/_/g, " ");
}

function buildTimezoneGroups(referenceDate = new Date()) {
  let names = ["UTC"];

  if (typeof Intl?.supportedValuesOf === "function") {
    try {
      names = Array.from(
        new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]),
      );
    } catch {
      names = ["UTC"];
    }
  }

  const options = names
    .map((timeZone) => {
      try {
        const offset = timezoneOffsetMinutes(timeZone, referenceDate);
        return {
          value: timeZone,
          offset,
          region: timeZone.includes("/") ? timeZone.split("/")[0] : "Global",
          label: `(${formatUtcOffset(offset)}) ${formatTimezoneDisplayName(
            timeZone,
          )}`,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.offset - b.offset ||
        a.region.localeCompare(b.region) ||
        a.value.localeCompare(b.value),
    );

  const map = new Map();
  for (const option of options) {
    if (!map.has(option.region)) {
      map.set(option.region, []);
    }

    map.get(option.region).push(option);
  }

  return Array.from(map.entries())
    .map(([region, values]) => ({
      region,
      minOffset: values[0]?.offset ?? 0,
      options: values,
    }))
    .sort(
      (a, b) => a.minOffset - b.minOffset || a.region.localeCompare(b.region),
    );
}

function parseBackupScheduleTimes(value) {
  const parsed = String(value ?? "")
    .split(/[,\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item));

  return Array.from(new Set(parsed)).sort();
}

function isRecommendedBackupRetention({ daily, weekly, monthly, yearly }) {
  return (
    Number(daily) === RECOMMENDED_BACKUP_RETENTION.daily &&
    Number(weekly) === RECOMMENDED_BACKUP_RETENTION.weekly &&
    Number(monthly) === RECOMMENDED_BACKUP_RETENTION.monthly &&
    Number(yearly) === RECOMMENDED_BACKUP_RETENTION.yearly
  );
}

function normalizeBackupConfigSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    backupEnabled: !!snapshot.backupEnabled,
    backupLocalEnabled: !!snapshot.backupLocalEnabled,
    backupLocalPath: String(snapshot.backupLocalPath ?? ""),
    backupS3Enabled: !!snapshot.backupS3Enabled,
    backupS3Disk: String(snapshot.backupS3Disk ?? ""),
    backupS3Prefix: String(snapshot.backupS3Prefix ?? ""),
    backupTimezone: String(snapshot.backupTimezone ?? ""),
    backupScheduleTimes: parseBackupScheduleTimes(
      snapshot.backupScheduleTimes,
    ).join(","),
    backupWeeklyDay: Number(snapshot.backupWeeklyDay ?? 0),
    backupMonthlyDay: Number(snapshot.backupMonthlyDay ?? 1),
    backupYearlyMonth: Number(snapshot.backupYearlyMonth ?? 1),
    backupYearlyDay: Number(snapshot.backupYearlyDay ?? 1),
    backupRetentionDaily: Number(snapshot.backupRetentionDaily ?? 0),
    backupRetentionWeekly: Number(snapshot.backupRetentionWeekly ?? 0),
    backupRetentionMonthly: Number(snapshot.backupRetentionMonthly ?? 0),
    backupRetentionYearly: Number(snapshot.backupRetentionYearly ?? 0),
    backupRetentionPreset: String(snapshot.backupRetentionPreset ?? ""),
  };
}

function areBackupConfigSnapshotsEqual(left, right) {
  const normalizedLeft = normalizeBackupConfigSnapshot(left);
  const normalizedRight = normalizeBackupConfigSnapshot(right);

  if (!normalizedLeft || !normalizedRight) {
    return normalizedLeft === normalizedRight;
  }

  for (const key of Object.keys(normalizedLeft)) {
    if (normalizedLeft[key] !== normalizedRight[key]) {
      return false;
    }
  }

  return true;
}

function formatAdminTimestamp(value) {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Invalid timestamp";
  }

  return parsed.toLocaleString();
}

function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function normalizeTheme(value) {
  return VALID_THEMES.has(value) ? value : "system";
}

function resolveTheme(theme) {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme) {
  if (typeof document === "undefined") {
    return;
  }

  const resolved = resolveTheme(theme);
  const root = document.documentElement;

  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

function useThemePreference() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") {
      return "system";
    }

    try {
      return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system" || !window.matchMedia) {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => applyTheme("system");

    if (media.addEventListener) {
      media.addEventListener("change", syncTheme);
      return () => media.removeEventListener("change", syncTheme);
    }

    media.addListener(syncTheme);
    return () => media.removeListener(syncTheme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (theme === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [theme]);

  return { theme, setTheme };
}

function App() {
  const theme = useThemePreference();
  const [auth, setAuth] = useState({
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

  const refreshAuth = async () => {
    try {
      const { data } = await api.get("/api/auth/me");
      setAuth({
        loading: false,
        user: data.user,
        registrationEnabled: !!data.registration_enabled,
        ownerShareManagementEnabled: !!data.owner_share_management_enabled,
        davCompatibilityModeEnabled: !!data.dav_compatibility_mode_enabled,
        contactManagementEnabled: !!data.contact_management_enabled,
        contactChangeModerationEnabled:
          !!data.contact_change_moderation_enabled,
        sponsorship: parseSponsorshipConfig(data.sponsorship),
      });
    } catch {
      try {
        const { data } = await api.get("/api/public/config");
        setAuth({
          loading: false,
          user: null,
          registrationEnabled: !!data.registration_enabled,
          ownerShareManagementEnabled: !!data.owner_share_management_enabled,
          davCompatibilityModeEnabled: !!data.dav_compatibility_mode_enabled,
          contactManagementEnabled: !!data.contact_management_enabled,
          contactChangeModerationEnabled:
            !!data.contact_change_moderation_enabled,
          sponsorship: parseSponsorshipConfig(data.sponsorship),
        });
      } catch {
        setAuth({
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
      }
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const value = useMemo(
    () => ({
      ...auth,
      setAuth,
      refreshAuth,
    }),
    [auth],
  );

  if (auth.loading) {
    return <FullPageState label="Loading Davvy..." />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage auth={value} theme={theme} />} />
      <Route
        path="/register"
        element={<RegisterPage auth={value} theme={theme} />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute auth={value}>
            <DashboardPage auth={value} theme={theme} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute auth={value}>
            {value.contactManagementEnabled ? (
              <ContactsPage auth={value} theme={theme} />
            ) : (
              <Navigate to="/" replace />
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/review-queue"
        element={
          <ProtectedRoute auth={value}>
            {value.contactChangeModerationEnabled ? (
              <ContactChangeQueuePage auth={value} theme={theme} />
            ) : (
              <Navigate to="/" replace />
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute auth={value} adminOnly>
            <AdminPage auth={value} theme={theme} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute auth={value}>
            <ProfilePage auth={value} theme={theme} />
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={<Navigate to={auth.user ? "/" : "/login"} replace />}
      />
    </Routes>
  );
}

function ProtectedRoute({ auth, adminOnly = false, children }) {
  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && auth.user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}

function LoginPage({ auth, theme }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (auth.user) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const { data } = await api.post("/api/auth/login", form);
      auth.setAuth({
        loading: false,
        user: data.user,
        registrationEnabled: !!data.registration_enabled,
        ownerShareManagementEnabled: !!data.owner_share_management_enabled,
        davCompatibilityModeEnabled: !!data.dav_compatibility_mode_enabled,
        contactManagementEnabled: !!data.contact_management_enabled,
        contactChangeModerationEnabled:
          !!data.contact_change_moderation_enabled,
        sponsorship: parseSponsorshipConfig(data.sponsorship),
      });
      navigate("/");
    } catch (err) {
      setError(extractError(err, "Unable to sign in."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      theme={theme}
      themeControlPlacement="window-bottom-right"
      title="Welcome Back"
      subtitle="Sign in to manage your CalDAV and CardDAV resources."
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </Field>
        {error ? <p className="text-sm text-app-danger">{error}</p> : null}
        <button className="btn w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p className="mt-5 text-sm text-app-muted">
        Need an account?{" "}
        {auth.registrationEnabled ? (
          <Link to="/register" className="font-semibold text-app-accent">
            Register here
          </Link>
        ) : (
          "Public sign-up is disabled by administrators."
        )}
      </p>
    </AuthShell>
  );
}

function RegisterPage({ auth, theme }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (auth.user) {
    return <Navigate to="/" replace />;
  }

  if (!auth.registrationEnabled) {
    return <Navigate to="/login" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const { data } = await api.post("/api/auth/register", form);
      auth.setAuth({
        loading: false,
        user: data.user,
        registrationEnabled: !!data.registration_enabled,
        ownerShareManagementEnabled: !!data.owner_share_management_enabled,
        davCompatibilityModeEnabled: !!data.dav_compatibility_mode_enabled,
        contactManagementEnabled: !!data.contact_management_enabled,
        contactChangeModerationEnabled:
          !!data.contact_change_moderation_enabled,
        sponsorship: parseSponsorshipConfig(data.sponsorship),
      });
      navigate("/");
    } catch (err) {
      setError(extractError(err, "Unable to register."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      theme={theme}
      themeControlPlacement="window-bottom-right"
      title="Create Account"
      subtitle="Your default calendar and address book are generated automatically."
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Name">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </Field>
        <Field label="Confirm Password">
          <input
            className="input"
            type="password"
            value={form.password_confirmation}
            onChange={(e) =>
              setForm({ ...form, password_confirmation: e.target.value })
            }
            required
          />
        </Field>
        {error ? <p className="text-sm text-app-danger">{error}</p> : null}
        <button className="btn w-full" disabled={submitting}>
          {submitting ? "Creating account..." : "Register"}
        </button>
      </form>
      <p className="mt-5 text-sm text-app-muted">
        Already registered?{" "}
        <Link to="/login" className="font-semibold text-app-accent">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function DashboardPage({ auth, theme }) {
  return (
    <DashboardPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      downloadExport={downloadExport}
      fileStem={fileStem}
      AppShell={AppShell}
      FullPageState={FullPageState}
      InfoCard={InfoCard}
      PermissionBadge={PermissionBadge}
      ResourcePanel={ResourcePanel}
      AddressBookMilestoneControls={AddressBookMilestoneControls}
    />
  );
}

const PHONE_LABEL_OPTIONS = [
  { value: "mobile", label: "Mobile" },
  { value: "iphone", label: "iPhone" },
  { value: "apple_watch", label: "Apple Watch" },
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "main", label: "Main" },
  { value: "home_fax", label: "Home Fax" },
  { value: "work_fax", label: "Work Fax" },
  { value: "other_fax", label: "Other Fax" },
  { value: "pager", label: "Pager" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const EMAIL_LABEL_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const URL_LABEL_OPTIONS = [
  { value: "homepage", label: "Home Page" },
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const ADDRESS_LABEL_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "school", label: "School" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const DATE_LABEL_OPTIONS = [
  { value: "anniversary", label: "Anniversary" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const RELATED_LABEL_OPTIONS = [
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
  { value: "sibling", label: "Sibling" },
  { value: "assistant", label: "Assistant" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const RELATED_LABEL_DERIVED_VALUES = new Set([
  "spouse",
  "husband",
  "wife",
  "partner",
  "boyfriend",
  "girlfriend",
  "fiance",
  "fiancee",
  "parent",
  "father",
  "mother",
  "dad",
  "mom",
  "child",
  "son",
  "daughter",
  "stepson",
  "stepdaughter",
  "parent_in_law",
  "father_in_law",
  "mother_in_law",
  "child_in_law",
  "son_in_law",
  "daughter_in_law",
  "sibling",
  "brother",
  "sister",
  "sibling_in_law",
  "brother_in_law",
  "sister_in_law",
  "aunt_uncle",
  "aunt",
  "uncle",
  "niece_nephew",
  "niece",
  "nephew",
  "grandparent",
  "grandfather",
  "grandpa",
  "grandmother",
  "grandma",
  "grandchild",
  "grandson",
  "granddaughter",
  "cousin",
  "assistant",
  "friend",
  "other",
]);

const RELATED_LABEL_DISPLAY_OVERRIDES = {
  parent_in_law: "Parent-in-Law",
  father_in_law: "Father-in-Law",
  mother_in_law: "Mother-in-Law",
  child_in_law: "Child-in-Law",
  son_in_law: "Son-in-Law",
  daughter_in_law: "Daughter-in-Law",
  sibling_in_law: "Sibling-in-Law",
  brother_in_law: "Brother-in-Law",
  sister_in_law: "Sister-in-Law",
  aunt_uncle: "Aunt/Uncle",
  niece_nephew: "Niece/Nephew",
  grandpa: "Grandpa",
  grandma: "Grandma",
};

const IM_LABEL_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const SAVED_CUSTOM_LABEL_VALUE_PREFIX = "saved-custom:";
const CONTACT_LABEL_FIELD_OPTIONS = {
  phones: PHONE_LABEL_OPTIONS,
  emails: EMAIL_LABEL_OPTIONS,
  urls: URL_LABEL_OPTIONS,
  addresses: ADDRESS_LABEL_OPTIONS,
  dates: DATE_LABEL_OPTIONS,
  related_names: RELATED_LABEL_OPTIONS,
  instant_messages: IM_LABEL_OPTIONS,
};
const CONTACT_LABEL_FIELD_KEYS = Object.keys(CONTACT_LABEL_FIELD_OPTIONS);
const CONTACT_LABEL_BUILTIN_VALUE_SETS = Object.fromEntries(
  CONTACT_LABEL_FIELD_KEYS.map((fieldKey) => [
    fieldKey,
    new Set(
      CONTACT_LABEL_FIELD_OPTIONS[fieldKey]
        .map((option) => String(option?.value ?? "").trim().toLowerCase())
        .filter((value) => value !== "" && value !== "custom"),
    ),
  ]),
);
const EMPTY_CONTACT_CUSTOM_LABELS = Object.fromEntries(
  CONTACT_LABEL_FIELD_KEYS.map((fieldKey) => [fieldKey, []]),
);

const PRONOUN_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "she/her", label: "she/her" },
  { value: "he/him", label: "he/him" },
  { value: "they/them", label: "they/them" },
  { value: "xe/xem", label: "xe/xem" },
  { value: "custom", label: "Custom..." },
];

const OPTIONAL_CONTACT_FIELDS = [
  { id: "prefix", label: "Prefix" },
  { id: "middle_name", label: "Middle Name" },
  { id: "suffix", label: "Suffix" },
  { id: "nickname", label: "Nickname" },
  { id: "maiden_name", label: "Maiden Name" },
  { id: "phonetic_first_name", label: "Phonetic First Name" },
  { id: "phonetic_last_name", label: "Phonetic Last Name" },
  { id: "phonetic_company", label: "Phonetic Company" },
  { id: "department", label: "Department" },
  { id: "pronouns_custom", label: "Custom Pronouns" },
  { id: "ringtone", label: "Ringtone" },
  { id: "text_tone", label: "Text Tone" },
  { id: "verification_code", label: "Verification Code" },
  { id: "profile", label: "Profile" },
  { id: "instant_messages", label: "Instant Message" },
  { id: "dates", label: "Date" },
];

const CONTACTS_PAGE_SIZE = 12;

function hasTextValue(value) {
  return typeof value === "string" ? value.trim() !== "" : false;
}

function normalizeLabelValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCustomLabelText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function customLabelKey(value) {
  return normalizeCustomLabelText(value).toLowerCase();
}

function savedCustomOptionValue(label) {
  return `${SAVED_CUSTOM_LABEL_VALUE_PREFIX}${customLabelKey(label)}`;
}

function buildSavedCustomLabelsByField(contacts) {
  const mapsByField = Object.fromEntries(
    CONTACT_LABEL_FIELD_KEYS.map((fieldKey) => [fieldKey, new Map()]),
  );

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return EMPTY_CONTACT_CUSTOM_LABELS;
  }

  for (const contact of contacts) {
    for (const fieldKey of CONTACT_LABEL_FIELD_KEYS) {
      const builtInValues = CONTACT_LABEL_BUILTIN_VALUE_SETS[fieldKey];
      const rows = Array.isArray(contact?.[fieldKey]) ? contact[fieldKey] : [];

      for (const row of rows) {
        if (!row || typeof row !== "object") {
          continue;
        }

        const normalizedLabel = normalizeLabelValue(row?.label);
        if (normalizedLabel !== "custom") {
          continue;
        }

        const candidateLabel = normalizeCustomLabelText(row?.custom_label);

        const candidateKey = customLabelKey(candidateLabel);
        if (candidateKey === "" || builtInValues.has(candidateKey)) {
          continue;
        }

        if (!mapsByField[fieldKey].has(candidateKey)) {
          mapsByField[fieldKey].set(candidateKey, candidateLabel);
        }
      }
    }
  }

  return Object.fromEntries(
    CONTACT_LABEL_FIELD_KEYS.map((fieldKey) => [
      fieldKey,
      Array.from(mapsByField[fieldKey].values()).sort((left, right) =>
        left.localeCompare(right, undefined, {
          sensitivity: "base",
        }),
      ),
    ]),
  );
}

function buildLabelOptions(baseOptions, savedCustomLabels = []) {
  const primaryOptions = baseOptions.filter((option) => option.value !== "custom");
  const customOption = baseOptions.find((option) => option.value === "custom");
  const customLabelOptions = savedCustomLabels.map((label) => ({
    value: savedCustomOptionValue(label),
    label,
    saved_custom_label: label,
    saved_custom_key: customLabelKey(label),
  }));

  if (!customOption) {
    return [...primaryOptions, ...customLabelOptions];
  }

  return [...primaryOptions, ...customLabelOptions, customOption];
}

function formatRelatedLabelOptionLabel(value) {
  const normalized = normalizeLabelValue(value);
  if (!normalized) {
    return "";
  }

  if (RELATED_LABEL_DISPLAY_OVERRIDES[normalized]) {
    return RELATED_LABEL_DISPLAY_OVERRIDES[normalized];
  }

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function buildDerivedRelatedLabelOptions(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return [];
  }

  const builtInValues = CONTACT_LABEL_BUILTIN_VALUE_SETS.related_names ?? new Set();
  const derivedValues = new Set();

  for (const contact of contacts) {
    const rows = Array.isArray(contact?.related_names) ? contact.related_names : [];

    for (const row of rows) {
      const normalizedLabel = normalizeLabelValue(row?.label);
      if (
        normalizedLabel === "" ||
        normalizedLabel === "custom" ||
        builtInValues.has(normalizedLabel) ||
        !RELATED_LABEL_DERIVED_VALUES.has(normalizedLabel)
      ) {
        continue;
      }

      derivedValues.add(normalizedLabel);
    }
  }

  return Array.from(derivedValues)
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        sensitivity: "base",
      }),
    )
    .map((value) => ({
      value,
      label: formatRelatedLabelOptionLabel(value),
    }));
}

export function buildRelatedNameLabelOptions(contacts, savedCustomLabels = []) {
  const baseOptions = buildLabelOptions(RELATED_LABEL_OPTIONS, savedCustomLabels);
  const derivedOptions = buildDerivedRelatedLabelOptions(contacts);
  if (derivedOptions.length === 0) {
    return baseOptions;
  }

  const customOption = baseOptions.find(
    (option) => normalizeLabelValue(option?.value) === "custom",
  );
  const nonCustomOptions = baseOptions.filter(
    (option) => normalizeLabelValue(option?.value) !== "custom",
  );
  const existingValues = new Set(
    nonCustomOptions.map((option) => normalizeLabelValue(option?.value)),
  );
  const dedupedDerivedOptions = derivedOptions.filter(
    (option) => !existingValues.has(normalizeLabelValue(option?.value)),
  );
  const dedupedDerivedKeys = new Set(
    dedupedDerivedOptions.map((option) => normalizeLabelValue(option?.value)),
  );
  const dedupedOptions = nonCustomOptions.filter(
    (option) =>
      !option?.saved_custom_key ||
      !dedupedDerivedKeys.has(normalizeLabelValue(option.saved_custom_key)),
  );

  if (!customOption) {
    return [...dedupedOptions, ...dedupedDerivedOptions];
  }

  return [...dedupedOptions, ...dedupedDerivedOptions, customOption];
}

function resolveLabelSelectValue(row, labelOptions, fallbackValue = "other") {
  const normalizedLabel = normalizeLabelValue(row?.label);

  if (normalizedLabel === "custom") {
    const selectedCustomKey = customLabelKey(row?.custom_label);
    if (selectedCustomKey !== "") {
      const customOption = labelOptions.find(
        (option) => option.saved_custom_key === selectedCustomKey,
      );
      if (customOption) {
        return customOption.value;
      }
    }

    return "custom";
  }

  const directOption = labelOptions.find(
    (option) => normalizeLabelValue(option.value) === normalizedLabel,
  );
  if (directOption) {
    return directOption.value;
  }

  return fallbackValue;
}

function sanitizeDatePartInput(value, maxLength) {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, maxLength);
}

function normalizeDatePartInput(field, value) {
  if (field === "month" || field === "day") {
    return sanitizeDatePartInput(value, 2);
  }

  if (field === "year") {
    return sanitizeDatePartInput(value, 4);
  }

  return String(value ?? "");
}

function formatDatePartForInput(value, padLength = 0) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }

  return padLength > 0 ? normalized.padStart(padLength, "0") : normalized;
}

function normalizeDatePartForPayload(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDatePartsForPayload(parts) {
  return {
    year: normalizeDatePartForPayload(parts?.year),
    month: normalizeDatePartForPayload(parts?.month),
    day: normalizeDatePartForPayload(parts?.day),
  };
}

function normalizeDateRowsForPayload(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    ...row,
    year: normalizeDatePartForPayload(row?.year),
    month: normalizeDatePartForPayload(row?.month),
    day: normalizeDatePartForPayload(row?.day),
  }));
}

function normalizePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasValueRowContent(rows) {
  return Array.isArray(rows)
    ? rows.some(
        (row) => hasTextValue(row?.value) || hasTextValue(row?.custom_label),
      )
    : false;
}

function hasDateRowContent(rows) {
  return Array.isArray(rows)
    ? rows.some((row) => hasTextValue(row?.month) || hasTextValue(row?.day))
    : false;
}

function hasAddressRowContent(rows) {
  return Array.isArray(rows)
    ? rows.some(
        (row) =>
          hasTextValue(row?.street) ||
          hasTextValue(row?.city) ||
          hasTextValue(row?.state) ||
          hasTextValue(row?.postal_code) ||
          hasTextValue(row?.country) ||
          hasTextValue(row?.custom_label),
      )
    : false;
}

function createContactSectionOpenState() {
  return {
    name: true,
    work: false,
    personal: false,
    communication: false,
    addressBooks: true,
  };
}

function deriveContactSectionOpenState(form) {
  const defaults = createContactSectionOpenState();

  const workHasValue =
    hasTextValue(form.company) ||
    hasTextValue(form.job_title) ||
    hasTextValue(form.phonetic_company) ||
    hasTextValue(form.department);

  const personalHasValue =
    hasTextValue(form.pronouns) ||
    hasTextValue(form.pronouns_custom) ||
    hasTextValue(form.ringtone) ||
    hasTextValue(form.text_tone) ||
    hasTextValue(form.verification_code) ||
    hasTextValue(form.profile) ||
    form.head_of_household === true ||
    form.exclude_milestone_calendars === true ||
    hasTextValue(form.birthday?.month) ||
    hasTextValue(form.birthday?.day) ||
    hasTextValue(form.birthday?.year) ||
    hasDateRowContent(form.dates);

  const communicationHasValue =
    hasValueRowContent(form.phones) ||
    hasValueRowContent(form.emails) ||
    hasValueRowContent(form.urls) ||
    hasValueRowContent(form.instant_messages) ||
    hasValueRowContent(form.related_names) ||
    hasAddressRowContent(form.addresses);

  return {
    ...defaults,
    work: defaults.work || workHasValue,
    personal: defaults.personal || personalHasValue,
    communication: defaults.communication || communicationHasValue,
  };
}

function deriveOptionalFieldVisibility(form) {
  return OPTIONAL_CONTACT_FIELDS.filter((field) => {
    if (field.id === "instant_messages") {
      return hasValueRowContent(form.instant_messages);
    }

    if (field.id === "dates") {
      return hasDateRowContent(form.dates);
    }

    if (field.id === "pronouns_custom") {
      return hasTextValue(form.pronouns_custom) || form.pronouns === "custom";
    }

    return hasTextValue(form[field.id]);
  }).map((field) => field.id);
}

function optionalFieldHasValue(form, fieldId) {
  if (fieldId === "instant_messages") {
    return hasValueRowContent(form.instant_messages);
  }

  if (fieldId === "dates") {
    return hasDateRowContent(form.dates);
  }

  if (fieldId === "pronouns_custom") {
    return hasTextValue(form.pronouns_custom);
  }

  return hasTextValue(form[fieldId]);
}

function clearOptionalFieldValue(form, fieldId) {
  switch (fieldId) {
    case "instant_messages":
      return { ...form, instant_messages: [createEmptyLabeledValue("other")] };
    case "dates":
      return { ...form, dates: [createEmptyDate("anniversary")] };
    case "pronouns_custom":
      return {
        ...form,
        pronouns_custom: "",
        pronouns: form.pronouns === "custom" ? "" : form.pronouns,
      };
    default:
      return { ...form, [fieldId]: "" };
  }
}

function createEmptyLabeledValue(label = "other") {
  return { label, custom_label: "", value: "" };
}

function createEmptyRelatedName(label = "other") {
  return { label, custom_label: "", value: "", related_contact_id: null };
}

function createEmptyAddress(label = "home") {
  return {
    label,
    custom_label: "",
    street: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
  };
}

function createEmptyDate(label = "other") {
  return { label, custom_label: "", year: "", month: "", day: "" };
}

function createEmptyContactForm(defaultAddressBookIds = []) {
  return {
    id: null,
    prefix: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    nickname: "",
    company: "",
    job_title: "",
    department: "",
    pronouns: "",
    pronouns_custom: "",
    ringtone: "",
    text_tone: "",
    phonetic_first_name: "",
    phonetic_last_name: "",
    phonetic_company: "",
    maiden_name: "",
    verification_code: "",
    profile: "",
    head_of_household: false,
    exclude_milestone_calendars: false,
    birthday: { year: "", month: "", day: "" },
    phones: [createEmptyLabeledValue("mobile")],
    emails: [createEmptyLabeledValue("home")],
    urls: [createEmptyLabeledValue("homepage")],
    addresses: [createEmptyAddress("home")],
    dates: [createEmptyDate("anniversary")],
    related_names: [createEmptyRelatedName("other")],
    instant_messages: [createEmptyLabeledValue("other")],
    address_book_ids: defaultAddressBookIds,
  };
}

function datePartsToFormValue(parts) {
  return {
    year: formatDatePartForInput(parts?.year),
    month: formatDatePartForInput(parts?.month, 2),
    day: formatDatePartForInput(parts?.day, 2),
  };
}

function hydrateContactForm(contact, defaultAddressBookIds = []) {
  const fallback = createEmptyContactForm(defaultAddressBookIds);

  if (!contact) {
    return fallback;
  }

  const nonEmptyRows = (rows, makeDefault) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [makeDefault()];
    }

    return rows.map((row) => ({
      label: row?.label ?? "other",
      custom_label: row?.custom_label ?? "",
      value: row?.value ?? "",
    }));
  };

  const nonEmptyAddresses = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [createEmptyAddress("home")];
    }

    return rows.map((row) => ({
      label: row?.label ?? "home",
      custom_label: row?.custom_label ?? "",
      street: row?.street ?? "",
      city: row?.city ?? "",
      state: row?.state ?? "",
      postal_code: row?.postal_code ?? "",
      country: row?.country ?? "",
    }));
  };

  const nonEmptyDates = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [createEmptyDate("anniversary")];
    }

    return rows.map((row) => ({
      label: row?.label ?? "other",
      custom_label: row?.custom_label ?? "",
      year: formatDatePartForInput(row?.year),
      month: formatDatePartForInput(row?.month, 2),
      day: formatDatePartForInput(row?.day, 2),
    }));
  };

  const nonEmptyRelatedNames = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [createEmptyRelatedName("other")];
    }

    return rows.map((row) => ({
      label: row?.label ?? "other",
      custom_label: row?.custom_label ?? "",
      value: row?.value ?? "",
      related_contact_id: normalizePositiveInt(row?.related_contact_id),
    }));
  };

  const addressBookIds =
    Array.isArray(contact.address_book_ids) &&
    contact.address_book_ids.length > 0
      ? contact.address_book_ids
      : defaultAddressBookIds;

  return {
    ...fallback,
    id: contact.id ?? null,
    prefix: contact.prefix ?? "",
    first_name: contact.first_name ?? "",
    middle_name: contact.middle_name ?? "",
    last_name: contact.last_name ?? "",
    suffix: contact.suffix ?? "",
    nickname: contact.nickname ?? "",
    company: contact.company ?? "",
    job_title: contact.job_title ?? "",
    department: contact.department ?? "",
    pronouns: contact.pronouns ?? "",
    pronouns_custom: contact.pronouns_custom ?? "",
    ringtone: contact.ringtone ?? "",
    text_tone: contact.text_tone ?? "",
    phonetic_first_name: contact.phonetic_first_name ?? "",
    phonetic_last_name: contact.phonetic_last_name ?? "",
    phonetic_company: contact.phonetic_company ?? "",
    maiden_name: contact.maiden_name ?? "",
    verification_code: contact.verification_code ?? "",
    profile: contact.profile ?? "",
    head_of_household: !!contact.head_of_household,
    exclude_milestone_calendars: !!contact.exclude_milestone_calendars,
    birthday: datePartsToFormValue(contact.birthday),
    phones: nonEmptyRows(contact.phones, () =>
      createEmptyLabeledValue("mobile"),
    ),
    emails: nonEmptyRows(contact.emails, () => createEmptyLabeledValue("home")),
    urls: nonEmptyRows(contact.urls, () => createEmptyLabeledValue("homepage")),
    addresses: nonEmptyAddresses(contact.addresses),
    dates: nonEmptyDates(contact.dates),
    related_names: nonEmptyRelatedNames(contact.related_names),
    instant_messages: nonEmptyRows(contact.instant_messages, () =>
      createEmptyLabeledValue("other"),
    ),
    address_book_ids: addressBookIds,
  };
}

function ContactsPage({ auth, theme }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [queueStatusNotice, setQueueStatusNotice] = useState("");
  const [contacts, setContacts] = useState([]);
  const [addressBooks, setAddressBooks] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [form, setForm] = useState(createEmptyContactForm());
  const [visibleOptionalFields, setVisibleOptionalFields] = useState([]);
  const [fieldToAdd, setFieldToAdd] = useState(
    OPTIONAL_CONTACT_FIELDS[0]?.id ?? "",
  );
  const [fieldSearchTerm, setFieldSearchTerm] = useState("");
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [pendingHideFieldId, setPendingHideFieldId] = useState(null);
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [contactAddressBookFilter, setContactAddressBookFilter] =
    useState("all");
  const [contactsPage, setContactsPage] = useState(1);
  const [openSections, setOpenSections] = useState(
    createContactSectionOpenState(),
  );

  const defaultAddressBookIds = useMemo(
    () => (addressBooks[0] ? [addressBooks[0].id] : []),
    [addressBooks],
  );

  const hiddenOptionalFields = useMemo(
    () =>
      OPTIONAL_CONTACT_FIELDS.filter(
        (field) => !visibleOptionalFields.includes(field.id),
      ),
    [visibleOptionalFields],
  );

  const relatedNameOptions = useMemo(() => {
    const activeContactId = normalizePositiveInt(form.id);

    return contacts
      .map((contact) => ({
        id: normalizePositiveInt(contact?.id),
        display_name: String(contact?.display_name ?? "").trim(),
      }))
      .filter(
        (contact) =>
          contact.id !== null &&
          contact.display_name !== "" &&
          contact.id !== activeContactId,
      )
      .sort((left, right) =>
        left.display_name.localeCompare(right.display_name, undefined, {
          sensitivity: "base",
        }),
      );
  }, [contacts, form.id]);

  const savedCustomLabels = useMemo(
    () => buildSavedCustomLabelsByField(contacts),
    [contacts],
  );

  const labelOptions = useMemo(
    () => ({
      phones: buildLabelOptions(PHONE_LABEL_OPTIONS, savedCustomLabels.phones),
      emails: buildLabelOptions(EMAIL_LABEL_OPTIONS, savedCustomLabels.emails),
      urls: buildLabelOptions(URL_LABEL_OPTIONS, savedCustomLabels.urls),
      addresses: buildLabelOptions(
        ADDRESS_LABEL_OPTIONS,
        savedCustomLabels.addresses,
      ),
      dates: buildLabelOptions(DATE_LABEL_OPTIONS, savedCustomLabels.dates),
      related_names: buildRelatedNameLabelOptions(
        contacts,
        savedCustomLabels.related_names,
      ),
      instant_messages: buildLabelOptions(
        IM_LABEL_OPTIONS,
        savedCustomLabels.instant_messages,
      ),
    }),
    [contacts, savedCustomLabels],
  );

  const filteredHiddenOptionalFields = useMemo(() => {
    const query = fieldSearchTerm.trim().toLowerCase();
    if (!query) {
      return hiddenOptionalFields;
    }

    return hiddenOptionalFields.filter((field) =>
      field.label.toLowerCase().includes(query),
    );
  }, [fieldSearchTerm, hiddenOptionalFields]);

  const filteredContacts = useMemo(() => {
    const query = contactSearchTerm.trim().toLowerCase();
    const activeAddressBookId =
      contactAddressBookFilter === "all"
        ? null
        : Number(contactAddressBookFilter);

    const searchValueIncludesQuery = (value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(query);
    const rowValueIncludesQuery = (rows) =>
      Array.isArray(rows)
        ? rows.some(
            (row) =>
              searchValueIncludesQuery(row?.value) ||
              searchValueIncludesQuery(row?.custom_label),
          )
        : false;

    return contacts.filter((contact) => {
      if (activeAddressBookId !== null) {
        const assignedBookIds = Array.isArray(contact.address_book_ids)
          ? contact.address_book_ids
          : [];

        if (!assignedBookIds.some((id) => Number(id) === activeAddressBookId)) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      if (
        [
          contact.display_name,
          contact.first_name,
          contact.middle_name,
          contact.last_name,
          contact.nickname,
          contact.company,
          contact.job_title,
          contact.department,
          contact.profile,
        ].some(searchValueIncludesQuery)
      ) {
        return true;
      }

      if (
        Array.isArray(contact.address_books) &&
        contact.address_books.some(
          (book) =>
            searchValueIncludesQuery(book?.display_name) ||
            searchValueIncludesQuery(book?.uri),
        )
      ) {
        return true;
      }

      if (
        rowValueIncludesQuery(contact.phones) ||
        rowValueIncludesQuery(contact.emails) ||
        rowValueIncludesQuery(contact.urls) ||
        rowValueIncludesQuery(contact.related_names) ||
        rowValueIncludesQuery(contact.instant_messages)
      ) {
        return true;
      }

      return Array.isArray(contact.addresses)
        ? contact.addresses.some((address) =>
            [
              address?.street,
              address?.city,
              address?.state,
              address?.postal_code,
              address?.country,
              address?.custom_label,
            ].some(searchValueIncludesQuery),
          )
        : false;
    });
  }, [contactAddressBookFilter, contactSearchTerm, contacts]);

  const totalContactPages = Math.max(
    1,
    Math.ceil(filteredContacts.length / CONTACTS_PAGE_SIZE),
  );
  const currentContactPage = Math.min(contactsPage, totalContactPages);
  const firstContactIndex = (currentContactPage - 1) * CONTACTS_PAGE_SIZE;
  const paginatedContacts = filteredContacts.slice(
    firstContactIndex,
    firstContactIndex + CONTACTS_PAGE_SIZE,
  );
  const lastContactIndex =
    filteredContacts.length === 0
      ? 0
      : firstContactIndex + paginatedContacts.length;
  const hasContactFilters =
    hasTextValue(contactSearchTerm) || contactAddressBookFilter !== "all";

  useEffect(() => {
    setContactsPage(1);
  }, [contactAddressBookFilter, contactSearchTerm]);

  useEffect(() => {
    if (contactAddressBookFilter === "all") {
      return;
    }

    const filterExists = addressBooks.some(
      (book) => String(book.id) === contactAddressBookFilter,
    );

    if (!filterExists) {
      setContactAddressBookFilter("all");
    }
  }, [addressBooks, contactAddressBookFilter]);

  useEffect(() => {
    setContactsPage((prevPage) =>
      prevPage > totalContactPages ? totalContactPages : prevPage,
    );
  }, [totalContactPages]);

  useEffect(() => {
    if (hiddenOptionalFields.length === 0) {
      setFieldToAdd("");
      setFieldSearchTerm("");
      setFieldPickerOpen(false);
      return;
    }

    if (filteredHiddenOptionalFields.length === 0) {
      setFieldToAdd("");
      return;
    }

    if (
      !filteredHiddenOptionalFields.some((field) => field.id === fieldToAdd)
    ) {
      setFieldToAdd(filteredHiddenOptionalFields[0].id);
    }
  }, [fieldToAdd, filteredHiddenOptionalFields, hiddenOptionalFields]);

  const applyFormState = (nextForm) => {
    setForm(nextForm);
    setVisibleOptionalFields(deriveOptionalFieldVisibility(nextForm));
    setOpenSections(deriveContactSectionOpenState(nextForm));
  };

  const redirectIfFeatureDisabled = async (err) => {
    const status = err?.response?.status;
    const message = String(err?.response?.data?.message ?? "").toLowerCase();

    if (status !== 403 || !message.includes("contact management")) {
      return false;
    }

    await auth.refreshAuth();
    navigate("/", { replace: true });
    return true;
  };

  const loadContacts = async ({
    preserveSelection = true,
    selectId = undefined,
  } = {}) => {
    setError("");
    setLoading(true);

    try {
      const response = await api.get("/api/contacts");
      const nextContacts = Array.isArray(response.data?.contacts)
        ? response.data.contacts
        : [];
      const nextAddressBooks = Array.isArray(response.data?.address_books)
        ? response.data.address_books
        : [];

      setContacts(nextContacts);
      setAddressBooks(nextAddressBooks);

      const fallbackIds = nextAddressBooks[0] ? [nextAddressBooks[0].id] : [];
      const hasExplicitSelectId = selectId !== undefined;
      const explicitContactId =
        hasExplicitSelectId &&
        selectId !== null &&
        nextContacts.some((contact) => contact.id === selectId)
          ? selectId
          : null;
      const preservedContactId =
        preserveSelection &&
        selectedContactId &&
        nextContacts.some((contact) => contact.id === selectedContactId)
          ? selectedContactId
          : null;
      const activeId = hasExplicitSelectId
        ? explicitContactId
        : preservedContactId;

      setSelectedContactId(activeId);

      const activeContact = nextContacts.find(
        (contact) => contact.id === activeId,
      );
      applyFormState(hydrateContactForm(activeContact, fallbackIds));
    } catch (err) {
      if (await redirectIfFeatureDisabled(err)) {
        return;
      }
      setError(extractError(err, "Unable to load contacts."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts({ preserveSelection: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!queueStatusNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setQueueStatusNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [queueStatusNotice]);

  const startNewContact = () => {
    setSelectedContactId(null);
    setError("");
    applyFormState(createEmptyContactForm(defaultAddressBookIds));
  };

  const selectContact = (contact) => {
    setSelectedContactId(contact.id);
    setError("");
    applyFormState(hydrateContactForm(contact, defaultAddressBookIds));
  };

  const updateFormField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateBirthdayField = (field, value) => {
    const normalizedValue = normalizeDatePartInput(field, value);
    setForm((prev) => ({
      ...prev,
      birthday: {
        ...prev.birthday,
        [field]: normalizedValue,
      },
    }));
  };

  const saveContact = async (event) => {
    event.preventDefault();

    if (!hasRequiredContactIdentity) {
      setError("Enter at least a First Name, Last Name, or Company.");
      return;
    }

    if (
      !Array.isArray(form.address_book_ids) ||
      form.address_book_ids.length === 0
    ) {
      setError("Select at least one address book.");
      return;
    }

    setSubmitting(true);
    setError("");

    const payload = {
      ...form,
      birthday: normalizeDatePartsForPayload(form.birthday),
      dates: normalizeDateRowsForPayload(form.dates),
      address_book_ids: form.address_book_ids.map((id) => Number(id)),
    };
    delete payload.id;

    try {
      const response = form.id
        ? await api.patch(`/api/contacts/${form.id}`, payload)
        : await api.post("/api/contacts", payload);

      if (response?.data?.queued) {
        setQueueStatusNotice(
          response.data?.message ||
            "Change submitted for owner/admin approval.",
        );
        await loadContacts({
          preserveSelection: false,
          selectId: null,
        });
        return;
      }

      await loadContacts({
        preserveSelection: false,
        selectId: null,
      });
    } catch (err) {
      if (await redirectIfFeatureDisabled(err)) {
        return;
      }
      setError(extractError(err, "Unable to save contact."));
    } finally {
      setSubmitting(false);
    }
  };

  const removeContact = async () => {
    if (!form.id) {
      return;
    }

    if (
      !window.confirm("Delete this contact from all assigned address books?")
    ) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await api.delete(`/api/contacts/${form.id}`);

      if (response?.data?.queued) {
        setQueueStatusNotice(
          response.data?.message ||
            "Delete request submitted for owner/admin approval.",
        );
        await loadContacts({ preserveSelection: true });
        return;
      }

      await loadContacts({ preserveSelection: false, selectId: null });
    } catch (err) {
      if (await redirectIfFeatureDisabled(err)) {
        return;
      }
      setError(extractError(err, "Unable to delete contact."));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAssignedAddressBook = (addressBookId, checked) => {
    setForm((prev) => {
      const current = Array.isArray(prev.address_book_ids)
        ? [...prev.address_book_ids]
        : [];

      if (checked) {
        if (!current.includes(addressBookId)) {
          current.push(addressBookId);
        }
      } else {
        const next = current.filter((id) => id !== addressBookId);
        return { ...prev, address_book_ids: next };
      }

      return { ...prev, address_book_ids: current };
    });
  };

  const showOptionalField = (fieldId) => {
    if (!fieldId) {
      return;
    }

    setVisibleOptionalFields((prev) =>
      prev.includes(fieldId) ? prev : [...prev, fieldId],
    );
  };

  const hideOptionalField = (fieldId) => {
    if (!fieldId) {
      return;
    }

    if (optionalFieldHasValue(form, fieldId)) {
      setPendingHideFieldId(fieldId);
      return;
    }

    setVisibleOptionalFields((prev) => prev.filter((id) => id !== fieldId));
  };

  const resolveHideOptionalField = (clearValue) => {
    if (!pendingHideFieldId) {
      return;
    }

    const hideFieldId = pendingHideFieldId;

    if (clearValue) {
      setForm((prev) => clearOptionalFieldValue(prev, hideFieldId));
    }

    setVisibleOptionalFields((prev) => prev.filter((id) => id !== hideFieldId));
    setPendingHideFieldId(null);
  };

  const cancelHideOptionalField = () => {
    setPendingHideFieldId(null);
  };

  const addSelectedOptionalField = () => {
    if (!fieldToAdd) {
      return;
    }

    showOptionalField(fieldToAdd);
    setFieldSearchTerm("");
    setFieldPickerOpen(false);
  };

  const toggleSection = (sectionId) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const isOptionalFieldVisible = (fieldId) =>
    visibleOptionalFields.includes(fieldId);
  const hasRequiredContactIdentity =
    hasTextValue(form.first_name) ||
    hasTextValue(form.last_name) ||
    hasTextValue(form.company);
  const selectedAddressBookCount = Array.isArray(form.address_book_ids)
    ? form.address_book_ids.length
    : 0;
  const pendingHideFieldLabel =
    OPTIONAL_CONTACT_FIELDS.find((field) => field.id === pendingHideFieldId)
      ?.label ?? pendingHideFieldId;

  return (
    <AppShell auth={auth} theme={theme}>
      {queueStatusNotice ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <p className="rounded-xl border border-app-accent-edge bg-teal-700/95 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 backdrop-blur">
            {queueStatusNotice}
          </p>
        </div>
      ) : null}
      <section className="fade-up grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Contacts"
          value={String(contacts.length)}
          helper="Managed contacts in this web UI."
        />
        <InfoCard
          title="Writable Books"
          value={String(addressBooks.length)}
          helper="Address books where you can add or edit contacts."
        />
        <InfoCard
          title="User"
          value={auth.user.name}
          helper="Contact ownership is scoped to your account."
        />
      </section>

      {error ? (
        <div className="surface mt-4 rounded-2xl p-3 text-sm text-app-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <FullPageState label="Loading contacts..." compact />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
          <ContactsListSidebar
            contacts={contacts}
            filteredContacts={filteredContacts}
            paginatedContacts={paginatedContacts}
            addressBooks={addressBooks}
            contactSearchTerm={contactSearchTerm}
            onContactSearchTermChange={setContactSearchTerm}
            contactAddressBookFilter={contactAddressBookFilter}
            onContactAddressBookFilterChange={setContactAddressBookFilter}
            selectedContactId={selectedContactId}
            onSelectContact={selectContact}
            onStartNewContact={startNewContact}
            hasContactFilters={hasContactFilters}
            onClearFilters={() => {
              setContactSearchTerm("");
              setContactAddressBookFilter("all");
            }}
            contactsPageSize={CONTACTS_PAGE_SIZE}
            firstContactIndex={firstContactIndex}
            lastContactIndex={lastContactIndex}
            currentContactPage={currentContactPage}
            totalContactPages={totalContactPages}
            setContactsPage={setContactsPage}
          />

          <section className="surface rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-app-strong">
                  {form.id ? "Edit Contact" : "New Contact"}
                </h2>
                <p className="mt-1 text-sm text-app-muted">
                  Enter at least a First Name, Last Name, or Company. Address
                  book assignment supports one or more selections.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {form.id ? (
                  <button
                    className="btn-outline btn-outline-sm text-app-danger"
                    type="button"
                    onClick={removeContact}
                    disabled={submitting}
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  className="btn"
                  type="submit"
                  form="contact-editor"
                  disabled={
                    submitting ||
                    addressBooks.length === 0 ||
                    selectedAddressBookCount === 0 ||
                    !hasRequiredContactIdentity
                  }
                >
                  {submitting ? "Saving..." : "Save Contact"}
                </button>
              </div>
            </div>

            {addressBooks.length === 0 ? (
              <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                You do not currently have write access to any address books.
              </p>
            ) : null}

            <form
              id="contact-editor"
              className="mt-5 space-y-6"
              onSubmit={saveContact}
            >
              <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                  type="button"
                  onClick={() => toggleSection("name")}
                  aria-expanded={openSections.name}
                >
                  <span>
                    <span className="block text-sm font-semibold uppercase tracking-wide text-app-base">
                      Name
                    </span>
                    <span className="block text-xs text-app-faint">
                      Basic identity and phonetic naming fields.
                    </span>
                  </span>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
                    {openSections.name ? "-" : "+"}
                  </span>
                </button>

                {openSections.name ? (
                  <div className="mt-3 px-1 pb-1">
                    <div className="grid gap-3 md:grid-cols-3">
                      {isOptionalFieldVisible("prefix") ? (
                        <Field label="Prefix">
                          <input
                            className="input"
                            value={form.prefix}
                            onChange={(event) =>
                              updateFormField("prefix", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      <Field label="First Name">
                        <input
                          className="input"
                          value={form.first_name}
                          onChange={(event) =>
                            updateFormField("first_name", event.target.value)
                          }
                        />
                      </Field>
                      {isOptionalFieldVisible("middle_name") ? (
                        <Field label="Middle Name">
                          <input
                            className="input"
                            value={form.middle_name}
                            onChange={(event) =>
                              updateFormField("middle_name", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      <Field label="Last Name">
                        <input
                          className="input"
                          value={form.last_name}
                          onChange={(event) =>
                            updateFormField("last_name", event.target.value)
                          }
                        />
                      </Field>
                      {isOptionalFieldVisible("suffix") ? (
                        <Field label="Suffix">
                          <input
                            className="input"
                            value={form.suffix}
                            onChange={(event) =>
                              updateFormField("suffix", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      {isOptionalFieldVisible("nickname") ? (
                        <Field label="Nickname">
                          <input
                            className="input"
                            value={form.nickname}
                            onChange={(event) =>
                              updateFormField("nickname", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      {isOptionalFieldVisible("maiden_name") ? (
                        <Field label="Maiden Name">
                          <input
                            className="input"
                            value={form.maiden_name}
                            onChange={(event) =>
                              updateFormField("maiden_name", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      {isOptionalFieldVisible("phonetic_first_name") ? (
                        <Field label="Phonetic First Name">
                          <input
                            className="input"
                            value={form.phonetic_first_name}
                            onChange={(event) =>
                              updateFormField(
                                "phonetic_first_name",
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                      ) : null}
                      {isOptionalFieldVisible("phonetic_last_name") ? (
                        <Field label="Phonetic Last Name">
                          <input
                            className="input"
                            value={form.phonetic_last_name}
                            onChange={(event) =>
                              updateFormField(
                                "phonetic_last_name",
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                  type="button"
                  onClick={() => toggleSection("work")}
                  aria-expanded={openSections.work}
                >
                  <span>
                    <span className="block text-sm font-semibold uppercase tracking-wide text-app-base">
                      Work
                    </span>
                    <span className="block text-xs text-app-faint">
                      Company and role details.
                    </span>
                  </span>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
                    {openSections.work ? "-" : "+"}
                  </span>
                </button>

                {openSections.work ? (
                  <div className="mt-3 px-1 pb-1">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Company">
                        <input
                          className="input"
                          value={form.company}
                          onChange={(event) =>
                            updateFormField("company", event.target.value)
                          }
                        />
                      </Field>
                      {isOptionalFieldVisible("phonetic_company") ? (
                        <Field label="Phonetic Company">
                          <input
                            className="input"
                            value={form.phonetic_company}
                            onChange={(event) =>
                              updateFormField(
                                "phonetic_company",
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                      ) : null}
                      <Field label="Job Title">
                        <input
                          className="input"
                          value={form.job_title}
                          onChange={(event) =>
                            updateFormField("job_title", event.target.value)
                          }
                        />
                      </Field>
                      {isOptionalFieldVisible("department") ? (
                        <Field label="Department">
                          <input
                            className="input"
                            value={form.department}
                            onChange={(event) =>
                              updateFormField("department", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                  type="button"
                  onClick={() => toggleSection("personal")}
                  aria-expanded={openSections.personal}
                >
                  <span>
                    <span className="block text-sm font-semibold uppercase tracking-wide text-app-base">
                      Personal
                    </span>
                    <span className="block text-xs text-app-faint">
                      Pronouns, birthday, and personal metadata.
                    </span>
                  </span>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
                    {openSections.personal ? "-" : "+"}
                  </span>
                </button>

                {openSections.personal ? (
                  <div className="mt-3 space-y-4 px-1 pb-1">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Pronouns">
                        <select
                          className="input"
                          value={form.pronouns}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            updateFormField("pronouns", nextValue);

                            if (nextValue === "custom") {
                              showOptionalField("pronouns_custom");
                            }
                          }}
                        >
                          {PRONOUN_OPTIONS.map((option) => (
                            <option
                              key={option.value || "none"}
                              value={option.value}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {isOptionalFieldVisible("pronouns_custom") ? (
                        <Field label="Custom Pronouns">
                          <input
                            className="input"
                            value={form.pronouns_custom}
                            onChange={(event) =>
                              updateFormField(
                                "pronouns_custom",
                                event.target.value,
                              )
                            }
                            placeholder="Optional custom value"
                            disabled={
                              form.pronouns !== "custom" &&
                              !form.pronouns_custom
                            }
                          />
                        </Field>
                      ) : null}
                      {isOptionalFieldVisible("ringtone") ? (
                        <Field label="Ringtone">
                          <input
                            className="input"
                            value={form.ringtone}
                            onChange={(event) =>
                              updateFormField("ringtone", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      {isOptionalFieldVisible("text_tone") ? (
                        <Field label="Text Tone">
                          <input
                            className="input"
                            value={form.text_tone}
                            onChange={(event) =>
                              updateFormField("text_tone", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      {isOptionalFieldVisible("verification_code") ? (
                        <Field label="Verification Code">
                          <input
                            className="input"
                            value={form.verification_code}
                            onChange={(event) =>
                              updateFormField(
                                "verification_code",
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                      ) : null}
                      {isOptionalFieldVisible("profile") ? (
                        <Field label="Profile">
                          <input
                            className="input"
                            value={form.profile}
                            onChange={(event) =>
                              updateFormField("profile", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                    </div>

                    <section className="rounded-2xl border border-app-accent-edge bg-app-surface p-3 ring-1 ring-teal-500/10">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-app-accent">
                        Household
                      </p>
                      <label className="inline-flex items-center gap-2 text-[13px] font-semibold leading-5 text-app-base">
                        <input
                          type="checkbox"
                          checked={!!form.head_of_household}
                          onChange={(event) =>
                            updateFormField(
                              "head_of_household",
                              event.target.checked,
                            )
                          }
                        />
                        Head of Household
                      </label>
                    </section>

                    <section className="rounded-2xl border border-app-accent-edge bg-app-surface p-4 ring-1 ring-teal-500/10">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-accent">
                          Milestones &amp; Dates
                        </h3>
                        <span className="text-xs text-app-faint">
                          Birthday, notable dates, and calendar behavior.
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        <section className="rounded-2xl border border-app-edge bg-app-surface p-4">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
                            Birthday
                          </h3>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <Field label="Month">
                              <input
                                className="input"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={2}
                                placeholder="MM"
                                value={form.birthday.month}
                                onChange={(event) =>
                                  updateBirthdayField(
                                    "month",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                            <Field label="Day">
                              <input
                                className="input"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={2}
                                placeholder="DD"
                                value={form.birthday.day}
                                onChange={(event) =>
                                  updateBirthdayField("day", event.target.value)
                                }
                              />
                            </Field>
                            <Field label="Year">
                              <input
                                className="input"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                placeholder="YYYY"
                                value={form.birthday.year}
                                onChange={(event) =>
                                  updateBirthdayField(
                                    "year",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                          </div>
                        </section>

                        {isOptionalFieldVisible("dates") ? (
                          <DateEditor
                            rows={form.dates}
                            setRows={(rows) => updateFormField("dates", rows)}
                            labelOptions={labelOptions.dates}
                          />
                        ) : null}

                        <section className="rounded-2xl bg-app-surface pt-2 px-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-app-base">
                            Calendar Behavior
                          </p>
                          <label className="inline-flex items-center gap-2 text-[13px] font-semibold leading-5 text-app-base">
                            <input
                              type="checkbox"
                              checked={!!form.exclude_milestone_calendars}
                              onChange={(event) =>
                                updateFormField(
                                  "exclude_milestone_calendars",
                                  event.target.checked,
                                )
                              }
                            />
                            Exclude From Milestone Calendars
                          </label>
                          <p className="mt-1.5 text-[11px] text-app-faint">
                            Skip Birthday and Anniversary events for this
                            contact in generated milestone calendars.
                          </p>
                        </section>
                      </div>
                    </section>

                    <RelatedNameEditor
                      rows={form.related_names}
                      setRows={(nextRowsOrUpdater) =>
                        setForm((previousForm) => {
                          const currentRows = Array.isArray(
                            previousForm.related_names,
                          )
                            ? previousForm.related_names
                            : [];
                          const nextRows =
                            typeof nextRowsOrUpdater === "function"
                              ? nextRowsOrUpdater(currentRows)
                              : nextRowsOrUpdater;

                          return {
                            ...previousForm,
                            related_names: nextRows,
                          };
                        })
                      }
                      contactOptions={relatedNameOptions}
                      labelOptions={labelOptions.related_names}
                    />
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                  type="button"
                  onClick={() => toggleSection("communication")}
                  aria-expanded={openSections.communication}
                >
                  <span>
                    <span className="block text-sm font-semibold uppercase tracking-wide text-app-base">
                      Communication
                    </span>
                    <span className="block text-xs text-app-faint">
                      Contact methods and addresses.
                    </span>
                  </span>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
                    {openSections.communication ? "-" : "+"}
                  </span>
                </button>

                {openSections.communication ? (
                  <div className="mt-3 space-y-4 px-1 pb-1">
                    <LabeledValueEditor
                      title="Phone"
                      rows={form.phones}
                      setRows={(rows) => updateFormField("phones", rows)}
                      labelOptions={labelOptions.phones}
                      valuePlaceholder="Phone number"
                      addLabel="Add phone"
                    />
                    <LabeledValueEditor
                      title="Email"
                      rows={form.emails}
                      setRows={(rows) => updateFormField("emails", rows)}
                      labelOptions={labelOptions.emails}
                      valuePlaceholder="Email address"
                      addLabel="Add email"
                    />
                    <AddressEditor
                      rows={form.addresses}
                      setRows={(rows) => updateFormField("addresses", rows)}
                      labelOptions={labelOptions.addresses}
                    />
                    <LabeledValueEditor
                      title="URL"
                      rows={form.urls}
                      setRows={(rows) => updateFormField("urls", rows)}
                      labelOptions={labelOptions.urls}
                      valuePlaceholder="https://example.com"
                      addLabel="Add URL"
                    />
                    {isOptionalFieldVisible("instant_messages") ? (
                      <LabeledValueEditor
                        title="Instant Message"
                        rows={form.instant_messages}
                        setRows={(rows) =>
                          updateFormField("instant_messages", rows)
                        }
                        labelOptions={labelOptions.instant_messages}
                        valuePlaceholder="im:username@example.com"
                        addLabel="Add IM"
                      />
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-dashed border-app-accent-edge bg-app-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-app-accent">
                    Add Optional Field
                  </h3>
                  <span className="text-xs text-app-faint">
                    Customize this form as needed
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="relative w-full max-w-xs">
                    <input
                      className="input"
                      value={fieldSearchTerm}
                      onFocus={() => {
                        if (hiddenOptionalFields.length > 0) {
                          setFieldPickerOpen(true);
                        }
                      }}
                      onChange={(event) => {
                        setFieldSearchTerm(event.target.value);
                        setFieldPickerOpen(true);
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setFieldPickerOpen(false), 80);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSelectedOptionalField();
                        }

                        if (event.key === "Escape") {
                          setFieldPickerOpen(false);
                        }
                      }}
                      placeholder={
                        hiddenOptionalFields.length === 0
                          ? "All optional fields added"
                          : "Search optional fields..."
                      }
                      disabled={hiddenOptionalFields.length === 0}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={fieldPickerOpen}
                      aria-controls="optional-field-combobox-list"
                    />
                    {fieldPickerOpen && hiddenOptionalFields.length > 0 ? (
                      <div
                        id="optional-field-combobox-list"
                        className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-app-edge bg-app-surface p-1 shadow-lg backdrop-blur"
                      >
                        {filteredHiddenOptionalFields.length === 0 ? (
                          <p className="px-2 py-2 text-sm text-app-faint">
                            No matching optional fields.
                          </p>
                        ) : (
                          filteredHiddenOptionalFields.map((field) => {
                            const isSelected = field.id === fieldToAdd;

                            return (
                              <button
                                key={field.id}
                                className={`mb-1 block w-full rounded-lg border px-2.5 py-2 text-left text-sm transition last:mb-0 ${
                                  isSelected
                                    ? "border-app-accent-edge bg-app-surface text-app-strong ring-1 ring-teal-500/30"
                                    : "border-transparent text-app-base hover:border-app-edge hover:bg-app-surface"
                                }`}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  setFieldToAdd(field.id);
                                  setFieldSearchTerm(field.label);
                                  setFieldPickerOpen(false);
                                }}
                              >
                                {field.label}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="btn-outline btn-outline-sm"
                    type="button"
                    onClick={addSelectedOptionalField}
                    disabled={!fieldToAdd}
                  >
                    Add Field
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {visibleOptionalFields.length === 0 ? (
                    <p className="text-sm text-app-faint">
                      Optional fields are hidden by default.
                    </p>
                  ) : (
                    visibleOptionalFields.map((fieldId) => {
                      const fieldMeta = OPTIONAL_CONTACT_FIELDS.find(
                        (field) => field.id === fieldId,
                      );

                      return (
                        <button
                          key={fieldId}
                          className="btn-outline btn-outline-sm"
                          type="button"
                          onClick={() => hideOptionalField(fieldId)}
                        >
                          Hide {fieldMeta?.label ?? fieldId}
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                  type="button"
                  onClick={() => toggleSection("addressBooks")}
                  aria-expanded={openSections.addressBooks}
                >
                  <span>
                    <span className="block text-sm font-semibold uppercase tracking-wide text-app-base">
                      Address Books
                    </span>
                    <span className="block text-xs text-app-faint">
                      Choose where this contact will be stored.
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full border border-app-warn-edge bg-app-warn-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-base">
                      Required
                    </span>
                    <span className="rounded-full border border-app-edge bg-app-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-faint">
                      {selectedAddressBookCount} selected
                    </span>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
                      {openSections.addressBooks ? "-" : "+"}
                    </span>
                  </span>
                </button>

                {openSections.addressBooks ? (
                  <div className="mt-3 space-y-3 px-1 pb-1">
                    <p className="text-xs text-app-faint">
                      Choose one or more address books for this contact.
                    </p>
                    <div className="space-y-2">
                      {addressBooks.length === 0 ? (
                        <p className="text-sm text-app-faint">
                          No writable address books.
                        </p>
                      ) : (
                        addressBooks.map((book) => {
                          const isAssigned = form.address_book_ids.includes(
                            book.id,
                          );

                          return (
                            <label
                              key={book.id}
                              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                                isAssigned
                                  ? "border-app-accent-edge bg-app-surface ring-1 ring-teal-500/30"
                                  : "border-app-edge bg-app-surface"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 self-start"
                                checked={isAssigned}
                                onChange={(event) =>
                                  toggleAssignedAddressBook(
                                    book.id,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span className="min-w-0">
                                <span className="flex items-start gap-2">
                                  <span className="block font-medium text-app-strong">
                                    {book.display_name}
                                  </span>
                                  <span
                                    className={`mt-0.5 inline-flex h-4 shrink-0 items-center rounded-full border border-app-accent-edge px-1.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-app-accent ${
                                      isAssigned ? "" : "invisible"
                                    }`}
                                    aria-hidden={!isAssigned}
                                  >
                                    Selected
                                  </span>
                                </span>
                                <span className="block text-xs text-app-faint">
                                  /{book.uri} •{" "}
                                  {book.scope === "owned" ? "Owned" : "Shared"}
                                  {book.owner_name
                                    ? ` • ${book.owner_name}`
                                    : ""}
                                </span>
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="sticky bottom-2 z-20 sm:bottom-3">
                <div className="surface flex items-center justify-end gap-1.5 rounded-xl px-2.5 py-1.5 shadow-lg shadow-black/10 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2">
                  {form.id ? (
                    <button
                      className="btn-outline btn-outline-sm text-app-danger"
                      type="button"
                      onClick={removeContact}
                      disabled={submitting}
                    >
                      Delete
                    </button>
                  ) : null}
                  <button
                    className="btn !px-3 !py-1.5 sm:!px-4 sm:!py-2"
                    type="submit"
                    disabled={
                      submitting ||
                      addressBooks.length === 0 ||
                      selectedAddressBookCount === 0 ||
                      !hasRequiredContactIdentity
                    }
                  >
                    {submitting ? "Saving..." : "Save Contact"}
                  </button>
                </div>
              </section>
            </form>
          </section>
        </div>
      )}

      <ContactEditorHideFieldModal
        pendingHideFieldId={pendingHideFieldId}
        pendingHideFieldLabel={pendingHideFieldLabel}
        onCancel={cancelHideOptionalField}
        onResolve={resolveHideOptionalField}
      />
    </AppShell>
  );
}

function LabeledValueEditor({
  title,
  rows,
  setRows,
  labelOptions,
  valuePlaceholder,
  addLabel,
}) {
  return (
    <LabeledValueEditorComponent
      title={title}
      rows={rows}
      setRows={setRows}
      labelOptions={labelOptions}
      valuePlaceholder={valuePlaceholder}
      addLabel={addLabel}
      resolveLabelSelectValue={resolveLabelSelectValue}
      createEmptyLabeledValue={createEmptyLabeledValue}
      useRowReorder={useRowReorder}
      RowReorderControls={RowReorderControls}
    />
  );
}

export function RelatedNameEditor({
  rows,
  setRows,
  contactOptions,
  labelOptions,
}) {
  return (
    <RelatedNameEditorComponent
      rows={rows}
      setRows={setRows}
      contactOptions={contactOptions}
      labelOptions={labelOptions}
      defaultLabelOptions={RELATED_LABEL_OPTIONS}
      resolveLabelSelectValue={resolveLabelSelectValue}
      normalizePositiveInt={normalizePositiveInt}
      createEmptyRelatedName={createEmptyRelatedName}
      useRowReorder={useRowReorder}
      RowReorderControls={RowReorderControls}
    />
  );
}

function AddressEditor({ rows, setRows, labelOptions }) {
  return (
    <AddressEditorComponent
      rows={rows}
      setRows={setRows}
      labelOptions={labelOptions}
      defaultLabelOptions={ADDRESS_LABEL_OPTIONS}
      resolveLabelSelectValue={resolveLabelSelectValue}
      createEmptyAddress={createEmptyAddress}
      useRowReorder={useRowReorder}
      RowReorderControls={RowReorderControls}
    />
  );
}

function DateEditor({ rows, setRows, labelOptions }) {
  return (
    <DateEditorComponent
      rows={rows}
      setRows={setRows}
      labelOptions={labelOptions}
      defaultLabelOptions={DATE_LABEL_OPTIONS}
      resolveLabelSelectValue={resolveLabelSelectValue}
      createEmptyDate={createEmptyDate}
      normalizeDatePartInput={normalizeDatePartInput}
    />
  );
}

function ContactsListSidebar(props) {
  return <ContactsListSidebarComponent {...props} />;
}

function ContactEditorHideFieldModal(props) {
  return <ContactEditorHideFieldModalComponent {...props} />;
}

function AddressBookMilestoneControls({ item, onSave }) {
  return (
    <AddressBookMilestoneControlsComponent
      item={item}
      onSave={onSave}
      ChevronRightIcon={ChevronRightIcon}
      ResetIcon={ResetIcon}
      PencilIcon={PencilIcon}
      CheckIcon={CheckIcon}
      TimesIcon={TimesIcon}
    />
  );
}

function ResourcePanel({
  title,
  createLabel,
  exportAllLabel,
  resourceKind,
  principalId,
  items,
  sharedItems,
  onCreate,
  form,
  setForm,
  onExportAll,
  onExportItem,
  onToggle,
  onRename,
  renderOwnedItemExtra = null,
}) {
  return (
    <ResourcePanelComponent
      title={title}
      createLabel={createLabel}
      exportAllLabel={exportAllLabel}
      resourceKind={resourceKind}
      principalId={principalId}
      items={items}
      sharedItems={sharedItems}
      onCreate={onCreate}
      form={form}
      setForm={setForm}
      onExportAll={onExportAll}
      onExportItem={onExportItem}
      onToggle={onToggle}
      onRename={onRename}
      renderOwnedItemExtra={renderOwnedItemExtra}
      CopyableResourceUri={CopyableResourceUri}
      PermissionBadge={PermissionBadge}
      DownloadIcon={DownloadIcon}
      PencilIcon={PencilIcon}
    />
  );
}

function AdminFeatureToggle({ label, enabled, onClick }) {
  return (
    <AdminFeatureToggleComponent
      label={label}
      enabled={enabled}
      onClick={onClick}
    />
  );
}

function ContactChangeQueuePage({ auth, theme }) {
  return (
    <ContactChangeQueuePageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AppShell={AppShell}
      FullPageState={FullPageState}
    />
  );
}

function AdminPage({ auth, theme }) {
  return (
    <AdminPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AppShell={AppShell}
      InfoCard={InfoCard}
      AdminFeatureToggle={AdminFeatureToggle}
      FullPageState={FullPageState}
      Field={Field}
      PermissionBadge={PermissionBadge}
      buildTimezoneGroups={buildTimezoneGroups}
      parseBackupScheduleTimes={parseBackupScheduleTimes}
      isRecommendedBackupRetention={isRecommendedBackupRetention}
      areBackupConfigSnapshotsEqual={areBackupConfigSnapshotsEqual}
      formatAdminTimestamp={formatAdminTimestamp}
      MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS={MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS}
      BACKUP_RUN_TOAST_AUTO_HIDE_MS={BACKUP_RUN_TOAST_AUTO_HIDE_MS}
      BACKUP_DRAWER_ANIMATION_MS={BACKUP_DRAWER_ANIMATION_MS}
      WEEKDAY_OPTIONS={WEEKDAY_OPTIONS}
      MONTH_OPTIONS={MONTH_OPTIONS}
      RECOMMENDED_BACKUP_RETENTION={RECOMMENDED_BACKUP_RETENTION}
    />
  );
}

function ProfilePage({ auth, theme }) {
  return (
    <ProfilePageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AppShell={AppShell}
      InfoCard={InfoCard}
      Field={Field}
    />
  );
}

function AppShell({ auth, theme, children }) {
  return (
    <AppShellComponent
      auth={auth}
      theme={theme}
      api={api}
      ThemeControl={ThemeControl}
      SponsorshipLinkIcon={SponsorshipLinkIcon}
    >
      {children}
    </AppShellComponent>
  );
}

function SponsorshipLinkIcon({ name, url }) {
  const [iconFailed, setIconFailed] = useState(false);
  const faviconUrl = useMemo(() => sponsorshipFaviconUrl(url), [url]);
  const fallbackLabel =
    String(name ?? "")
      .trim()
      .slice(0, 1)
      .toUpperCase() || "S";

  if (!faviconUrl || iconFailed) {
    return (
      <span className="sponsor-link-icon-fallback" aria-hidden="true">
        {fallbackLabel}
      </span>
    );
  }

  return (
    <img
      className="sponsor-link-icon-img"
      src={faviconUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setIconFailed(true)}
    />
  );
}

function ThemeControl({ theme, setTheme, className = "" }) {
  const resolvedTheme = resolveTheme(theme);
  const isDark = resolvedTheme === "dark";
  const systemTheme = getSystemTheme();
  const targetTheme = isDark ? "light" : "dark";
  const nextTheme = targetTheme === systemTheme ? "system" : targetTheme;
  const toggleLabel = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <div className={`theme-control ${className}`.trim()}>
      <button
        type="button"
        className={`theme-control-toggle ${isDark ? "theme-control-toggle-dark" : ""}`.trim()}
        onClick={() => setTheme(nextTheme)}
        aria-pressed={isDark}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {isDark ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
            className="theme-control-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
            className="theme-control-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
          </svg>
        )}
      </button>
    </div>
  );
}

function PermissionBadge({ permission }) {
  if (permission === "admin") {
    return <span className="pill pill-admin">Admin</span>;
  }

  if (permission === "editor") {
    return <span className="pill pill-editor">Editor</span>;
  }

  return <span className="pill pill-read">General</span>;
}

function DownloadIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v10" />
      <path d="M8 10.5 12 14.5l4-4" />
      <path d="M4.5 18.5h15" />
    </svg>
  );
}

function PencilIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function TimesIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ResetIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 15.5 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function AuthShell({
  theme,
  title,
  subtitle,
  children,
  themeControlPlacement = "inline",
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <section className="surface fade-up w-full rounded-3xl p-8">
        <h1 className="text-3xl font-bold text-app-strong">{title}</h1>
        <p className="mt-2 text-sm text-app-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        {themeControlPlacement === "inline" ? (
          <div className="mt-6 flex justify-center sm:justify-end">
            <ThemeControl
              theme={theme.theme}
              setTheme={theme.setTheme}
              className="theme-control-inline"
            />
          </div>
        ) : null}
      </section>
      {themeControlPlacement === "window-bottom-right" ? (
        <ThemeControl
          theme={theme.theme}
          setTheme={theme.setTheme}
          className="theme-control-window-bottom-right"
        />
      ) : null}
    </main>
  );
}

function CopyableResourceUri({ resourceKind, principalId, resourceUri }) {
  return (
    <CopyableResourceUriComponent
      resourceKind={resourceKind}
      principalId={principalId}
      resourceUri={resourceUri}
      buildDavCollectionUrl={buildDavCollectionUrl}
      copyTextToClipboard={copyTextToClipboard}
    />
  );
}

function InfoCard({ title, value, helper, copyable = false }) {
  return (
    <InfoCardComponent
      title={title}
      value={value}
      helper={helper}
      copyable={copyable}
      copyTextToClipboard={copyTextToClipboard}
    />
  );
}

function Field({ label, children }) {
  return <FieldComponent label={label}>{children}</FieldComponent>;
}

function FullPageState({ label, compact = false }) {
  return (
    <div
      className={
        compact
          ? "mt-4 text-sm font-semibold text-app-muted"
          : "flex min-h-screen items-center justify-center text-lg font-semibold text-app-base"
      }
    >
      {label}
    </div>
  );
}

const mountNode = document.getElementById("app");

if (mountNode) {
  createRoot(mountNode).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
}

export default App;
