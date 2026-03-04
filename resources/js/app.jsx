import React, { useEffect, useMemo, useState } from "react";
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
        });
      } catch {
        setAuth({
          loading: false,
          user: null,
          registrationEnabled: false,
          ownerShareManagementEnabled: false,
          davCompatibilityModeEnabled: false,
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
            <ContactsPage auth={value} theme={theme} />
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
            Off by default. Mirror selected address books into your{" "}
            <code>/contacts</code> book so macOS and iOS clients can see them.
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
    Array.isArray(contact.address_book_ids) && contact.address_book_ids.length > 0
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
    birthday: datePartsToFormValue(contact.birthday),
    phones: nonEmptyRows(contact.phones, () => createEmptyLabeledValue("mobile")),
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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState([]);
  const [addressBooks, setAddressBooks] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [form, setForm] = useState(createEmptyContactForm());
  const [visibleOptionalFields, setVisibleOptionalFields] = useState([]);
  const [fieldToAdd, setFieldToAdd] = useState(OPTIONAL_CONTACT_FIELDS[0]?.id ?? "");
  const [fieldSearchTerm, setFieldSearchTerm] = useState("");
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [pendingHideFieldId, setPendingHideFieldId] = useState(null);
  const [openSections, setOpenSections] = useState(createContactSectionOpenState());

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

    if (!filteredHiddenOptionalFields.some((field) => field.id === fieldToAdd)) {
      setFieldToAdd(filteredHiddenOptionalFields[0].id);
    }
  }, [fieldToAdd, filteredHiddenOptionalFields, hiddenOptionalFields]);

  const applyFormState = (nextForm) => {
    setForm(nextForm);
    setVisibleOptionalFields(deriveOptionalFieldVisibility(nextForm));
    setOpenSections(deriveContactSectionOpenState(nextForm));
  };

  const loadContacts = async ({ preserveSelection = true, selectId = null } = {}) => {
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
          : nextContacts[0]?.id ?? null);

      setSelectedContactId(activeId);

      const activeContact = nextContacts.find((contact) => contact.id === activeId);
      applyFormState(hydrateContactForm(activeContact, fallbackIds));
    } catch (err) {
      setError(extractError(err, "Unable to load contacts."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts({ preserveSelection: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    if (!Array.isArray(form.address_book_ids) || form.address_book_ids.length === 0) {
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

      await loadContacts({
        preserveSelection: false,
        selectId: response.data?.id ?? null,
      });
    } catch (err) {
      setError(extractError(err, "Unable to save contact."));
    } finally {
      setSubmitting(false);
    }
  };

  const removeContact = async () => {
    if (!form.id) {
      return;
    }

    if (!window.confirm("Delete this contact from all assigned address books?")) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await api.delete(`/api/contacts/${form.id}`);
      await loadContacts({ preserveSelection: false, selectId: null });
    } catch (err) {
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
  const selectedAddressBookCount = Array.isArray(form.address_book_ids)
    ? form.address_book_ids.length
    : 0;
  const pendingHideFieldLabel =
    OPTIONAL_CONTACT_FIELDS.find((field) => field.id === pendingHideFieldId)?.label ??
    pendingHideFieldId;

  return (
    <AppShell auth={auth} theme={theme}>
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
              <button className="btn-outline btn-outline-sm" onClick={startNewContact}>
                New
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {contacts.length === 0 ? (
                <p className="text-sm text-app-faint">No contacts yet.</p>
              ) : (
                contacts.map((contact) => (
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
          </aside>

          <section className="surface rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-app-strong">
                  {form.id ? "Edit Contact" : "New Contact"}
                </h2>
                <p className="mt-1 text-sm text-app-muted">
                  All fields are optional. Address book assignment supports one
                  or more selections.
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
                <button className="btn" type="submit" form="contact-editor" disabled={submitting || addressBooks.length === 0}>
                  {submitting ? "Saving..." : "Save Contact"}
                </button>
              </div>
            </div>

            {addressBooks.length === 0 ? (
              <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                You do not currently have write access to any address books.
              </p>
            ) : null}

            <form id="contact-editor" className="mt-5 space-y-6" onSubmit={saveContact}>
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
                    onChange={(event) => updateFormField("last_name", event.target.value)}
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
                        updateFormField("phonetic_first_name", event.target.value)
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
                        updateFormField("phonetic_last_name", event.target.value)
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
                    onChange={(event) => updateFormField("company", event.target.value)}
                  />
                </Field>
                {isOptionalFieldVisible("phonetic_company") ? (
                  <Field label="Phonetic Company">
                    <input
                      className="input"
                      value={form.phonetic_company}
                      onChange={(event) =>
                        updateFormField("phonetic_company", event.target.value)
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
                      <option key={option.value || "none"} value={option.value}>
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
                        updateFormField("pronouns_custom", event.target.value)
                      }
                      placeholder="Optional custom value"
                      disabled={form.pronouns !== "custom" && !form.pronouns_custom}
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
                        updateFormField("verification_code", event.target.value)
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
                        setRows={(rows) => updateFormField("instant_messages", rows)}
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
                  <div className="mt-3 space-y-4 px-1 pb-1">
                    <section className="rounded-2xl border-2 border-app-accent-edge bg-app-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
                    Assign Address Books
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-app-warn-edge bg-app-warn-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-base">
                      Required
                    </span>
                    <span className="rounded-full border border-app-edge bg-app-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-faint">
                      {selectedAddressBookCount} selected
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-app-faint">
                  Choose one or more address books for this contact.
                </p>
                <div className="mt-3 space-y-2">
                  {addressBooks.length === 0 ? (
                    <p className="text-sm text-app-faint">No writable address books.</p>
                  ) : (
                    addressBooks.map((book) => {
                      const isAssigned = form.address_book_ids.includes(book.id);

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
                            checked={isAssigned}
                            onChange={(event) =>
                              toggleAssignedAddressBook(book.id, event.target.checked)
                            }
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="block font-medium text-app-strong">
                                {book.display_name}
                              </span>
                              {isAssigned ? (
                                <span className="rounded-full border border-app-accent-edge px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-app-accent">
                                  Selected
                                </span>
                              ) : null}
                            </span>
                            <span className="block text-xs text-app-faint">
                              /{book.uri} • {book.scope === "owned" ? "Owned" : "Shared"}
                              {book.owner_name ? ` • ${book.owner_name}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                    </section>
                  </div>
                ) : null}
              </section>

              <section className="sticky bottom-3 z-20">
                <div className="surface flex items-center justify-end gap-2 rounded-2xl px-3 py-2 shadow-lg shadow-black/10">
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
                    disabled={submitting || addressBooks.length === 0}
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
              This field currently has data. Keep the value hidden or clear it before
              hiding the field.
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
              <button className="btn" type="button" onClick={() => resolveHideOptionalField(true)}>
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
    setRows([...safeRows, createEmptyLabeledValue(labelOptions[0]?.value || "other")]);
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
        <button className="btn-outline btn-outline-sm" type="button" onClick={addRow}>
          {addLabel}
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {safeRows.length === 0 ? (
          <p className="text-sm text-app-faint">No entries.</p>
        ) : (
          safeRows.map((row, index) => (
            <div key={`${title}-${index}`} className="rounded-xl border border-app-edge p-3">
              <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
                <select
                  className="input"
                  value={row.label ?? "other"}
                  onChange={(event) => updateRow(index, "label", event.target.value)}
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
                  onChange={(event) => updateRow(index, "value", event.target.value)}
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
        <button className="btn-outline btn-outline-sm" type="button" onClick={addRow}>
          Add address
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {safeRows.length === 0 ? (
          <p className="text-sm text-app-faint">No addresses.</p>
        ) : (
          safeRows.map((row, index) => (
            <div key={`address-${index}`} className="rounded-xl border border-app-edge p-3">
              <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
                <select
                  className="input"
                  value={row.label ?? "home"}
                  onChange={(event) => updateRow(index, "label", event.target.value)}
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
                  onChange={(event) => updateRow(index, "street", event.target.value)}
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
                  onChange={(event) => updateRow(index, "city", event.target.value)}
                  placeholder="City"
                />
                <input
                  className="input"
                  value={row.state ?? ""}
                  onChange={(event) => updateRow(index, "state", event.target.value)}
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
                  onChange={(event) => updateRow(index, "country", event.target.value)}
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
        <button className="btn-outline btn-outline-sm" type="button" onClick={addRow}>
          Add date
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {safeRows.length === 0 ? (
          <p className="text-sm text-app-faint">No dates.</p>
        ) : (
          safeRows.map((row, index) => (
            <div key={`date-${index}`} className="rounded-xl border border-app-edge p-3">
              <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
                <select
                  className="input"
                  value={row.label ?? "other"}
                  onChange={(event) => updateRow(index, "label", event.target.value)}
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
                    onChange={(event) => updateRow(index, "month", event.target.value)}
                  />
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="31"
                    value={row.day ?? ""}
                    placeholder="DD"
                    onChange={(event) => updateRow(index, "day", event.target.value)}
                  />
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="9999"
                    value={row.year ?? ""}
                    placeholder="YYYY"
                    onChange={(event) => updateRow(index, "year", event.target.value)}
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
              className="rounded-xl border border-app-edge bg-app-surface p-3"
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

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const [users, resources, shares] = await Promise.all([
        api.get("/api/admin/users"),
        api.get("/api/admin/resources"),
        api.get("/api/admin/shares"),
      ]);

      setState((prev) => ({
        ...prev,
        loading: false,
        users: users.data.data,
        resources: resources.data,
        shares: shares.data.data,
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

  const resourceOptions =
    shareForm.resource_type === "calendar"
      ? state.resources.calendars
      : state.resources.address_books;

  return (
    <AppShell auth={auth} theme={theme}>
      <div className="surface fade-up rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Admin Control Center</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-outline" onClick={toggleRegistration}>
              Public registration: {state.registrationEnabled ? "ON" : "OFF"}
            </button>
            <button
              className="btn-outline"
              onClick={toggleOwnerShareManagement}
            >
              Owner sharing: {state.ownerShareManagementEnabled ? "ON" : "OFF"}
            </button>
            <button
              className="btn-outline"
              onClick={toggleDavCompatibilityMode}
            >
              DAV compatibility mode:{" "}
              {state.davCompatibilityModeEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>
        {state.error ? (
          <p className="mt-3 text-sm text-app-danger">{state.error}</p>
        ) : null}
      </div>

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

  const logout = async () => {
    await api.post("/api/auth/logout");
    auth.setAuth({
      loading: false,
      user: null,
      registrationEnabled: auth.registrationEnabled,
      ownerShareManagementEnabled: auth.ownerShareManagementEnabled,
      davCompatibilityModeEnabled: auth.davCompatibilityModeEnabled,
    });
    navigate("/login");
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="surface fade-up rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
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
          <nav className="flex flex-col items-end gap-3">
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
            <div className="flex items-center gap-2">
              <Link
                className={location.pathname === "/" ? "tab tab-active" : "tab"}
                to="/"
              >
                Dashboard
              </Link>
              <Link
                className={location.pathname === "/contacts" ? "tab tab-active" : "tab"}
                to="/contacts"
              >
                Contacts
              </Link>
              <Link
                className={`${location.pathname === "/profile" ? "tab tab-active" : "tab"} inline-flex items-center gap-1.5`}
                to="/profile"
                aria-label="Profile"
                title="Profile"
              >
                <span className="max-w-36 truncate">{auth.user.name}</span>
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
