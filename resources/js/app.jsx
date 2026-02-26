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

function App() {
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
      <Route path="/login" element={<LoginPage auth={value} />} />
      <Route path="/register" element={<RegisterPage auth={value} />} />
      <Route
        path="/"
        element={
          <ProtectedRoute auth={value}>
            <DashboardPage auth={value} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute auth={value} adminOnly>
            <AdminPage auth={value} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute auth={value}>
            <ProfilePage auth={value} />
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

function LoginPage({ auth }) {
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
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button className="btn w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-600">
        Need an account?{" "}
        {auth.registrationEnabled ? (
          <Link to="/register" className="font-semibold text-teal-700">
            Register here
          </Link>
        ) : (
          "Public sign-up is disabled by administrators."
        )}
      </p>
    </AuthShell>
  );
}

function RegisterPage({ auth }) {
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
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button className="btn w-full" disabled={submitting}>
          {submitting ? "Creating account..." : "Register"}
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-600">
        Already registered?{" "}
        <Link to="/login" className="font-semibold text-teal-700">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function DashboardPage({ auth }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    owned: { calendars: [], address_books: [] },
    shared: { calendars: [], address_books: [] },
    sharing: { can_manage: false, targets: [], outgoing: [] },
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

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/dashboard");
      setData(response.data);
    } catch (err) {
      setError(extractError(err, "Unable to load dashboard data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const toggleSharable = async (type, id, next) => {
    const url =
      type === "calendar" ? `/api/calendars/${id}` : `/api/address-books/${id}`;
    try {
      await api.patch(url, { is_sharable: next });
      await loadDashboard();
    } catch (err) {
      setError(extractError(err, "Unable to update sharing status."));
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

  const shareableResourceOptions =
    shareForm.resource_type === "calendar"
      ? data.owned.calendars.filter((item) => item.is_sharable)
      : data.owned.address_books.filter((item) => item.is_sharable);

  return (
    <AppShell auth={auth}>
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
        <div className="surface mt-4 rounded-2xl p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {loading ? <FullPageState label="Loading resources..." compact /> : null}

      {!loading ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ResourcePanel
            title="Your Calendars"
            createLabel="Create Calendar"
            items={data.owned.calendars}
            sharedItems={data.shared.calendars}
            onCreate={createCalendar}
            form={calendarForm}
            setForm={setCalendarForm}
            onToggle={(id, next) => toggleSharable("calendar", id, next)}
          />
          <ResourcePanel
            title="Your Address Books"
            createLabel="Create Address Book"
            items={data.owned.address_books}
            sharedItems={data.shared.address_books}
            onCreate={createAddressBook}
            form={bookForm}
            setForm={setBookForm}
            onToggle={(id, next) => toggleSharable("address-book", id, next)}
          />
        </div>
      ) : null}

      {!loading && data.sharing.can_manage ? (
        <section className="surface mt-6 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-slate-900">
            Share Your Resources
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Grant read-only or full edit access for resources you own and marked
            as sharable.
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
                <option value="read_only">Read-only</option>
                <option value="admin">Full edit</option>
              </select>
              <button className="btn" type="submit">
                Share
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-2">
            {data.sharing.outgoing.length === 0 ? (
              <p className="text-sm text-slate-500">No outgoing shares yet.</p>
            ) : (
              data.sharing.outgoing.map((share) => (
                <div
                  key={share.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">
                      {share.resource_type} #{share.resource_id}
                    </p>
                    <PermissionBadge permission={share.permission} />
                  </div>
                  <p className="text-slate-600">
                    Shared with: {share.shared_with?.name} (
                    {share.shared_with?.email})
                  </p>
                  <button
                    className="mt-2 text-xs font-semibold text-red-700"
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
    </AppShell>
  );
}

function ResourcePanel({
  title,
  createLabel,
  items,
  sharedItems,
  onCreate,
  form,
  setForm,
  onToggle,
}) {
  return (
    <section className="surface rounded-3xl p-6">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
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
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
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
          <p className="text-sm text-slate-500">No owned resources yet.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {item.display_name}
                  </p>
                  <p className="text-xs text-slate-500">/{item.uri}</p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!item.is_sharable}
                    onChange={(event) =>
                      onToggle(item.id, event.target.checked)
                    }
                  />
                  Sharable
                </label>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Shared with you
        </h3>
        <div className="mt-3 space-y-2">
          {sharedItems.length === 0 ? (
            <p className="text-sm text-slate-500">No shared resources.</p>
          ) : (
            sharedItems.map((item) => (
              <div
                key={`${item.id}-${item.share_id}`}
                className="rounded-xl border border-amber-100 bg-amber-50 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {item.display_name}
                    </p>
                    <p className="text-xs text-slate-600">
                      Owner: {item.owner_name} ({item.owner_email})
                    </p>
                  </div>
                  <PermissionBadge permission={item.permission} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function AdminPage({ auth }) {
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
    <AppShell auth={auth}>
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
          <p className="mt-3 text-sm text-red-700">{state.error}</p>
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
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm"
                >
                  <p className="font-semibold text-slate-900">{user.name}</p>
                  <p className="text-slate-600">{user.email}</p>
                  <p className="text-xs text-slate-500">
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
                <option value="read_only">Read-only</option>
                <option value="admin">Full edit (admin)</option>
              </select>
              <button className="btn" type="submit">
                Save Share
              </button>
            </form>

            <div className="mt-5 space-y-2">
              {state.shares.map((share) => (
                <div
                  key={share.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">
                      {share.resource_type} #{share.resource_id}
                    </p>
                    <PermissionBadge permission={share.permission} />
                  </div>
                  <p className="text-slate-600">
                    Owner: {share.owner.name} ({share.owner.email})
                  </p>
                  <p className="text-slate-600">
                    Shared with: {share.shared_with.name} (
                    {share.shared_with.email})
                  </p>
                  <button
                    className="mt-2 text-xs font-semibold text-red-700"
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

function ProfilePage({ auth }) {
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
    <AppShell auth={auth}>
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
        <h2 className="text-xl font-semibold text-slate-900">Security</h2>
        <p className="mt-1 text-sm text-slate-600">
          Change your password for both web access and DAV client connections.
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={changePassword}>
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
            <p className="md:col-span-3 text-sm text-red-700">{passwordError}</p>
          ) : null}
          {passwordSuccess ? (
            <p className="md:col-span-3 text-sm text-teal-700">
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

function AppShell({ auth, children }) {
  const navigate = useNavigate();
  const location = useLocation();

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
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-teal-700">
              Davvy
            </p>
            <h1 className="text-2xl font-bold text-slate-900">
              CalDAV + CardDAV Manager
            </h1>
            <p className="text-sm text-slate-600">
              Signed in as {auth.user.email}
            </p>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              className={location.pathname === "/" ? "tab tab-active" : "tab"}
              to="/"
            >
              Dashboard
            </Link>
            <Link
              className={location.pathname === "/profile" ? "tab tab-active" : "tab"}
              to="/profile"
            >
              Profile
            </Link>
            {auth.user.role === "admin" ? (
              <Link
                className={location.pathname === "/admin" ? "tab tab-active" : "tab"}
                to="/admin"
              >
                Admin
              </Link>
            ) : null}
            <button className="btn-outline" onClick={logout}>
              Sign Out
            </button>
          </nav>
        </div>
      </header>
      <div className="mt-6">{children}</div>
    </main>
  );
}

function PermissionBadge({ permission }) {
  return (
    <span
      className={permission === "admin" ? "pill pill-admin" : "pill pill-read"}
    >
      {permission === "admin" ? "Full Edit" : "Read-only"}
    </span>
  );
}

function AuthShell({ title, subtitle, children }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <section className="surface fade-up w-full rounded-3xl p-8">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </section>
    </main>
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
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
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
  const copyTooltipTone =
    copyState === "failed" ? "bg-red-700" : "bg-teal-700";

  return (
    <article className="surface rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {copyable ? (
        <div className="relative mt-1">
          <button
            type="button"
            onClick={() => void copyValue()}
            className="w-full rounded-md text-left text-base font-bold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
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
        <p className="mt-1 break-all text-base font-bold text-slate-900">{value}</p>
      )}
      <p className="mt-2 text-xs text-slate-600">{helper}</p>
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">
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
          ? "mt-4 text-sm font-semibold text-slate-600"
          : "flex min-h-screen items-center justify-center text-lg font-semibold text-slate-700"
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
