import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api, extractError } from "./lib/api";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareStatusNotice, setShareStatusNotice] = useState("");
  const [data, setData] = useState({
    owned: { calendars: [], address_books: [] },
    shared: { calendars: [], address_books: [] },
    sharing: { can_manage: false, targets: [], outgoing: [] },
    apple_compat: {
      enabled: false,
      target_address_book_id: null,
      target_address_book_uri: null,
      target_display_name: null,
      selected_source_ids: [],
      source_options: [],
    },
  });
  const [appleCompatForm, setAppleCompatForm] = useState({
    enabled: false,
    source_ids: [],
  });
  const [calendarForm, setCalendarForm] = useState({
    display_name: "",
    is_sharable: false,
  });
  const [bookForm, setBookForm] = useState({
    display_name: "",
    is_sharable: false,
  });
  const [shareForm, setShareForm] = useState({
    resource_type: "calendar",
    resource_id: "",
    shared_with_id: "",
    permission: "read_only",
  });

  const loadDashboard = async ({ withLoading = true } = {}) => {
    if (withLoading) {
      setLoading(true);
    }
    setError("");
    try {
      const response = await api.get("/api/dashboard");
      const payload = response.data;
      setData(payload);
      setAppleCompatForm({
        enabled: !!payload.apple_compat?.enabled,
        source_ids: payload.apple_compat?.selected_source_ids ?? [],
      });
    } catch (err) {
      setError(extractError(err, "Unable to load dashboard data."));
    } finally {
      if (withLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!shareStatusNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShareStatusNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [shareStatusNotice]);

  const toggleSharable = async (type, id, next, displayName) => {
    const url =
      type === "calendar" ? `/api/calendars/${id}` : `/api/address-books/${id}`;
    try {
      await api.patch(url, { is_sharable: next });
      setShareStatusNotice(
        next
          ? `${displayName} is now shared.`
          : `${displayName} is no longer shared.`,
      );
      await loadDashboard({ withLoading: false });
    } catch (err) {
      setError(extractError(err, "Unable to update sharing status."));
    }
  };

  const renameOwnedResource = async (type, id, displayName) => {
    const url =
      type === "calendar" ? `/api/calendars/${id}` : `/api/address-books/${id}`;

    try {
      // Keep DAV collection URL stable by updating only the display name.
      await api.patch(url, { display_name: displayName });
      await loadDashboard({ withLoading: false });
    } catch (err) {
      setError(extractError(err, "Unable to rename resource."));
      throw err;
    }
  };

  const createCalendar = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/calendars", calendarForm);
      setCalendarForm({ display_name: "", is_sharable: false });
      await loadDashboard();
    } catch (err) {
      setError(extractError(err, "Unable to create calendar."));
    }
  };

  const createAddressBook = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/address-books", bookForm);
      setBookForm({ display_name: "", is_sharable: false });
      await loadDashboard();
    } catch (err) {
      setError(extractError(err, "Unable to create address book."));
    }
  };

  const saveShare = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/shares", {
        ...shareForm,
        resource_id: Number(shareForm.resource_id),
        shared_with_id: Number(shareForm.shared_with_id),
      });
      setShareForm((prev) => ({
        ...prev,
        resource_id: "",
        shared_with_id: "",
      }));
      await loadDashboard();
    } catch (err) {
      setError(extractError(err, "Unable to save share assignment."));
    }
  };

  const deleteShare = async (shareId) => {
    try {
      await api.delete(`/api/shares/${shareId}`);
      await loadDashboard();
    } catch (err) {
      setError(extractError(err, "Unable to remove share assignment."));
    }
  };

  const runExport = async (url, fallbackName, fallbackMessage) => {
    try {
      setError("");
      await downloadExport(url, fallbackName);
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : fallbackMessage,
      );
    }
  };

  const saveAppleCompat = async (event) => {
    event.preventDefault();
    try {
      setError("");
      await api.patch("/api/address-books/apple-compat", appleCompatForm);
      await loadDashboard({ withLoading: false });
    } catch (err) {
      setError(
        extractError(err, "Unable to update Apple compatibility settings."),
      );
    }
  };

  const saveAddressBookMilestones = async (addressBookId, payload) => {
    try {
      setError("");
      await api.patch(
        `/api/address-books/${addressBookId}/milestone-calendars`,
        payload,
      );
      await loadDashboard({ withLoading: false });
    } catch (err) {
      setError(
        extractError(
          err,
          "Unable to update birthday/anniversary calendar settings.",
        ),
      );
      throw err;
    }
  };

  const shareableResourceOptions =
    shareForm.resource_type === "calendar"
      ? data.owned.calendars.filter((item) => item.is_sharable)
      : data.owned.address_books.filter((item) => item.is_sharable);
  const canSelectAppleCompatSources =
    !!data.apple_compat.target_address_book_id && appleCompatForm.enabled;

  return (
    <AppShell auth={auth} theme={theme}>
      {shareStatusNotice ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <p className="rounded-xl border border-app-accent-edge bg-teal-700/95 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 backdrop-blur">
            {shareStatusNotice}
          </p>
        </div>
      ) : null}
      <section className="fade-up grid gap-4 md:grid-cols-3">
        <InfoCard
          title="DAV Endpoint"
          value={`${window.location.origin}/dav`}
          helper="Use this URL in client connection settings."
          copyable
        />
        <InfoCard
          title="Principal"
          value={`principals/${auth.user.id}`}
          helper="Autodiscovery may resolve this automatically."
        />
        <InfoCard
          title="Role"
          value={auth.user.role.toUpperCase()}
          helper="Admins can manage users and cross-user sharing."
        />
      </section>

      {error ? (
        <div className="surface mt-4 rounded-2xl p-3 text-sm text-app-danger">
          {error}
        </div>
      ) : null}
      {loading ? <FullPageState label="Loading resources..." compact /> : null}

      {!loading ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ResourcePanel
            title="Your Calendars"
            createLabel="Create Calendar"
            exportAllLabel="Export All"
            resourceKind="calendar"
            principalId={auth.user.id}
            items={data.owned.calendars}
            sharedItems={data.shared.calendars}
            onCreate={createCalendar}
            form={calendarForm}
            setForm={setCalendarForm}
            onExportAll={() =>
              runExport(
                "/api/exports/calendars",
                "davvy-calendars.zip",
                "Unable to export calendars.",
              )
            }
            onExportItem={(item) =>
              runExport(
                `/api/exports/calendars/${item.id}`,
                `${fileStem(item.display_name, "calendar")}.ics`,
                "Unable to export calendar.",
              )
            }
            onToggle={(id, next, displayName) =>
              toggleSharable("calendar", id, next, displayName)
            }
            onRename={(id, displayName) =>
              renameOwnedResource("calendar", id, displayName)
            }
          />
          <ResourcePanel
            title="Your Address Books"
            createLabel="Create Address Book"
            exportAllLabel="Export All"
            resourceKind="address-book"
            principalId={auth.user.id}
            items={data.owned.address_books}
            sharedItems={data.shared.address_books}
            onCreate={createAddressBook}
            form={bookForm}
            setForm={setBookForm}
            onExportAll={() =>
              runExport(
                "/api/exports/address-books",
                "davvy-address-books.zip",
                "Unable to export address books.",
              )
            }
            onExportItem={(item) =>
              runExport(
                `/api/exports/address-books/${item.id}`,
                `${fileStem(item.display_name, "address-book")}.vcf`,
                "Unable to export address book.",
              )
            }
            onToggle={(id, next, displayName) =>
              toggleSharable("address-book", id, next, displayName)
            }
            onRename={(id, displayName) =>
              renameOwnedResource("address-book", id, displayName)
            }
            renderOwnedItemExtra={(item) => (
              <AddressBookMilestoneControls
                item={item}
                onSave={saveAddressBookMilestones}
              />
            )}
          />
        </div>
      ) : null}

      {!loading && data.sharing.can_manage ? (
        <section className="surface mt-6 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-app-strong">
            Share Your Resources
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Grant read-only, editor, or admin access for resources you own and
            marked as sharable. Admin access includes collection delete rights.
          </p>
          <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={saveShare}>
            <select
              className="input"
              value={shareForm.resource_type}
              onChange={(event) =>
                setShareForm({
                  ...shareForm,
                  resource_type: event.target.value,
                  resource_id: "",
                })
              }
            >
              <option value="calendar">Calendar</option>
              <option value="address_book">Address Book</option>
            </select>
            <select
              className="input"
              value={shareForm.resource_id}
              onChange={(event) =>
                setShareForm({ ...shareForm, resource_id: event.target.value })
              }
              required
            >
              <option value="">Select sharable resource</option>
              {shareableResourceOptions.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.display_name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={shareForm.shared_with_id}
              onChange={(event) =>
                setShareForm({
                  ...shareForm,
                  shared_with_id: event.target.value,
                })
              }
              required
            >
              <option value="">Select user</option>
              {data.sharing.targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name} ({target.email})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                className="input"
                value={shareForm.permission}
                onChange={(event) =>
                  setShareForm({ ...shareForm, permission: event.target.value })
                }
              >
                <option value="read_only">General (read-only)</option>
                <option value="editor">Full edit (no delete)</option>
                <option value="admin">Admin (full edit + delete)</option>
              </select>
              <button className="btn" type="submit">
                Share
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-2">
            {data.sharing.outgoing.length === 0 ? (
              <p className="text-sm text-app-faint">No outgoing shares yet.</p>
            ) : (
              data.sharing.outgoing.map((share) => (
                <div
                  key={share.id}
                  className="rounded-xl border border-app-edge bg-app-surface p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-app-strong">
                      {share.resource_type} #{share.resource_id}
                    </p>
                    <PermissionBadge permission={share.permission} />
                  </div>
                  <p className="text-app-muted">
                    Shared with: {share.shared_with?.name} (
                    {share.shared_with?.email})
                  </p>
                  <button
                    className="mt-2 text-xs font-semibold text-app-danger"
                    onClick={() => deleteShare(share.id)}
                  >
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {!loading ? (
        <section className="surface mt-6 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-app-strong">
            Apple Contacts Compatibility
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Off by default. Mirror selected address books into your main address
            book (<code>{data.apple_compat.target_display_name}</code>) so macOS
            and iOS clients can see them.
          </p>

          {data.apple_compat.target_address_book_id ? (
            <p className="mt-2 text-xs text-app-faint">
              Mirror target: {data.apple_compat.target_display_name} (/
              {data.apple_compat.target_address_book_uri})
            </p>
          ) : (
            <p className="mt-2 text-xs text-app-danger">
              No default Contacts address book found for your account.
            </p>
          )}

          <form className="mt-4 space-y-4" onSubmit={saveAppleCompat}>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-app-base">
              <input
                type="checkbox"
                checked={appleCompatForm.enabled}
                onChange={(event) =>
                  setAppleCompatForm({
                    ...appleCompatForm,
                    enabled: event.target.checked,
                  })
                }
                disabled={!data.apple_compat.target_address_book_id}
              />
              Enable Apple compatibility mirroring
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-app-strong">
                Source address books to mirror
              </p>
              {data.apple_compat.source_options.length === 0 ? (
                <p className="text-sm text-app-faint">
                  No eligible owned/shared address books available.
                </p>
              ) : (
                data.apple_compat.source_options.map((option) => {
                  const checked = appleCompatForm.source_ids.includes(
                    option.id,
                  );

                  return (
                    <label
                      key={option.id}
                      className={`flex items-start gap-2 rounded-xl border border-app-edge bg-app-surface px-3 py-2 text-sm ${
                        canSelectAppleCompatSources
                          ? ""
                          : "cursor-not-allowed opacity-60"
                      }`}
                      aria-disabled={!canSelectAppleCompatSources}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setAppleCompatForm({
                              ...appleCompatForm,
                              source_ids: [
                                ...appleCompatForm.source_ids,
                                option.id,
                              ],
                            });
                            return;
                          }

                          setAppleCompatForm({
                            ...appleCompatForm,
                            source_ids: appleCompatForm.source_ids.filter(
                              (id) => id !== option.id,
                            ),
                          });
                        }}
                        disabled={!canSelectAppleCompatSources}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-app-strong">
                          {option.display_name}
                        </span>
                        <span className="block text-xs text-app-faint">
                          {option.scope === "owned" ? "Owned" : "Shared"} •{" "}
                          {option.owner_name} ({option.owner_email})
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div>
              <button
                className="btn"
                type="submit"
                disabled={!data.apple_compat.target_address_book_id}
              >
                Save Apple Compatibility Settings
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </AppShell>
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

const IM_LABEL_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

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
    exclude_milestone_calendars: false,
    birthday: { year: "", month: "", day: "" },
    phones: [createEmptyLabeledValue("mobile")],
    emails: [createEmptyLabeledValue("home")],
    urls: [createEmptyLabeledValue("homepage")],
    addresses: [createEmptyAddress("home")],
    dates: [createEmptyDate("anniversary")],
    related_names: [createEmptyLabeledValue("other")],
    instant_messages: [createEmptyLabeledValue("other")],
    address_book_ids: defaultAddressBookIds,
  };
}

function datePartsToFormValue(parts) {
  return {
    year: parts?.year != null ? String(parts.year) : "",
    month: parts?.month != null ? String(parts.month) : "",
    day: parts?.day != null ? String(parts.day) : "",
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
      year: row?.year != null ? String(row.year) : "",
      month: row?.month != null ? String(row.month) : "",
      day: row?.day != null ? String(row.day) : "",
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
    exclude_milestone_calendars: !!contact.exclude_milestone_calendars,
    birthday: datePartsToFormValue(contact.birthday),
    phones: nonEmptyRows(contact.phones, () =>
      createEmptyLabeledValue("mobile"),
    ),
    emails: nonEmptyRows(contact.emails, () => createEmptyLabeledValue("home")),
    urls: nonEmptyRows(contact.urls, () => createEmptyLabeledValue("homepage")),
    addresses: nonEmptyAddresses(contact.addresses),
    dates: nonEmptyDates(contact.dates),
    related_names: nonEmptyRows(contact.related_names, () =>
      createEmptyLabeledValue("other"),
    ),
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
    selectId = null,
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
      const activeId =
        selectId ??
        (preserveSelection &&
        selectedContactId &&
        nextContacts.some((contact) => contact.id === selectedContactId)
          ? selectedContactId
          : (nextContacts[0]?.id ?? null));

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
    setForm((prev) => ({
      ...prev,
      birthday: {
        ...prev.birthday,
        [field]: value,
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
          preserveSelection: true,
        });
        return;
      }

      await loadContacts({
        preserveSelection: false,
        selectId: response.data?.id ?? null,
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
          <aside className="surface h-fit rounded-3xl p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-app-base">
                Contacts
              </h2>
              <button
                className="btn-outline btn-outline-sm"
                onClick={startNewContact}
              >
                New
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <input
                className="input"
                type="search"
                placeholder="Search contacts..."
                value={contactSearchTerm}
                onChange={(event) => setContactSearchTerm(event.target.value)}
              />
              <select
                className="input"
                value={contactAddressBookFilter}
                onChange={(event) =>
                  setContactAddressBookFilter(event.target.value)
                }
              >
                <option value="all">All address books</option>
                {addressBooks.map((book) => (
                  <option key={book.id} value={String(book.id)}>
                    {book.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-app-faint">
              <span>
                {filteredContacts.length} match
                {filteredContacts.length === 1 ? "" : "es"}
              </span>
              {hasContactFilters ? (
                <button
                  className="text-xs font-semibold text-app-accent hover:text-app-accent-strong"
                  type="button"
                  onClick={() => {
                    setContactSearchTerm("");
                    setContactAddressBookFilter("all");
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {contacts.length === 0 ? (
                <p className="text-sm text-app-faint">No contacts yet.</p>
              ) : filteredContacts.length === 0 ? (
                <p className="text-sm text-app-faint">
                  No contacts match this filter.
                </p>
              ) : (
                paginatedContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      selectedContactId === contact.id
                        ? "border-app-accent-edge bg-app-surface text-app-strong ring-1 ring-teal-500/30"
                        : "border-app-edge bg-app-surface text-app-base hover:border-app-accent-edge"
                    }`}
                    onClick={() => selectContact(contact)}
                  >
                    <p className="truncate text-sm font-semibold">
                      {contact.display_name}
                    </p>
                    <p className="mt-1 text-xs text-app-faint">
                      {Array.isArray(contact.address_books)
                        ? `${contact.address_books.length} address book(s)`
                        : "0 address books"}
                    </p>
                  </button>
                ))
              )}
            </div>
            {filteredContacts.length > CONTACTS_PAGE_SIZE ? (
              <div className="mt-3 rounded-xl border border-app-edge px-2 py-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-app-faint">
                  <span>
                    {firstContactIndex + 1}-{lastContactIndex} of{" "}
                    {filteredContacts.length}
                  </span>
                  <span>
                    Page {currentContactPage} / {totalContactPages}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    className="btn-outline btn-outline-sm w-full"
                    type="button"
                    onClick={() =>
                      setContactsPage((prevPage) => Math.max(1, prevPage - 1))
                    }
                    disabled={currentContactPage === 1}
                  >
                    Prev
                  </button>
                  <button
                    className="btn-outline btn-outline-sm w-full"
                    type="button"
                    onClick={() =>
                      setContactsPage((prevPage) =>
                        Math.min(totalContactPages, prevPage + 1),
                      )
                    }
                    disabled={currentContactPage >= totalContactPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </aside>

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

                    <section className="rounded-2xl border border-app-edge bg-app-surface p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
                        Birthday
                      </h3>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <Field label="Month">
                          <input
                            className="input"
                            type="number"
                            min="1"
                            max="12"
                            value={form.birthday.month}
                            onChange={(event) =>
                              updateBirthdayField("month", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="Day">
                          <input
                            className="input"
                            type="number"
                            min="1"
                            max="31"
                            value={form.birthday.day}
                            onChange={(event) =>
                              updateBirthdayField("day", event.target.value)
                            }
                          />
                        </Field>
                        <Field label="Year">
                          <input
                            className="input"
                            type="number"
                            min="1"
                            max="9999"
                            value={form.birthday.year}
                            onChange={(event) =>
                              updateBirthdayField("year", event.target.value)
                            }
                          />
                        </Field>
                      </div>
                    </section>

                    {isOptionalFieldVisible("dates") ? (
                      <DateEditor
                        rows={form.dates}
                        setRows={(rows) => updateFormField("dates", rows)}
                      />
                    ) : null}

                    <section className="rounded-2xl border border-app-accent-edge bg-app-surface p-3 ring-1 ring-teal-500/10">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-app-accent">
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
                        Skip Birthday and Anniversary events for this contact in
                        generated milestone calendars.
                      </p>
                    </section>
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
                      Contact methods, relationships, and addresses.
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
                      labelOptions={PHONE_LABEL_OPTIONS}
                      valuePlaceholder="Phone number"
                      addLabel="Add phone"
                    />
                    <LabeledValueEditor
                      title="Email"
                      rows={form.emails}
                      setRows={(rows) => updateFormField("emails", rows)}
                      labelOptions={EMAIL_LABEL_OPTIONS}
                      valuePlaceholder="Email address"
                      addLabel="Add email"
                    />
                    <LabeledValueEditor
                      title="URL"
                      rows={form.urls}
                      setRows={(rows) => updateFormField("urls", rows)}
                      labelOptions={URL_LABEL_OPTIONS}
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
                        labelOptions={IM_LABEL_OPTIONS}
                        valuePlaceholder="im:username@example.com"
                        addLabel="Add IM"
                      />
                    ) : null}
                    <LabeledValueEditor
                      title="Related Name"
                      rows={form.related_names}
                      setRows={(rows) => updateFormField("related_names", rows)}
                      labelOptions={RELATED_LABEL_OPTIONS}
                      valuePlaceholder="Name"
                      addLabel="Add related name"
                    />

                    <AddressEditor
                      rows={form.addresses}
                      setRows={(rows) => updateFormField("addresses", rows)}
                    />
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

      {pendingHideFieldId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="surface w-full max-w-md rounded-2xl p-5">
            <h3 className="text-base font-semibold text-app-strong">
              Hide {pendingHideFieldLabel}?
            </h3>
            <p className="mt-2 text-sm text-app-muted">
              This field currently has data. Keep the value hidden or clear it
              before hiding the field.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={cancelHideOptionalField}
              >
                Cancel
              </button>
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={() => resolveHideOptionalField(false)}
              >
                Keep Hidden Value
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => resolveHideOptionalField(true)}
              >
                Clear and Hide
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  const safeRows = Array.isArray(rows) ? rows : [];

  const updateRow = (index, field, value) => {
    const nextRows = safeRows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row,
    );
    setRows(nextRows);
  };

  const addRow = () => {
    setRows([
      ...safeRows,
      createEmptyLabeledValue(labelOptions[0]?.value || "other"),
    ]);
  };

  const removeRow = (index) => {
    setRows(safeRows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <section className="rounded-2xl border border-app-edge bg-app-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
          {title}
        </h3>
        <button
          className="btn-outline btn-outline-sm"
          type="button"
          onClick={addRow}
        >
          {addLabel}
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {safeRows.length === 0 ? (
          <p className="text-sm text-app-faint">No entries.</p>
        ) : (
          safeRows.map((row, index) => (
            <div
              key={`${title}-${index}`}
              className="rounded-xl border border-app-edge p-3"
            >
              <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
                <select
                  className="input"
                  value={row.label ?? "other"}
                  onChange={(event) =>
                    updateRow(index, "label", event.target.value)
                  }
                >
                  {labelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  value={row.value ?? ""}
                  onChange={(event) =>
                    updateRow(index, "value", event.target.value)
                  }
                  placeholder={valuePlaceholder}
                />
                <button
                  className="btn-outline btn-outline-sm"
                  type="button"
                  onClick={() => removeRow(index)}
                >
                  Remove
                </button>
              </div>
              {row.label === "custom" ? (
                <input
                  className="input mt-2"
                  value={row.custom_label ?? ""}
                  onChange={(event) =>
                    updateRow(index, "custom_label", event.target.value)
                  }
                  placeholder="Custom label"
                />
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AddressEditor({ rows, setRows }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const updateRow = (index, field, value) => {
    setRows(
      safeRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  const addRow = () => {
    setRows([...safeRows, createEmptyAddress("home")]);
  };

  const removeRow = (index) => {
    setRows(safeRows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <section className="rounded-2xl border border-app-edge bg-app-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
          Address
        </h3>
        <button
          className="btn-outline btn-outline-sm"
          type="button"
          onClick={addRow}
        >
          Add address
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {safeRows.length === 0 ? (
          <p className="text-sm text-app-faint">No addresses.</p>
        ) : (
          safeRows.map((row, index) => (
            <div
              key={`address-${index}`}
              className="rounded-xl border border-app-edge p-3"
            >
              <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
                <select
                  className="input"
                  value={row.label ?? "home"}
                  onChange={(event) =>
                    updateRow(index, "label", event.target.value)
                  }
                >
                  {ADDRESS_LABEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  value={row.street ?? ""}
                  onChange={(event) =>
                    updateRow(index, "street", event.target.value)
                  }
                  placeholder="Street"
                />
                <button
                  className="btn-outline btn-outline-sm"
                  type="button"
                  onClick={() => removeRow(index)}
                >
                  Remove
                </button>
              </div>
              {row.label === "custom" ? (
                <input
                  className="input mt-2"
                  value={row.custom_label ?? ""}
                  onChange={(event) =>
                    updateRow(index, "custom_label", event.target.value)
                  }
                  placeholder="Custom label"
                />
              ) : null}
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <input
                  className="input"
                  value={row.city ?? ""}
                  onChange={(event) =>
                    updateRow(index, "city", event.target.value)
                  }
                  placeholder="City"
                />
                <input
                  className="input"
                  value={row.state ?? ""}
                  onChange={(event) =>
                    updateRow(index, "state", event.target.value)
                  }
                  placeholder="State / Region"
                />
                <input
                  className="input"
                  value={row.postal_code ?? ""}
                  onChange={(event) =>
                    updateRow(index, "postal_code", event.target.value)
                  }
                  placeholder="Postal code"
                />
                <input
                  className="input"
                  value={row.country ?? ""}
                  onChange={(event) =>
                    updateRow(index, "country", event.target.value)
                  }
                  placeholder="Country"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function DateEditor({ rows, setRows }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const updateRow = (index, field, value) => {
    setRows(
      safeRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  const addRow = () => {
    setRows([...safeRows, createEmptyDate("other")]);
  };

  const removeRow = (index) => {
    setRows(safeRows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <section className="rounded-2xl border border-app-edge bg-app-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
          Date
        </h3>
        <button
          className="btn-outline btn-outline-sm"
          type="button"
          onClick={addRow}
        >
          Add date
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {safeRows.length === 0 ? (
          <p className="text-sm text-app-faint">No dates.</p>
        ) : (
          safeRows.map((row, index) => (
            <div
              key={`date-${index}`}
              className="rounded-xl border border-app-edge p-3"
            >
              <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
                <select
                  className="input"
                  value={row.label ?? "other"}
                  onChange={(event) =>
                    updateRow(index, "label", event.target.value)
                  }
                >
                  {DATE_LABEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="12"
                    value={row.month ?? ""}
                    placeholder="MM"
                    onChange={(event) =>
                      updateRow(index, "month", event.target.value)
                    }
                  />
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="31"
                    value={row.day ?? ""}
                    placeholder="DD"
                    onChange={(event) =>
                      updateRow(index, "day", event.target.value)
                    }
                  />
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="9999"
                    value={row.year ?? ""}
                    placeholder="YYYY"
                    onChange={(event) =>
                      updateRow(index, "year", event.target.value)
                    }
                  />
                </div>
                <button
                  className="btn-outline btn-outline-sm"
                  type="button"
                  onClick={() => removeRow(index)}
                >
                  Remove
                </button>
              </div>
              {row.label === "custom" ? (
                <input
                  className="input mt-2"
                  value={row.custom_label ?? ""}
                  onChange={(event) =>
                    updateRow(index, "custom_label", event.target.value)
                  }
                  placeholder="Custom label"
                />
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AddressBookMilestoneControls({ item, onSave }) {
  const birthdaySettings = item?.milestone_calendars?.birthdays ?? {};
  const anniversarySettings = item?.milestone_calendars?.anniversaries ?? {};
  const enabledCount =
    (birthdaySettings.enabled ? 1 : 0) + (anniversarySettings.enabled ? 1 : 0);
  const [savingKey, setSavingKey] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  const [nameDrafts, setNameDrafts] = useState({
    birthdays: birthdaySettings.custom_name ?? "",
    anniversaries: anniversarySettings.custom_name ?? "",
  });

  useEffect(() => {
    setNameDrafts({
      birthdays: birthdaySettings.custom_name ?? "",
      anniversaries: anniversarySettings.custom_name ?? "",
    });
  }, [item?.id, birthdaySettings.custom_name, anniversarySettings.custom_name]);

  const saveMilestone = async (type, payload) => {
    if (savingKey) {
      return false;
    }

    setSavingKey(type);

    try {
      await onSave(item.id, payload);
      return true;
    } catch {
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  const toggleEnabled = async (type, enabled) => {
    if (type === "birthdays") {
      await saveMilestone(type, {
        birthdays_enabled: enabled,
      });
      return;
    }

    await saveMilestone(type, {
      anniversaries_enabled: enabled,
    });
  };

  const saveName = async (type) => {
    const settings =
      type === "birthdays" ? birthdaySettings : anniversarySettings;
    const value = (nameDrafts[type] ?? "").trim();
    const existing = (settings.custom_name ?? "").trim();

    if (value === existing) {
      setEditingKey(null);
      return;
    }

    const payload =
      type === "birthdays"
        ? { birthday_calendar_name: value || null }
        : { anniversary_calendar_name: value || null };
    const didSave = await saveMilestone(type, payload);

    if (didSave) {
      setEditingKey(null);
    }
  };

  const resetName = async (type) => {
    const settings =
      type === "birthdays" ? birthdaySettings : anniversarySettings;
    const hasCustomName = (settings.custom_name ?? "").trim().length > 0;

    if (!hasCustomName) {
      return;
    }

    const payload =
      type === "birthdays"
        ? { birthday_calendar_name: null }
        : { anniversary_calendar_name: null };
    const didSave = await saveMilestone(type, payload);

    if (didSave) {
      setNameDrafts((prev) => ({
        ...prev,
        [type]: "",
      }));
      setEditingKey((prev) => (prev === type ? null : prev));
    }
  };

  const renderRow = (type, label, settings, fallbackName) => {
    const isSaving = savingKey === type;
    const saveInProgress = !!savingKey && !isSaving;
    const isEditing = editingKey === type;
    const currentCustom = settings.custom_name ?? "";
    const hasCustomName = currentCustom.trim().length > 0;
    const canSaveName =
      (nameDrafts[type] ?? "").trim() !== currentCustom.trim() && !isSaving;

    return (
      <div className="py-0.5" key={type}>
        <div className="flex items-center gap-2">
          <label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-app-base">
            <input
              type="checkbox"
              checked={!!settings.enabled}
              disabled={isSaving || saveInProgress}
              onChange={(event) => toggleEnabled(type, event.target.checked)}
            />
            {label}
          </label>
          {isEditing ? (
            <div className="min-w-0 flex flex-1 items-center gap-1.5">
              <input
                className="input h-7 min-w-[9rem] flex-1 px-2 py-1 text-sm"
                value={nameDrafts[type] ?? ""}
                onChange={(event) =>
                  setNameDrafts((prev) => ({
                    ...prev,
                    [type]: event.target.value,
                  }))
                }
                placeholder={settings.default_name ?? fallbackName}
                disabled={isSaving}
              />
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded text-app-faint transition hover:text-app-base focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                type="button"
                aria-label={`Cancel editing ${label} calendar name`}
                title={`Cancel editing ${label} calendar name`}
                onClick={() => {
                  setEditingKey(null);
                  setNameDrafts((prev) => ({
                    ...prev,
                    [type]: currentCustom,
                  }));
                }}
                disabled={isSaving}
              >
                <TimesIcon className="h-3.5 w-3.5" />
              </button>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded text-app-accent transition hover:text-app-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                type="button"
                aria-label={`Save ${label} calendar name`}
                title={`Save ${label} calendar name`}
                onClick={() => saveName(type)}
                disabled={!canSaveName}
              >
                <CheckIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="min-w-0 flex items-center gap-0">
              {hasCustomName ? (
                <>
                  <span
                    className="max-w-[14rem] truncate text-xs text-app-faint sm:max-w-[20rem]"
                    title={currentCustom}
                  >
                    {currentCustom}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 -mr-[0.25rem] items-center justify-center rounded text-app-dim transition hover:text-app-base focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                    aria-label={`Reset ${label} calendar name to default`}
                    title={`Reset ${label} calendar name to default`}
                    onClick={() => resetName(type)}
                    disabled={isSaving || saveInProgress}
                  >
                    <ResetIcon className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-app-dim transition hover:text-app-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                aria-label={`Rename ${label} calendar`}
                title={`Rename ${label} calendar`}
                onClick={() => setEditingKey(type)}
                disabled={isSaving || saveInProgress}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {isSaving ? (
            <span className="shrink-0 text-[11px] text-app-faint">
              Saving...
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="px-0.5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-app-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        aria-label={
          collapsed
            ? "Expand milestone calendars"
            : "Collapse milestone calendars"
        }
        title={
          collapsed
            ? "Expand milestone calendars"
            : "Collapse milestone calendars"
        }
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed((prev) => !prev);
          if (!collapsed) {
            setEditingKey(null);
          }
        }}
      >
        <span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] leading-tight text-app-base">
            Milestone Calendars
          </span>
          <span className="block text-[11px] leading-tight text-app-faint">
            {enabledCount === 0 ? "Off" : `${enabledCount}/2 enabled`}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-accent">
          {collapsed ? "Configure" : "Hide"}
          <ChevronRightIcon
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`}
          />
        </span>
      </button>
      {!collapsed ? (
        <div className="mt-1 pl-2 divide-y divide-app-edge">
          {renderRow(
            "birthdays",
            "Birthdays",
            birthdaySettings,
            `${item.display_name} Birthdays`,
          )}
          {renderRow(
            "anniversaries",
            "Anniversaries",
            anniversarySettings,
            `${item.display_name} Anniversaries`,
          )}
        </div>
      ) : null}
    </div>
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
  const [editingItemId, setEditingItemId] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [renamingItemId, setRenamingItemId] = useState(null);

  const startEditing = (item) => {
    setEditingItemId(item.id);
    setNameDraft(item.display_name ?? "");
  };

  const cancelEditing = () => {
    setEditingItemId(null);
    setNameDraft("");
    setRenamingItemId(null);
  };

  const submitRename = async (event, item) => {
    event.preventDefault();
    const nextName = nameDraft.trim();

    if (!nextName) {
      return;
    }

    if (nextName === item.display_name) {
      cancelEditing();
      return;
    }

    setRenamingItemId(item.id);
    try {
      await onRename(item.id, nextName);
      cancelEditing();
    } catch {
      // Errors are surfaced by DashboardPage.
    } finally {
      setRenamingItemId(null);
    }
  };

  return (
    <section className="surface rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-app-strong">{title}</h2>
        <button
          className="btn-outline btn-outline-sm"
          type="button"
          onClick={() => void onExportAll()}
        >
          {exportAllLabel}
        </button>
      </div>
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={onCreate}
      >
        <input
          className="input flex-1"
          value={form.display_name}
          placeholder="Display name"
          onChange={(event) =>
            setForm({ ...form, display_name: event.target.value })
          }
          required
        />
        <label className="inline-flex items-center gap-2 text-sm font-medium text-app-base">
          <input
            type="checkbox"
            checked={form.is_sharable}
            onChange={(event) =>
              setForm({ ...form, is_sharable: event.target.checked })
            }
          />
          Sharable
        </label>
        <button className="btn" type="submit">
          {createLabel}
        </button>
      </form>

      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-app-faint">No owned resources yet.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border border-app-edge bg-app-surface ${
                renderOwnedItemExtra ? "px-3 pb-2 pt-3" : "p-3"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editingItemId === item.id ? (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(event) => void submitRename(event, item)}
                    >
                      <input
                        className="input h-8 flex-1 px-2 py-1 text-sm"
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        aria-label={`Edit name for ${item.display_name}`}
                        required
                        autoFocus
                      />
                      <button
                        className="btn-outline btn-outline-sm rounded-xl"
                        type="submit"
                        disabled={renamingItemId === item.id}
                      >
                        Save
                      </button>
                      <button
                        className="btn-outline btn-outline-sm rounded-xl"
                        type="button"
                        onClick={cancelEditing}
                        disabled={renamingItemId === item.id}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1">
                      <p className="truncate font-medium text-app-strong">
                        {item.display_name}
                      </p>
                      {item.is_default ? (
                        <span className="shrink-0 text-xs font-semibold text-app-faint">
                          (default)
                        </span>
                      ) : null}
                      <button
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-app-dim transition hover:text-app-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        type="button"
                        onClick={() => startEditing(item)}
                        aria-label={`Edit name for ${item.display_name}`}
                        title={`Edit name for ${item.display_name}`}
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <CopyableResourceUri
                    resourceKind={resourceKind}
                    principalId={principalId}
                    resourceUri={item.uri}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <button
                    className="btn-outline btn-outline-sm rounded-xl"
                    type="button"
                    onClick={() => void onExportItem(item)}
                    aria-label={`Export ${item.display_name}`}
                    title={`Export ${item.display_name}`}
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                  </button>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-app-base">
                    <input
                      type="checkbox"
                      checked={!!item.is_sharable}
                      onChange={(event) =>
                        onToggle(
                          item.id,
                          event.target.checked,
                          item.display_name,
                        )
                      }
                    />
                    Sharable
                  </label>
                </div>
              </div>
              {renderOwnedItemExtra ? (
                <div className="mt-1.5 border-t border-app-edge pt-1.5">
                  {renderOwnedItemExtra(item)}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="mt-6 border-t border-app-edge pt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
          Shared with you
        </h3>
        <div className="mt-3 space-y-2">
          {sharedItems.length === 0 ? (
            <p className="text-sm text-app-faint">No shared resources.</p>
          ) : (
            sharedItems.map((item) => (
              <div
                key={`${item.id}-${item.share_id}`}
                className="rounded-xl border border-app-warn-edge bg-app-warn-surface p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-app-strong">
                      {item.display_name}
                    </p>
                    <p className="text-xs text-app-muted">
                      Owner: {item.owner_name} ({item.owner_email})
                    </p>
                    <CopyableResourceUri
                      resourceKind={resourceKind}
                      principalId={principalId}
                      resourceUri={item.uri}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-outline btn-outline-sm rounded-xl"
                      type="button"
                      onClick={() => void onExportItem(item)}
                      aria-label={`Export ${item.display_name}`}
                      title={`Export ${item.display_name}`}
                    >
                      <DownloadIcon className="h-3.5 w-3.5" />
                    </button>
                    <PermissionBadge permission={item.permission} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function AdminFeatureToggle({ label, enabled, onClick }) {
  return (
    <button
      className={`btn-outline inline-flex items-center gap-1.5 rounded-lg !px-2.5 !py-1.5 !text-sm ${
        enabled
          ? "border-app-accent-edge bg-app-surface text-app-strong ring-1 ring-teal-500/25 hover:border-app-accent-edge"
          : "border-app-edge bg-app-surface text-app-muted hover:border-app-edge"
      }`}
      type="button"
      aria-pressed={enabled}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${
          enabled
            ? "bg-teal-500 shadow-[0_0_0_2px_rgba(20,184,166,0.2)]"
            : "bg-zinc-400"
        }`}
      />
      <span className="whitespace-nowrap text-sm">{label}</span>
      <span
        className={`rounded-full border px-1.5 py-0.5 text-[9px] leading-[12px] font-semibold uppercase tracking-wide ${
          enabled
            ? "border-app-accent-edge text-app-accent"
            : "border-app-edge text-app-faint"
        }`}
      >
        {enabled ? "On" : "Off"}
      </span>
    </button>
  );
}

function formatQueueTimestamp(value) {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "n/a";
  }

  return parsed.toLocaleString();
}

function queueStatusLabel(status) {
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

function queueOperationLabel(operation) {
  return operation === "delete" ? "Delete" : "Update";
}

function ContactChangeQueuePage({ auth, theme }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [operationFilter, setOperationFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [editPayloadText, setEditPayloadText] = useState("");
  const [editAddressBookIdsText, setEditAddressBookIdsText] = useState("");

  const loadQueue = async ({ withLoading = true } = {}) => {
    if (withLoading) {
      setLoading(true);
    }

    setError("");

    try {
      const response = await api.get("/api/contact-change-requests", {
        params: {
          status: statusFilter,
          operation: operationFilter,
          search,
          limit: 300,
        },
      });

      setRows(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (err) {
      setError(extractError(err, "Unable to load change requests."));
    } finally {
      if (withLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadQueue({ withLoading: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, operationFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQueue({ withLoading: false });
    }, 260);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const actionableRows = rows.filter(
    (row) => row.status === "pending" || row.status === "manual_merge_needed",
  );

  const approveRow = async (
    row,
    resolvedPayload = null,
    resolvedAddressIds = null,
  ) => {
    setSubmitting(true);
    setError("");

    try {
      const payload = {};
      if (resolvedPayload !== null) {
        payload.resolved_payload = resolvedPayload;
      }
      if (resolvedAddressIds !== null) {
        payload.resolved_address_book_ids = resolvedAddressIds;
      }

      await api.patch(
        `/api/contact-change-requests/${row.id}/approve`,
        payload,
      );
      setNotice("Request approved.");
      await loadQueue({ withLoading: false });
      window.dispatchEvent(new Event("review-queue-updated"));
    } catch (err) {
      setError(extractError(err, "Unable to approve request."));
    } finally {
      setSubmitting(false);
    }
  };

  const denyRow = async (row) => {
    setSubmitting(true);
    setError("");

    try {
      await api.patch(`/api/contact-change-requests/${row.id}/deny`);
      setNotice("Request denied.");
      await loadQueue({ withLoading: false });
      window.dispatchEvent(new Event("review-queue-updated"));
    } catch (err) {
      setError(extractError(err, "Unable to deny request."));
    } finally {
      setSubmitting(false);
    }
  };

  const runBulkAction = async (action) => {
    const ids = actionableRows
      .map((row) => Number(row.id))
      .filter((id) => id > 0);
    if (ids.length === 0) {
      return;
    }

    const verb = action === "approve" ? "approve" : "deny";
    const confirmed = window.confirm(
      `This will ${verb} ${ids.length} queued request(s) in the current filtered view. Continue?`,
    );
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await api.post("/api/contact-change-requests/bulk", {
        action,
        request_ids: ids,
      });

      const processed = Number(response.data?.processed ?? 0);
      const skipped = Number(response.data?.skipped ?? 0);
      setNotice(`${processed} request group(s) processed. ${skipped} skipped.`);
      await loadQueue({ withLoading: false });
      window.dispatchEvent(new Event("review-queue-updated"));
    } catch (err) {
      setError(extractError(err, "Unable to process bulk action."));
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (row) => {
    const payload = row.resolved_payload ?? row.proposed_payload ?? {};
    const addressBookIds =
      row.resolved_address_book_ids ?? row.proposed_address_book_ids ?? [];

    setEditingRow(row);
    setEditPayloadText(JSON.stringify(payload, null, 2));
    setEditAddressBookIdsText(JSON.stringify(addressBookIds, null, 2));
  };

  const closeEditDialog = () => {
    setEditingRow(null);
    setEditPayloadText("");
    setEditAddressBookIdsText("");
  };

  const submitEditAndApprove = async () => {
    if (!editingRow) {
      return;
    }

    let resolvedPayload;
    let resolvedAddressBookIds;

    try {
      resolvedPayload = JSON.parse(editPayloadText || "{}");
    } catch {
      setError("Resolved payload must be valid JSON.");
      return;
    }

    try {
      resolvedAddressBookIds = JSON.parse(editAddressBookIdsText || "[]");
    } catch {
      setError("Resolved address book IDs must be valid JSON.");
      return;
    }

    if (
      !Array.isArray(resolvedAddressBookIds) ||
      resolvedAddressBookIds.some((value) => Number(value) <= 0)
    ) {
      setError(
        "Resolved address book IDs must be an array of positive integers.",
      );
      return;
    }

    await approveRow(
      editingRow,
      resolvedPayload,
      resolvedAddressBookIds.map((value) => Number(value)),
    );

    closeEditDialog();
  };

  return (
    <AppShell auth={auth} theme={theme}>
      {notice ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <p className="rounded-xl border border-app-accent-edge bg-teal-700/95 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 backdrop-blur">
            {notice}
          </p>
        </div>
      ) : null}

      <section className="surface fade-up rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-app-strong">
              Contact Change Review Queue
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Review queued editor changes for contacts before they are applied.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-outline btn-outline-sm"
              type="button"
              disabled={submitting || actionableRows.length === 0}
              onClick={() => runBulkAction("approve")}
            >
              Approve All ({actionableRows.length})
            </button>
            <button
              className="btn-outline btn-outline-sm text-app-danger"
              type="button"
              disabled={submitting || actionableRows.length === 0}
              onClick={() => runBulkAction("deny")}
            >
              Deny All ({actionableRows.length})
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[12rem_12rem_1fr_auto]">
          <select
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="manual_merge_needed">Manual Merge Needed</option>
            <option value="history">History</option>
            <option value="all">All</option>
          </select>
          <select
            className="input"
            value={operationFilter}
            onChange={(event) => setOperationFilter(event.target.value)}
          >
            <option value="all">All operations</option>
            <option value="update">Updates</option>
            <option value="delete">Deletes</option>
          </select>
          <input
            className="input"
            type="search"
            placeholder="Search by contact/requester..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadQueue({ withLoading: false });
              }
            }}
          />
          <button
            className="btn-outline btn-outline-sm"
            type="button"
            disabled={submitting}
            onClick={() => loadQueue({ withLoading: false })}
          >
            Refresh
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-app-danger">{error}</p> : null}
      </section>

      {loading ? (
        <FullPageState label="Loading review queue..." compact />
      ) : (
        <section className="mt-6 space-y-3">
          {rows.length === 0 ? (
            <div className="surface rounded-2xl p-4 text-sm text-app-faint">
              No queued requests for this filter.
            </div>
          ) : (
            rows.map((row) => (
              <article
                key={row.id}
                className={`surface rounded-2xl p-4 ${
                  row.status === "manual_merge_needed"
                    ? "border border-app-warn-edge bg-app-warn-surface"
                    : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-faint">
                      #{row.id} • Group {row.group_uuid}
                    </p>
                    <h3 className="text-lg font-semibold text-app-strong">
                      {row.contact?.display_name || "Unnamed Contact"} (
                      {queueOperationLabel(row.operation)})
                    </h3>
                    <p className="mt-1 text-xs text-app-muted">
                      Status: {queueStatusLabel(row.status)} • Requested{" "}
                      {formatQueueTimestamp(row.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(row.status === "pending" ||
                      row.status === "manual_merge_needed") && (
                      <>
                        {row.operation === "update" ? (
                          <button
                            className="btn-outline btn-outline-sm"
                            type="button"
                            disabled={submitting}
                            onClick={() => openEditDialog(row)}
                          >
                            Edit & Approve
                          </button>
                        ) : null}
                        <button
                          className="btn-outline btn-outline-sm"
                          type="button"
                          disabled={submitting}
                          onClick={() => approveRow(row)}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-outline btn-outline-sm text-app-danger"
                          type="button"
                          disabled={submitting}
                          onClick={() => denyRow(row)}
                        >
                          Deny
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-app-base md:grid-cols-2">
                  <p>
                    Requester: {row.requester?.name} ({row.requester?.email})
                  </p>
                  <p>
                    Approval Owner: {row.approval_owner?.name} (
                    {row.approval_owner?.email})
                  </p>
                  <p>Source: {row.source}</p>
                  <p>
                    Reviewer:{" "}
                    {row.reviewer
                      ? `${row.reviewer.name} (${row.reviewer.email})`
                      : "Not reviewed yet"}
                  </p>
                </div>

                {Array.isArray(row.changed_fields) &&
                row.changed_fields.length > 0 ? (
                  <p className="mt-2 text-xs text-app-muted">
                    Changed fields: {row.changed_fields.join(", ")}
                  </p>
                ) : null}

                {row.status_reason ? (
                  <p className="mt-2 text-sm text-app-danger">
                    {row.status_reason}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </section>
      )}

      {editingRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="surface w-full max-w-3xl rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-app-strong">
              Edit Request #{editingRow.id} Before Approve
            </h3>
            <p className="mt-1 text-sm text-app-muted">
              Adjust payload/address book IDs, then approve this queued request.
            </p>

            <div className="mt-4 grid gap-3">
              <Field label="Resolved Payload JSON">
                <textarea
                  className="input min-h-[14rem] font-mono text-xs"
                  value={editPayloadText}
                  onChange={(event) => setEditPayloadText(event.target.value)}
                />
              </Field>
              <Field label="Resolved Address Book IDs JSON Array">
                <textarea
                  className="input min-h-[6rem] font-mono text-xs"
                  value={editAddressBookIdsText}
                  onChange={(event) =>
                    setEditAddressBookIdsText(event.target.value)
                  }
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={closeEditDialog}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                onClick={submitEditAndApprove}
                disabled={submitting}
              >
                {submitting ? "Approving..." : "Save Edits & Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function AdminPage({ auth, theme }) {
  const [state, setState] = useState({
    loading: true,
    users: [],
    shares: [],
    resources: { calendars: [], address_books: [] },
    error: "",
    registrationEnabled: auth.registrationEnabled,
    ownerShareManagementEnabled: auth.ownerShareManagementEnabled,
    davCompatibilityModeEnabled: auth.davCompatibilityModeEnabled,
    contactManagementEnabled: auth.contactManagementEnabled,
    contactChangeModerationEnabled: auth.contactChangeModerationEnabled,
    contactChangeRetentionDays: 90,
    milestonePurgeVisible: false,
    milestonePurgeAvailable: false,
    backupEnabled: false,
    backupLocalEnabled: true,
    backupLocalPath: "",
    backupS3Enabled: false,
    backupS3Disk: "s3",
    backupS3Prefix: "davvy-backups",
    backupTimezone: "UTC",
    backupScheduleTimes: "02:30",
    backupWeeklyDay: 0,
    backupMonthlyDay: 1,
    backupYearlyMonth: 1,
    backupYearlyDay: 1,
    backupRetentionDaily: 7,
    backupRetentionWeekly: 4,
    backupRetentionMonthly: 12,
    backupRetentionYearly: 3,
    backupLastRunAt: null,
    backupLastRunStatus: null,
    backupLastRunMessage: "",
  });
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "regular",
  });
  const [shareForm, setShareForm] = useState({
    resource_type: "calendar",
    resource_id: "",
    shared_with_id: "",
    permission: "read_only",
  });
  const [milestonePurgeSubmitting, setMilestonePurgeSubmitting] =
    useState(false);
  const [milestonePurgeSummary, setMilestonePurgeSummary] = useState("");
  const [retentionSubmitting, setRetentionSubmitting] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupRestoring, setBackupRestoring] = useState(false);
  const [backupRestoreMode, setBackupRestoreMode] = useState("merge");
  const [backupRestoreDryRun, setBackupRestoreDryRun] = useState(false);
  const [backupRestoreFile, setBackupRestoreFile] = useState(null);
  const [backupRestoreResult, setBackupRestoreResult] = useState(null);
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);
  const [backupRestoreRendered, setBackupRestoreRendered] = useState(false);
  const [backupRunToast, setBackupRunToast] = useState(null);
  const [backupConfigOpen, setBackupConfigOpen] = useState(false);
  const [backupConfigRendered, setBackupConfigRendered] = useState(false);
  const [backupAdvancedOpen, setBackupAdvancedOpen] = useState(false);
  const [backupRetentionPreset, setBackupRetentionPreset] =
    useState("recommended");
  const backupConfigOpenFrameRef = useRef(null);
  const backupRestoreOpenFrameRef = useRef(null);
  const backupConfigSnapshotRef = useRef(null);

  const captureBackupConfigSnapshot = () => ({
    backupEnabled: state.backupEnabled,
    backupLocalEnabled: state.backupLocalEnabled,
    backupLocalPath: state.backupLocalPath,
    backupS3Enabled: state.backupS3Enabled,
    backupS3Disk: state.backupS3Disk,
    backupS3Prefix: state.backupS3Prefix,
    backupTimezone: state.backupTimezone,
    backupScheduleTimes: state.backupScheduleTimes,
    backupWeeklyDay: state.backupWeeklyDay,
    backupMonthlyDay: state.backupMonthlyDay,
    backupYearlyMonth: state.backupYearlyMonth,
    backupYearlyDay: state.backupYearlyDay,
    backupRetentionDaily: state.backupRetentionDaily,
    backupRetentionWeekly: state.backupRetentionWeekly,
    backupRetentionMonthly: state.backupRetentionMonthly,
    backupRetentionYearly: state.backupRetentionYearly,
    backupRetentionPreset,
  });

  const restoreBackupConfigSnapshot = (snapshot) => {
    if (!snapshot) {
      return;
    }

    const { backupRetentionPreset: nextRetentionPreset, ...snapshotState } =
      snapshot;

    setBackupRetentionPreset(nextRetentionPreset);
    setState((prev) => ({
      ...prev,
      ...snapshotState,
    }));
  };

  const closeBackupConfigDrawer = ({ discardChanges = true } = {}) => {
    if (backupConfigOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(backupConfigOpenFrameRef.current);
      backupConfigOpenFrameRef.current = null;
    }

    if (discardChanges) {
      restoreBackupConfigSnapshot(backupConfigSnapshotRef.current);
    }

    backupConfigSnapshotRef.current = null;
    setBackupAdvancedOpen(false);
    setBackupConfigOpen(false);
  };

  const resetBackupRestoreForm = () => {
    setBackupRestoreMode("merge");
    setBackupRestoreDryRun(false);
    setBackupRestoreFile(null);
    setBackupRestoreResult(null);
  };

  const closeBackupRestoreDrawer = () => {
    if (backupRestoreOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(backupRestoreOpenFrameRef.current);
      backupRestoreOpenFrameRef.current = null;
    }

    setBackupRestoreOpen(false);
  };

  const openBackupConfigDrawer = () => {
    if (backupConfigOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(backupConfigOpenFrameRef.current);
      backupConfigOpenFrameRef.current = null;
    }

    backupConfigSnapshotRef.current = captureBackupConfigSnapshot();
    setBackupAdvancedOpen(false);
    setBackupConfigRendered(true);
    setBackupConfigOpen(false);

    backupConfigOpenFrameRef.current = window.requestAnimationFrame(() => {
      backupConfigOpenFrameRef.current = null;
      setBackupConfigOpen(true);
    });
  };

  const openBackupRestoreDrawer = () => {
    if (backupRestoreOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(backupRestoreOpenFrameRef.current);
      backupRestoreOpenFrameRef.current = null;
    }

    resetBackupRestoreForm();
    setBackupRestoreRendered(true);
    setBackupRestoreOpen(false);

    backupRestoreOpenFrameRef.current = window.requestAnimationFrame(() => {
      backupRestoreOpenFrameRef.current = null;
      setBackupRestoreOpen(true);
    });
  };

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const [users, resources, shares, retention, backupSettings] =
        await Promise.all([
          api.get("/api/admin/users"),
          api.get("/api/admin/resources"),
          api.get("/api/admin/shares"),
          api.get("/api/admin/settings/contact-change-retention"),
          api.get("/api/admin/settings/backups"),
        ]);

      const backup = backupSettings.data ?? {};
      const lastRun = backup.last_run ?? {};
      const backupRetentionDaily = Number(backup.retention_daily ?? 7);
      const backupRetentionWeekly = Number(backup.retention_weekly ?? 4);
      const backupRetentionMonthly = Number(backup.retention_monthly ?? 12);
      const backupRetentionYearly = Number(backup.retention_yearly ?? 3);

      setBackupRetentionPreset(
        isRecommendedBackupRetention({
          daily: backupRetentionDaily,
          weekly: backupRetentionWeekly,
          monthly: backupRetentionMonthly,
          yearly: backupRetentionYearly,
        })
          ? "recommended"
          : "custom",
      );

      setState((prev) => ({
        ...prev,
        loading: false,
        users: users.data.data,
        resources: resources.data,
        shares: shares.data.data,
        contactChangeRetentionDays: Number(retention.data?.days || 90),
        milestonePurgeVisible: !!resources.data?.milestone_purge_visible,
        milestonePurgeAvailable: !!resources.data?.milestone_purge_available,
        backupEnabled: !!backup.enabled,
        backupLocalEnabled: !!backup.local_enabled,
        backupLocalPath: backup.local_path || "",
        backupS3Enabled: !!backup.s3_enabled,
        backupS3Disk: backup.s3_disk || "s3",
        backupS3Prefix: backup.s3_prefix || "",
        backupTimezone: backup.timezone || "UTC",
        backupScheduleTimes: Array.isArray(backup.schedule_times)
          ? backup.schedule_times.join(", ")
          : "02:30",
        backupWeeklyDay: Number(backup.weekly_day ?? 0),
        backupMonthlyDay: Number(backup.monthly_day ?? 1),
        backupYearlyMonth: Number(backup.yearly_month ?? 1),
        backupYearlyDay: Number(backup.yearly_day ?? 1),
        backupRetentionDaily,
        backupRetentionWeekly,
        backupRetentionMonthly,
        backupRetentionYearly,
        backupLastRunAt: lastRun.at || null,
        backupLastRunStatus: lastRun.status || null,
        backupLastRunMessage: lastRun.message || "",
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: extractError(err, "Unable to load admin data."),
      }));
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!milestonePurgeSummary) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => setMilestonePurgeSummary(""),
      MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [milestonePurgeSummary]);

  useEffect(() => {
    if (!backupRunToast) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => setBackupRunToast(null),
      BACKUP_RUN_TOAST_AUTO_HIDE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [backupRunToast]);

  useEffect(() => {
    if (backupConfigOpen) {
      setBackupConfigRendered(true);
      return undefined;
    }

    const timer = window.setTimeout(
      () => setBackupConfigRendered(false),
      BACKUP_DRAWER_ANIMATION_MS,
    );

    return () => window.clearTimeout(timer);
  }, [backupConfigOpen]);

  useEffect(() => {
    if (backupRestoreOpen) {
      setBackupRestoreRendered(true);
      return undefined;
    }

    const timer = window.setTimeout(
      () => setBackupRestoreRendered(false),
      BACKUP_DRAWER_ANIMATION_MS,
    );

    return () => window.clearTimeout(timer);
  }, [backupRestoreOpen]);

  useEffect(
    () => () => {
      if (backupConfigOpenFrameRef.current !== null) {
        window.cancelAnimationFrame(backupConfigOpenFrameRef.current);
      }
      if (backupRestoreOpenFrameRef.current !== null) {
        window.cancelAnimationFrame(backupRestoreOpenFrameRef.current);
      }

      backupConfigSnapshotRef.current = null;
    },
    [],
  );

  const createUser = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/admin/users", userForm);
      setUserForm({ name: "", email: "", password: "", role: "regular" });
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to create user."),
      }));
    }
  };

  const saveShare = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/admin/shares", {
        ...shareForm,
        resource_id: Number(shareForm.resource_id),
        shared_with_id: Number(shareForm.shared_with_id),
      });
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to save share."),
      }));
    }
  };

  const deleteShare = async (id) => {
    try {
      await api.delete(`/api/admin/shares/${id}`);
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to remove share."),
      }));
    }
  };

  const toggleRegistration = async () => {
    const next = !state.registrationEnabled;

    try {
      const response = await api.patch("/api/admin/settings/registration", {
        enabled: next,
      });
      setState((prev) => ({
        ...prev,
        registrationEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        registrationEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to update registration setting."),
      }));
    }
  };

  const toggleOwnerShareManagement = async () => {
    const next = !state.ownerShareManagementEnabled;

    try {
      const response = await api.patch(
        "/api/admin/settings/owner-share-management",
        { enabled: next },
      );
      setState((prev) => ({
        ...prev,
        ownerShareManagementEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        ownerShareManagementEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update owner share management setting.",
        ),
      }));
    }
  };

  const toggleDavCompatibilityMode = async () => {
    const next = !state.davCompatibilityModeEnabled;

    try {
      const response = await api.patch(
        "/api/admin/settings/dav-compatibility-mode",
        { enabled: next },
      );
      setState((prev) => ({
        ...prev,
        davCompatibilityModeEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        davCompatibilityModeEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update DAV compatibility mode setting.",
        ),
      }));
    }
  };

  const toggleContactManagement = async () => {
    const next = !state.contactManagementEnabled;

    try {
      const response = await api.patch(
        "/api/admin/settings/contact-management",
        {
          enabled: next,
        },
      );
      setState((prev) => ({
        ...prev,
        contactManagementEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        contactManagementEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update contact management setting.",
        ),
      }));
    }
  };

  const toggleContactChangeModeration = async () => {
    const next = !state.contactChangeModerationEnabled;

    try {
      const response = await api.patch(
        "/api/admin/settings/contact-change-moderation",
        {
          enabled: next,
        },
      );
      setState((prev) => ({
        ...prev,
        contactChangeModerationEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        contactChangeModerationEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update contact change moderation setting.",
        ),
      }));
    }
  };

  const purgeGeneratedMilestoneCalendars = async () => {
    if (milestonePurgeSubmitting || !state.milestonePurgeAvailable) {
      return;
    }

    const confirmed = window.confirm(
      "This will delete all generated Birthday/Anniversary calendars and disable milestone sync across address books. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setMilestonePurgeSubmitting(true);
    setMilestonePurgeSummary("");
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.post(
        "/api/admin/contact-milestones/purge-generated-calendars",
      );
      const purgedCalendars = Number(response.data?.purged_calendar_count ?? 0);
      const purgedEvents = Number(response.data?.purged_event_count ?? 0);
      const disabledSettings = Number(
        response.data?.disabled_setting_count ?? 0,
      );
      setMilestonePurgeSummary(
        `Purged ${purgedCalendars} generated calendar(s), removed ${purgedEvents} event(s), and disabled ${disabledSettings} setting(s).`,
      );
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to purge generated milestone calendars.",
        ),
      }));
    } finally {
      setMilestonePurgeSubmitting(false);
    }
  };

  const saveContactChangeRetention = async () => {
    const days = Number(state.contactChangeRetentionDays);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      setState((prev) => ({
        ...prev,
        error: "Retention days must be between 1 and 3650.",
      }));
      return;
    }

    setRetentionSubmitting(true);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.patch(
        "/api/admin/settings/contact-change-retention",
        {
          days,
        },
      );

      setState((prev) => ({
        ...prev,
        contactChangeRetentionDays: Number(response.data?.days || days),
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to update retention setting."),
      }));
    } finally {
      setRetentionSubmitting(false);
    }
  };

  const saveBackupSettings = async () => {
    const scheduleTimes = parseBackupScheduleTimes(state.backupScheduleTimes);
    const retentionDaily =
      backupRetentionPreset === "recommended"
        ? RECOMMENDED_BACKUP_RETENTION.daily
        : Number(state.backupRetentionDaily);
    const retentionWeekly =
      backupRetentionPreset === "recommended"
        ? RECOMMENDED_BACKUP_RETENTION.weekly
        : Number(state.backupRetentionWeekly);
    const retentionMonthly =
      backupRetentionPreset === "recommended"
        ? RECOMMENDED_BACKUP_RETENTION.monthly
        : Number(state.backupRetentionMonthly);
    const retentionYearly =
      backupRetentionPreset === "recommended"
        ? RECOMMENDED_BACKUP_RETENTION.yearly
        : Number(state.backupRetentionYearly);
    if (scheduleTimes.length === 0) {
      setState((prev) => ({
        ...prev,
        error: "Backup schedule must include one or more HH:MM values.",
      }));
      return;
    }

    if (
      state.backupEnabled &&
      !state.backupLocalEnabled &&
      !state.backupS3Enabled
    ) {
      setState((prev) => ({
        ...prev,
        error:
          "Enable at least one destination (local or S3) when backups are enabled.",
      }));
      return;
    }

    setBackupSaving(true);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.patch("/api/admin/settings/backups", {
        enabled: !!state.backupEnabled,
        local_enabled: !!state.backupLocalEnabled,
        local_path: state.backupLocalPath,
        s3_enabled: !!state.backupS3Enabled,
        s3_disk: state.backupS3Disk,
        s3_prefix: state.backupS3Prefix,
        schedule_times: scheduleTimes,
        timezone: state.backupTimezone,
        weekly_day: Number(state.backupWeeklyDay),
        monthly_day: Number(state.backupMonthlyDay),
        yearly_month: Number(state.backupYearlyMonth),
        yearly_day: Number(state.backupYearlyDay),
        retention_daily: retentionDaily,
        retention_weekly: retentionWeekly,
        retention_monthly: retentionMonthly,
        retention_yearly: retentionYearly,
      });

      const backup = response.data ?? {};
      const lastRun = backup.last_run ?? {};
      const nextRetentionDaily = Number(
        backup.retention_daily ?? retentionDaily,
      );
      const nextRetentionWeekly = Number(
        backup.retention_weekly ?? retentionWeekly,
      );
      const nextRetentionMonthly = Number(
        backup.retention_monthly ?? retentionMonthly,
      );
      const nextRetentionYearly = Number(
        backup.retention_yearly ?? retentionYearly,
      );

      setBackupRetentionPreset(
        isRecommendedBackupRetention({
          daily: nextRetentionDaily,
          weekly: nextRetentionWeekly,
          monthly: nextRetentionMonthly,
          yearly: nextRetentionYearly,
        })
          ? "recommended"
          : "custom",
      );

      setState((prev) => ({
        ...prev,
        backupEnabled: !!backup.enabled,
        backupLocalEnabled: !!backup.local_enabled,
        backupLocalPath: backup.local_path || "",
        backupS3Enabled: !!backup.s3_enabled,
        backupS3Disk: backup.s3_disk || "s3",
        backupS3Prefix: backup.s3_prefix || "",
        backupTimezone: backup.timezone || "UTC",
        backupScheduleTimes: Array.isArray(backup.schedule_times)
          ? backup.schedule_times.join(", ")
          : prev.backupScheduleTimes,
        backupWeeklyDay: Number(backup.weekly_day ?? 0),
        backupMonthlyDay: Number(backup.monthly_day ?? 1),
        backupYearlyMonth: Number(backup.yearly_month ?? 1),
        backupYearlyDay: Number(backup.yearly_day ?? 1),
        backupRetentionDaily: nextRetentionDaily,
        backupRetentionWeekly: nextRetentionWeekly,
        backupRetentionMonthly: nextRetentionMonthly,
        backupRetentionYearly: nextRetentionYearly,
        backupLastRunAt: lastRun.at || prev.backupLastRunAt,
        backupLastRunStatus: lastRun.status || prev.backupLastRunStatus,
        backupLastRunMessage: lastRun.message || prev.backupLastRunMessage,
      }));
      closeBackupConfigDrawer({ discardChanges: false });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to save backup settings."),
      }));
    } finally {
      setBackupSaving(false);
    }
  };

  const runBackupNow = async () => {
    if (backupRunning) {
      return;
    }

    if (!state.backupLocalEnabled && !state.backupS3Enabled) {
      setState((prev) => ({
        ...prev,
        error:
          "Configure at least one destination (local or S3) before running a backup.",
      }));
      return;
    }

    setBackupRunning(true);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.post("/api/admin/backups/run");
      const result = response.data ?? {};
      const nextStatus = result.status || "success";
      const nextMessage = result.reason || "Backup completed successfully.";

      setState((prev) => ({
        ...prev,
        backupLastRunAt: result.executed_at_utc || prev.backupLastRunAt,
        backupLastRunStatus: nextStatus,
        backupLastRunMessage: nextMessage,
      }));
      setBackupRunToast({
        status: nextStatus,
        message: nextMessage,
      });

      await load();
    } catch (err) {
      const message = extractError(err, "Unable to run backup now.");
      setState((prev) => ({
        ...prev,
        error: message,
        backupLastRunStatus: "failed",
        backupLastRunMessage: message,
      }));
      setBackupRunToast({
        status: "failed",
        message,
      });
    } finally {
      setBackupRunning(false);
    }
  };

  const runBackupRestore = async () => {
    if (backupRestoring) {
      return;
    }

    if (!backupRestoreFile) {
      setState((prev) => ({
        ...prev,
        error: "Select a backup ZIP archive before running restore.",
      }));
      return;
    }

    const confirmMessage = backupRestoreDryRun
      ? "Run backup restore dry-run? No data will be modified."
      : backupRestoreMode === "replace"
        ? "Replace mode will delete existing calendars/address books for owners included in the archive before restoring. Continue?"
        : "Run backup restore in merge mode?";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setBackupRestoring(true);
    setBackupRestoreResult(null);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const form = new FormData();
      form.append("backup", backupRestoreFile);
      form.append("mode", backupRestoreMode);
      form.append("dry_run", backupRestoreDryRun ? "1" : "0");

      const response = await api.post("/api/admin/backups/restore", form, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      const result = response.data ?? {};

      setBackupRestoreResult(result);
      setBackupRunToast({
        status: result.status || "success",
        message: result.reason || "Backup restore completed.",
      });

      if (!backupRestoreDryRun) {
        await load();
      }
    } catch (err) {
      const message = extractError(err, "Unable to restore backup archive.");
      setState((prev) => ({
        ...prev,
        error: message,
      }));
      setBackupRunToast({
        status: "failed",
        message,
      });
    } finally {
      setBackupRestoring(false);
    }
  };

  const resourceOptions =
    shareForm.resource_type === "calendar"
      ? state.resources.calendars
      : state.resources.address_books;
  const backupTimezoneGroups = useMemo(() => buildTimezoneGroups(), []);
  const backupTimezoneExistsInOptions = useMemo(
    () =>
      backupTimezoneGroups.some((group) =>
        group.options.some((option) => option.value === state.backupTimezone),
      ),
    [backupTimezoneGroups, state.backupTimezone],
  );
  const backupLastRunLabel = state.backupLastRunStatus
    ? `${state.backupLastRunStatus.toUpperCase()} at ${formatAdminTimestamp(
        state.backupLastRunAt,
      )}`
    : "No backup has run yet.";
  const backupDestinationSummary = [
    state.backupLocalEnabled ? "Local" : null,
    state.backupS3Enabled ? `S3 (${state.backupS3Disk})` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const backupHasDestination = !!backupDestinationSummary;
  const backupScheduleValues = parseBackupScheduleTimes(
    state.backupScheduleTimes,
  );
  const backupScheduleSummary =
    backupScheduleValues.length === 0
      ? `No windows (${state.backupTimezone})`
      : backupScheduleValues.length <= 2
        ? `${backupScheduleValues.join(", ")} (${state.backupTimezone})`
        : `${backupScheduleValues.length} windows (${state.backupTimezone})`;
  const backupRetentionSummary = `${Number(state.backupRetentionDaily)}d / ${Number(
    state.backupRetentionWeekly,
  )}w / ${Number(state.backupRetentionMonthly)}m / ${Number(
    state.backupRetentionYearly,
  )}y`;
  const backupRestoreSummary = backupRestoreResult?.summary ?? null;
  const backupRestoreWarnings = Array.isArray(backupRestoreResult?.warnings)
    ? backupRestoreResult.warnings
    : [];
  const backupRunToastStatus = String(
    backupRunToast?.status || "",
  ).toLowerCase();
  const backupRunToastToneClass =
    backupRunToastStatus === "failed"
      ? "text-app-danger"
      : backupRunToastStatus === "success"
        ? "text-app-accent"
        : "text-app-faint";
  const backupConfigHasUnsavedChanges =
    !!backupConfigSnapshotRef.current &&
    !areBackupConfigSnapshotsEqual(
      captureBackupConfigSnapshot(),
      backupConfigSnapshotRef.current,
    );
  const backupSaveButtonClass = backupConfigHasUnsavedChanges
    ? "btn btn-outline-sm"
    : "btn-outline btn-outline-sm";

  return (
    <AppShell auth={auth} theme={theme}>
      <div className="surface fade-up rounded-3xl p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Admin Control Center</h2>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <AdminFeatureToggle
            label="Public registration"
            enabled={state.registrationEnabled}
            onClick={toggleRegistration}
          />
          <AdminFeatureToggle
            label="Owner sharing"
            enabled={state.ownerShareManagementEnabled}
            onClick={toggleOwnerShareManagement}
          />
          <AdminFeatureToggle
            label="DAV compatibility mode"
            enabled={state.davCompatibilityModeEnabled}
            onClick={toggleDavCompatibilityMode}
          />
          <AdminFeatureToggle
            label="Contact management"
            enabled={state.contactManagementEnabled}
            onClick={toggleContactManagement}
          />
          <AdminFeatureToggle
            label="Review queue"
            enabled={state.contactChangeModerationEnabled}
            onClick={toggleContactChangeModeration}
          />
        </div>
        <div className="mt-4">
          <Field label="Queue retention (days)">
            <p className="mb-2 text-xs text-app-faint">
              Applied/denied queue history older than this is purged
              automatically.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <input
                className="input w-40"
                type="number"
                min="1"
                max="3650"
                value={state.contactChangeRetentionDays}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    contactChangeRetentionDays: event.target.value,
                  }))
                }
              />
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={saveContactChangeRetention}
                disabled={retentionSubmitting}
              >
                {retentionSubmitting ? "Saving..." : "Save Retention"}
              </button>
            </div>
          </Field>
        </div>
        <div className="mt-6 rounded-2xl border border-app-edge bg-app-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-app-strong">
                Automated Backups
              </h3>
              <p className="mt-1 text-xs text-app-faint">
                Rotating snapshots for calendars and address books.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn btn-outline-sm"
                type="button"
                onClick={runBackupNow}
                disabled={backupRunning || !backupHasDestination}
                title={
                  !backupHasDestination
                    ? "Configure at least one destination first."
                    : undefined
                }
              >
                {backupRunning ? "Running backup..." : "Run Backup Now"}
              </button>
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={openBackupConfigDrawer}
              >
                Configure
              </button>
              <button
                className="inline-flex items-center gap-1 px-1 text-xs font-medium text-app-muted transition hover:text-app-strong"
                type="button"
                onClick={openBackupRestoreDrawer}
              >
                Restore...
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-app-edge bg-app-surface px-2.5 py-1 text-xs">
              <span className="text-app-faint">Status</span>
              <span className="font-semibold text-app-strong">
                {state.backupEnabled ? "Enabled" : "Disabled"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-app-edge bg-app-surface px-2.5 py-1 text-xs">
              <span className="text-app-faint">Destinations</span>
              <span className="font-semibold text-app-strong">
                {backupDestinationSummary || "None"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-app-edge bg-app-surface px-2.5 py-1 text-xs">
              <span className="text-app-faint">Schedule</span>
              <span className="font-semibold text-app-strong">
                {backupScheduleSummary}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-app-edge bg-app-surface px-2.5 py-1 text-xs">
              <span className="text-app-faint">Retention</span>
              <span className="font-semibold text-app-strong">
                {backupRetentionSummary}
              </span>
            </span>
          </div>

          <p className="mt-3 text-xs text-app-faint">
            Last Run: {backupLastRunLabel}
          </p>
          {state.backupLastRunMessage ? (
            <p
              className={`mt-1 text-xs ${
                state.backupLastRunStatus === "failed"
                  ? "text-app-danger"
                  : state.backupLastRunStatus === "success"
                    ? "text-app-accent"
                    : "text-app-faint"
              }`}
            >
              {state.backupLastRunMessage}
            </p>
          ) : null}
        </div>
        {state.milestonePurgeVisible ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              className="btn-outline btn-outline-sm text-app-danger"
              type="button"
              onClick={purgeGeneratedMilestoneCalendars}
              disabled={
                milestonePurgeSubmitting || !state.milestonePurgeAvailable
              }
              title={
                !state.milestonePurgeAvailable
                  ? "No enabled/generated milestone calendars to purge."
                  : undefined
              }
            >
              {milestonePurgeSubmitting
                ? "Purging milestone calendars..."
                : "Purge Generated Milestone Calendars"}
            </button>
            <p className="text-xs text-app-faint">
              Deletes generated Birthday/Anniversary calendars and disables
              milestone sync settings.
            </p>
          </div>
        ) : null}
        {milestonePurgeSummary ? (
          <p className="mt-2 text-sm text-app-accent">
            {milestonePurgeSummary}
          </p>
        ) : null}
        {state.error ? (
          <p className="mt-3 text-sm text-app-danger">{state.error}</p>
        ) : null}
      </div>

      {backupRunToast ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-30 w-[min(92vw,28rem)] rounded-xl border border-app-edge bg-app-surface px-3 py-2 shadow-2xl">
          <p
            className={`text-[11px] font-semibold uppercase tracking-wide ${backupRunToastToneClass}`}
          >
            {String(backupRunToast.status || "status").toUpperCase()}
          </p>
          <p className="mt-1 text-sm text-app-strong">
            {backupRunToast.message}
          </p>
        </div>
      ) : null}

      {backupConfigRendered ? (
        <div
          className={`fixed inset-0 z-40 ${
            backupConfigOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
          aria-hidden={!backupConfigOpen}
        >
          <button
            type="button"
            aria-label="Close backup configuration"
            className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
              backupConfigOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeBackupConfigDrawer}
            tabIndex={backupConfigOpen ? 0 : -1}
          />
          <div
            className={`absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-app-edge bg-app-surface p-5 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
              backupConfigOpen
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-app-strong">
                  Backup Configuration
                </h3>
                <p className="mt-1 text-sm text-app-muted">
                  Configure destinations, schedule windows, and retention
                  strategy.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline btn-outline-sm"
                onClick={closeBackupConfigDrawer}
              >
                Close
              </button>
            </div>

            <section className="mt-5 rounded-2xl border border-app-edge p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <AdminFeatureToggle
                  label="Backups enabled"
                  enabled={state.backupEnabled}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      backupEnabled: !prev.backupEnabled,
                    }))
                  }
                />
                <AdminFeatureToggle
                  label="Local destination"
                  enabled={state.backupLocalEnabled}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      backupLocalEnabled: !prev.backupLocalEnabled,
                    }))
                  }
                />
                <AdminFeatureToggle
                  label="S3 destination"
                  enabled={state.backupS3Enabled}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      backupS3Enabled: !prev.backupS3Enabled,
                    }))
                  }
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Schedule times (HH:MM, comma-separated)">
                  <input
                    className="input"
                    value={state.backupScheduleTimes}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        backupScheduleTimes: event.target.value,
                      }))
                    }
                    placeholder="02:30, 14:30"
                  />
                </Field>
                <Field label="Timezone">
                  <select
                    className="input"
                    value={state.backupTimezone}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        backupTimezone: event.target.value,
                      }))
                    }
                  >
                    {!backupTimezoneExistsInOptions && state.backupTimezone ? (
                      <option value={state.backupTimezone}>
                        {state.backupTimezone} (current)
                      </option>
                    ) : null}
                    {backupTimezoneGroups.map((group) => (
                      <optgroup key={group.region} label={group.region}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                {state.backupLocalEnabled ? (
                  <Field label="Local backup path">
                    <input
                      className="input"
                      value={state.backupLocalPath}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupLocalPath: event.target.value,
                        }))
                      }
                      placeholder="/var/backups/davvy"
                    />
                  </Field>
                ) : null}
                {state.backupS3Enabled ? (
                  <Field label="S3 disk name">
                    <input
                      className="input"
                      value={state.backupS3Disk}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupS3Disk: event.target.value,
                        }))
                      }
                      placeholder="s3"
                    />
                  </Field>
                ) : null}
                {state.backupS3Enabled ? (
                  <Field label="S3 key prefix">
                    <input
                      className="input"
                      value={state.backupS3Prefix}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupS3Prefix: event.target.value,
                        }))
                      }
                      placeholder="davvy-backups"
                    />
                  </Field>
                ) : null}
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-app-edge p-4">
              <button
                className="flex w-full items-center justify-between text-left"
                type="button"
                onClick={() => setBackupAdvancedOpen((prev) => !prev)}
              >
                <span className="text-sm font-semibold text-app-strong">
                  Advanced
                </span>
                <span className="text-xs text-app-muted">
                  {backupAdvancedOpen ? "Hide" : "Show"}
                </span>
              </button>

              {backupAdvancedOpen ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Weekly backup day">
                    <select
                      className="input"
                      value={state.backupWeeklyDay}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupWeeklyDay: Number(event.target.value),
                        }))
                      }
                    >
                      {WEEKDAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monthly backup day">
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="31"
                      value={state.backupMonthlyDay}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupMonthlyDay: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Yearly backup month">
                    <select
                      className="input"
                      value={state.backupYearlyMonth}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupYearlyMonth: Number(event.target.value),
                        }))
                      }
                    >
                      {MONTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Yearly backup day">
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="31"
                      value={state.backupYearlyDay}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupYearlyDay: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <Field label="Retention strategy">
                    <select
                      className="input"
                      value={backupRetentionPreset}
                      onChange={(event) => {
                        const preset = event.target.value;
                        setBackupRetentionPreset(preset);

                        if (preset === "recommended") {
                          setState((prev) => ({
                            ...prev,
                            backupRetentionDaily:
                              RECOMMENDED_BACKUP_RETENTION.daily,
                            backupRetentionWeekly:
                              RECOMMENDED_BACKUP_RETENTION.weekly,
                            backupRetentionMonthly:
                              RECOMMENDED_BACKUP_RETENTION.monthly,
                            backupRetentionYearly:
                              RECOMMENDED_BACKUP_RETENTION.yearly,
                          }));
                        }
                      }}
                    >
                      <option value="recommended">
                        Recommended (7/4/12/3)
                      </option>
                      <option value="custom">Custom</option>
                    </select>
                  </Field>

                  {backupRetentionPreset === "custom" ? (
                    <div className="md:col-span-2">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Daily retention">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="3650"
                            value={state.backupRetentionDaily}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                backupRetentionDaily: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="Weekly retention">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="520"
                            value={state.backupRetentionWeekly}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                backupRetentionWeekly: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="Monthly retention">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="240"
                            value={state.backupRetentionMonthly}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                backupRetentionMonthly: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="Yearly retention">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="50"
                            value={state.backupRetentionYearly}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                backupRetentionYearly: event.target.value,
                              }))
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={closeBackupConfigDrawer}
              >
                Cancel
              </button>
              <button
                className={backupSaveButtonClass}
                type="button"
                onClick={saveBackupSettings}
                disabled={backupSaving}
              >
                {backupSaving ? "Saving..." : "Save Backup Settings"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {backupRestoreRendered ? (
        <div
          className={`fixed inset-0 z-40 ${
            backupRestoreOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
          aria-hidden={!backupRestoreOpen}
        >
          <button
            type="button"
            aria-label="Close backup restore"
            className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
              backupRestoreOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeBackupRestoreDrawer}
            tabIndex={backupRestoreOpen ? 0 : -1}
          />
          <div
            className={`absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-app-edge bg-app-surface p-5 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
              backupRestoreOpen
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-app-strong">
                  Restore Backup Archive
                </h3>
                <p className="mt-1 text-sm text-app-muted">
                  Import a generated backup ZIP into calendars and address
                  books.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline btn-outline-sm"
                onClick={closeBackupRestoreDrawer}
              >
                Close
              </button>
            </div>

            <section className="mt-5 rounded-2xl border border-app-edge p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Backup ZIP file">
                  <input
                    className="input"
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setBackupRestoreFile(nextFile);
                    }}
                  />
                </Field>
                <Field label="Restore mode">
                  <select
                    className="input"
                    value={backupRestoreMode}
                    onChange={(event) =>
                      setBackupRestoreMode(event.target.value)
                    }
                  >
                    <option value="merge">Merge (upsert)</option>
                    <option value="replace">Replace owner data</option>
                  </select>
                </Field>
              </div>

              {backupRestoreFile ? (
                <p className="mt-2 max-w-full truncate text-xs text-app-faint">
                  Selected: {backupRestoreFile.name}
                </p>
              ) : null}

              <label className="mt-3 inline-flex items-center gap-2 text-xs text-app-faint">
                <input
                  type="checkbox"
                  checked={backupRestoreDryRun}
                  onChange={(event) =>
                    setBackupRestoreDryRun(!!event.target.checked)
                  }
                />
                Dry run only (preview changes without writing data)
              </label>

              {backupRestoreMode === "replace" ? (
                <p className="mt-2 text-xs text-app-danger">
                  Replace mode deletes existing owner resources in scope before
                  restore.
                </p>
              ) : null}
            </section>

            {backupRestoreResult ? (
              <div className="mt-4 rounded-xl border border-app-edge bg-app-surface p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-app-faint">
                  Restore Result
                </p>
                <p className="mt-1 text-sm text-app-strong">
                  {backupRestoreResult.reason ||
                    "Restore completed successfully."}
                </p>

                {backupRestoreSummary ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <p className="text-xs text-app-faint">
                      Files processed:{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(backupRestoreSummary.files_processed || 0)}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Files skipped:{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(backupRestoreSummary.files_skipped || 0)}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Calendars (create/update):{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(backupRestoreSummary.calendars_created || 0)}/
                        {Number(backupRestoreSummary.calendars_updated || 0)}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Address books (create/update):{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(
                          backupRestoreSummary.address_books_created || 0,
                        )}
                        /
                        {Number(
                          backupRestoreSummary.address_books_updated || 0,
                        )}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Objects (create/update):{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(
                          (backupRestoreSummary.calendar_objects_created || 0) +
                            (backupRestoreSummary.cards_created || 0),
                        )}
                        /
                        {Number(
                          (backupRestoreSummary.calendar_objects_updated || 0) +
                            (backupRestoreSummary.cards_updated || 0),
                        )}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Invalid resources skipped:{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(
                          backupRestoreSummary.resources_skipped_invalid || 0,
                        )}
                      </span>
                    </p>
                  </div>
                ) : null}

                {backupRestoreWarnings.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-app-faint">
                      Warnings
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-app-faint">
                      {backupRestoreWarnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={closeBackupRestoreDrawer}
              >
                Cancel
              </button>
              <button
                className="btn-outline-accent btn-outline-sm"
                type="button"
                onClick={runBackupRestore}
                disabled={backupRestoring || !backupRestoreFile}
              >
                {backupRestoring
                  ? "Running restore..."
                  : backupRestoreDryRun
                    ? "Run Restore Dry-Run"
                    : "Run Restore"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {state.loading ? (
        <FullPageState label="Loading admin data..." compact />
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="surface rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Create User</h3>
            <form className="mt-3 space-y-3" onSubmit={createUser}>
              <input
                className="input"
                placeholder="Name"
                value={userForm.name}
                onChange={(e) =>
                  setUserForm({ ...userForm, name: e.target.value })
                }
                required
              />
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={userForm.email}
                onChange={(e) =>
                  setUserForm({ ...userForm, email: e.target.value })
                }
                required
              />
              <input
                className="input"
                type="password"
                placeholder="Password"
                value={userForm.password}
                onChange={(e) =>
                  setUserForm({ ...userForm, password: e.target.value })
                }
                required
              />
              <select
                className="input"
                value={userForm.role}
                onChange={(e) =>
                  setUserForm({ ...userForm, role: e.target.value })
                }
              >
                <option value="regular">Regular</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn" type="submit">
                Create User
              </button>
            </form>

            <div className="mt-5 space-y-2">
              {state.users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-xl border border-app-edge bg-app-surface p-3 text-sm"
                >
                  <p className="font-semibold text-app-strong">{user.name}</p>
                  <p className="text-app-muted">{user.email}</p>
                  <p className="text-xs text-app-faint">
                    Role: {user.role} | Calendars: {user.calendars_count} |
                    Address books: {user.address_books_count}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="surface rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Assign Share Access</h3>
            <form className="mt-3 space-y-3" onSubmit={saveShare}>
              <select
                className="input"
                value={shareForm.resource_type}
                onChange={(e) =>
                  setShareForm({
                    ...shareForm,
                    resource_type: e.target.value,
                    resource_id: "",
                  })
                }
              >
                <option value="calendar">Calendar</option>
                <option value="address_book">Address Book</option>
              </select>
              <select
                className="input"
                value={shareForm.resource_id}
                onChange={(e) =>
                  setShareForm({ ...shareForm, resource_id: e.target.value })
                }
                required
              >
                <option value="">Select sharable resource</option>
                {resourceOptions.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.display_name} ({resource.owner?.email})
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={shareForm.shared_with_id}
                onChange={(e) =>
                  setShareForm({ ...shareForm, shared_with_id: e.target.value })
                }
                required
              >
                <option value="">Select user</option>
                {state.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={shareForm.permission}
                onChange={(e) =>
                  setShareForm({ ...shareForm, permission: e.target.value })
                }
              >
                <option value="read_only">General (read-only)</option>
                <option value="editor">Editor (full edit, no delete)</option>
                <option value="admin">Admin (full edit + delete)</option>
              </select>
              <button className="btn" type="submit">
                Save Share
              </button>
            </form>

            <div className="mt-5 space-y-2">
              {state.shares.map((share) => (
                <div
                  key={share.id}
                  className="rounded-xl border border-app-edge bg-app-surface p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-app-strong">
                      {share.resource_type} #{share.resource_id}
                    </p>
                    <PermissionBadge permission={share.permission} />
                  </div>
                  <p className="text-app-muted">
                    Owner: {share.owner.name} ({share.owner.email})
                  </p>
                  <p className="text-app-muted">
                    Shared with: {share.shared_with.name} (
                    {share.shared_with.email})
                  </p>
                  <button
                    className="mt-2 text-xs font-semibold text-app-danger"
                    onClick={() => deleteShare(share.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function ProfilePage({ auth, theme }) {
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    password: "",
    password_confirmation: "",
  });

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordSubmitting(true);
    setPasswordError("");
    setPasswordSuccess("");

    try {
      await api.patch("/api/auth/password", passwordForm);
      setPasswordSuccess(
        "Password updated. Use your new password for app login and DAV clients.",
      );
      setPasswordForm({
        current_password: "",
        password: "",
        password_confirmation: "",
      });
    } catch (err) {
      setPasswordError(extractError(err, "Unable to update password."));
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <AppShell auth={auth} theme={theme}>
      <section className="fade-up grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Name"
          value={auth.user.name}
          helper="Displayed to other users when sharing resources."
        />
        <InfoCard
          title="Email"
          value={auth.user.email}
          helper="Used for web sign-in and DAV clients."
        />
        <InfoCard
          title="Role"
          value={auth.user.role.toUpperCase()}
          helper="Access level for administrative features."
        />
      </section>

      <section className="surface mt-6 rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-app-strong">
          Change Password
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          Change your password for both web access and DAV client connections.
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-3"
          onSubmit={changePassword}
        >
          <Field label="Current password">
            <input
              className="input"
              type="password"
              value={passwordForm.current_password}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  current_password: event.target.value,
                })
              }
              required
            />
          </Field>
          <Field label="New password">
            <input
              className="input"
              type="password"
              value={passwordForm.password}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  password: event.target.value,
                })
              }
              required
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className="input"
              type="password"
              value={passwordForm.password_confirmation}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  password_confirmation: event.target.value,
                })
              }
              required
            />
          </Field>

          {passwordError ? (
            <p className="md:col-span-3 text-sm text-app-danger">
              {passwordError}
            </p>
          ) : null}
          {passwordSuccess ? (
            <p className="md:col-span-3 text-sm text-app-accent">
              {passwordSuccess}
            </p>
          ) : null}

          <div className="md:col-span-3 flex flex-wrap items-center gap-2">
            <button className="btn" disabled={passwordSubmitting} type="submit">
              {passwordSubmitting ? "Updating password..." : "Update Password"}
            </button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}

function AppShell({ auth, theme, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const onAdminPage = location.pathname === "/admin";
  const onReviewQueuePage = location.pathname === "/review-queue";
  const [reviewQueueCount, setReviewQueueCount] = useState(0);
  const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);

  const logout = async () => {
    setMobileAccountMenuOpen(false);
    await api.post("/api/auth/logout");
    auth.setAuth({
      loading: false,
      user: null,
      registrationEnabled: auth.registrationEnabled,
      ownerShareManagementEnabled: auth.ownerShareManagementEnabled,
      davCompatibilityModeEnabled: auth.davCompatibilityModeEnabled,
      contactManagementEnabled: auth.contactManagementEnabled,
      contactChangeModerationEnabled: auth.contactChangeModerationEnabled,
    });
    navigate("/login");
  };

  useEffect(() => {
    if (!auth.user || !auth.contactChangeModerationEnabled) {
      setReviewQueueCount(0);
      return undefined;
    }

    let active = true;

    const refreshReviewQueueCount = async () => {
      try {
        const response = await api.get("/api/contact-change-requests/summary");
        if (!active) {
          return;
        }

        setReviewQueueCount(Number(response.data?.needs_review_count || 0));
      } catch {
        if (!active) {
          return;
        }

        setReviewQueueCount(0);
      }
    };

    void refreshReviewQueueCount();

    const onQueueUpdated = () => {
      void refreshReviewQueueCount();
    };

    window.addEventListener("review-queue-updated", onQueueUpdated);
    const timer = window.setInterval(() => {
      void refreshReviewQueueCount();
    }, 30000);

    return () => {
      active = false;
      window.removeEventListener("review-queue-updated", onQueueUpdated);
      window.clearInterval(timer);
    };
  }, [auth.contactChangeModerationEnabled, auth.user, location.pathname]);

  useEffect(() => {
    setMobileAccountMenuOpen(false);
  }, [location.pathname]);

  const reviewQueueCountLabel =
    reviewQueueCount > 99 ? "99+" : String(reviewQueueCount);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="surface fade-up rounded-3xl p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link className="block" to="/">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-app-accent">
                Davvy
              </p>
            </Link>
            <Link className="block" to="/">
              <h1 className="text-2xl font-bold text-app-strong">
                CalDAV + CardDAV Manager
              </h1>
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-sm text-app-muted">
                Signed in as {auth.user.email}
              </p>
            </div>
          </div>
          <nav className="flex w-full flex-col gap-3 md:w-auto md:items-end">
            <div className="order-1 flex w-full items-center gap-2 overflow-x-auto pb-1 md:order-2 md:w-auto md:justify-end md:overflow-visible md:pb-0">
              <Link
                className={`${location.pathname === "/" ? "tab tab-active" : "tab"} shrink-0`}
                to="/"
              >
                Dashboard
              </Link>
              {auth.contactManagementEnabled ? (
                <Link
                  className={`${location.pathname === "/contacts" ? "tab tab-active" : "tab"} shrink-0`}
                  to="/contacts"
                >
                  Contacts
                </Link>
              ) : null}
              {auth.contactChangeModerationEnabled ? (
                <Link
                  className={`${onReviewQueuePage ? "tab tab-active" : "tab"} inline-flex shrink-0 items-center gap-1.5`}
                  to="/review-queue"
                >
                  <span>Review Queue</span>
                  {reviewQueueCount > 0 ? (
                    <span className="rounded-full border border-app-accent-edge bg-app-surface px-2 py-0.5 text-[10px] font-semibold leading-none text-app-accent">
                      {reviewQueueCountLabel}
                    </span>
                  ) : null}
                </Link>
              ) : null}
            </div>
            <div className="order-2 md:hidden">
              <button
                className="btn-outline w-full justify-between"
                type="button"
                onClick={() => setMobileAccountMenuOpen((current) => !current)}
                aria-expanded={mobileAccountMenuOpen}
                aria-label="Toggle account menu"
              >
                <span>Account</span>
                <svg
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${
                    mobileAccountMenuOpen ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {mobileAccountMenuOpen ? (
                <div className="mt-2 grid gap-2 rounded-2xl border border-app-edge bg-app-surface p-2">
                  <Link
                    className={`${location.pathname === "/profile" ? "tab tab-active" : "tab"} inline-flex items-center justify-between gap-2`}
                    to="/profile"
                    onClick={() => setMobileAccountMenuOpen(false)}
                  >
                    <span className="truncate">{auth.user.name}</span>
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="8" r="4" />
                      <path d="M5 20c1.6-3.3 4-5 7-5s5.4 1.7 7 5" />
                    </svg>
                  </Link>
                  {auth.user.role === "admin" ? (
                    <Link
                      className={
                        onAdminPage
                          ? "btn-outline btn-outline-sm admin-cta admin-cta-active group justify-center"
                          : "btn-outline btn-outline-sm admin-cta group justify-center"
                      }
                      to="/admin"
                      onClick={() => setMobileAccountMenuOpen(false)}
                      aria-label="Open Admin Control Center"
                      title="Open Admin Control Center"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4 opacity-85 transition group-hover:opacity-100"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 3l7 3v6c0 4.4-2.8 8.2-7 9-4.2-.8-7-4.6-7-9V6l7-3z" />
                        <path d="M9.5 12.5l1.7 1.7 3.3-3.6" />
                      </svg>
                      <span>Admin Control Center</span>
                    </Link>
                  ) : null}
                  <button
                    className="btn-outline w-full text-app-danger"
                    type="button"
                    onClick={logout}
                  >
                    Sign Out
                  </button>
                </div>
              ) : null}
            </div>
            <div className="order-3 hidden items-center gap-2 md:order-1 md:flex md:justify-end">
              {auth.user.role === "admin" ? (
                <Link
                  className={
                    onAdminPage
                      ? "btn-outline btn-outline-sm admin-cta admin-cta-active group"
                      : "btn-outline btn-outline-sm admin-cta group"
                  }
                  to="/admin"
                  aria-label="Open Admin Control Center"
                  title="Open Admin Control Center"
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 opacity-85 transition group-hover:opacity-100"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3l7 3v6c0 4.4-2.8 8.2-7 9-4.2-.8-7-4.6-7-9V6l7-3z" />
                    <path d="M9.5 12.5l1.7 1.7 3.3-3.6" />
                  </svg>
                  <span>Admin Control Center</span>
                  {onAdminPage ? null : (
                    <svg
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="M13 6l6 6-6 6" />
                    </svg>
                  )}
                </Link>
              ) : null}
              <Link
                className={`${location.pathname === "/profile" ? "tab tab-active" : "tab"} min-w-0 inline-flex items-center gap-1.5`}
                to="/profile"
                aria-label="Profile"
                title="Profile"
              >
                <span className="max-w-24 truncate sm:max-w-36">
                  {auth.user.name}
                </span>
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M5 20c1.6-3.3 4-5 7-5s5.4 1.7 7 5" />
                </svg>
              </Link>
              <button className="btn-outline" onClick={logout}>
                Sign Out
              </button>
            </div>
          </nav>
        </div>
      </header>
      <div className="mt-6">{children}</div>
      <div className="mt-6 flex justify-end">
        <ThemeControl
          theme={theme.theme}
          setTheme={theme.setTheme}
          className="theme-control-inline"
        />
      </div>
    </main>
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
  const [copyState, setCopyState] = useState("idle");
  const normalizedUri = String(resourceUri ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const fullUrl = buildDavCollectionUrl(
    resourceKind,
    principalId,
    normalizedUri,
  );

  useEffect(() => {
    if (copyState === "idle") {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copyUrl = async () => {
    try {
      await copyTextToClipboard(fullUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const copyLabel =
    copyState === "copied"
      ? "Copied URL"
      : copyState === "failed"
        ? "Copy failed"
        : "";
  const copyTone = copyState === "failed" ? "bg-red-700" : "bg-teal-700";

  return (
    <div className="relative mt-1">
      <button
        type="button"
        onClick={() => void copyUrl()}
        className="break-all bg-transparent p-0 text-left text-xs font-normal text-app-faint focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-teal-500"
        title={fullUrl}
        aria-label={`Copy ${normalizedUri || "resource"} URL`}
      >
        /{normalizedUri}
      </button>
      <span
        className={`pointer-events-none absolute left-0 top-full mt-1 rounded-md px-2 py-0.5 text-[10px] font-semibold text-white transition-opacity duration-150 ${
          copyState === "idle" ? "opacity-0" : "opacity-100"
        } ${copyTone}`}
      >
        {copyLabel}
      </span>
    </div>
  );
}

function InfoCard({ title, value, helper, copyable = false }) {
  const [copyState, setCopyState] = useState("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copyValue = async () => {
    if (!copyable) {
      return;
    }

    try {
      await copyTextToClipboard(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const copyTooltipLabel =
    copyState === "copied"
      ? "Copied!"
      : copyState === "failed"
        ? "Copy failed"
        : "";
  const copyTooltipTone = copyState === "failed" ? "bg-red-700" : "bg-teal-700";

  return (
    <article className="surface rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-app-faint">
        {title}
      </p>
      {copyable ? (
        <div className="relative mt-1">
          <button
            type="button"
            onClick={() => void copyValue()}
            className="w-full rounded-md text-left text-base font-bold text-app-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            aria-label={`Copy ${title}`}
            title="Click to copy"
          >
            <span className="break-all">{value}</span>
          </button>
          <span
            className={`pointer-events-none absolute right-0 top-0 rounded-md px-2 py-1 text-[11px] font-semibold text-white transition-opacity duration-150 ${
              copyState === "idle" ? "opacity-0" : "opacity-100"
            } ${copyTooltipTone}`}
          >
            {copyTooltipLabel}
          </span>
        </div>
      ) : (
        <p className="mt-1 break-all text-base font-bold text-app-strong">
          {value}
        </p>
      )}
      <p className="mt-2 text-xs text-app-muted">{helper}</p>
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-app-base">
        {label}
      </span>
      {children}
    </label>
  );
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
