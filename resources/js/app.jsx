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
              Mirror target: {data.apple_compat.target_display_name} (
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
                      className="flex items-start gap-2 rounded-xl border border-app-edge bg-app-surface px-3 py-2 text-sm"
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
                        disabled={!data.apple_compat.target_address_book_id}
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
