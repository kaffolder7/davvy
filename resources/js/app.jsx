import React, { Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import useAuthState from "./components/auth/useAuthState";
import FullPageState from "./components/common/FullPageState";
import useThemePreference from "./components/theme/useThemePreference";
import { api } from "./lib/api";
import {
  refreshAnalyticsConfig,
  trackFeatureSnapshot,
  trackPageView,
} from "./lib/analytics";

const LoginPage = lazy(() =>
  import("./routes/AuthPageRoutes").then((module) => ({
    default: module.LoginPageRoute,
  })),
);
const LoginTwoFactorPage = lazy(() =>
  import("./routes/AuthPageRoutes").then((module) => ({
    default: module.LoginTwoFactorPageRoute,
  })),
);
const RegisterPage = lazy(() =>
  import("./routes/AuthPageRoutes").then((module) => ({
    default: module.RegisterPageRoute,
  })),
);
const VerifyEmailPage = lazy(() =>
  import("./routes/AuthPageRoutes").then((module) => ({
    default: module.VerifyEmailPageRoute,
  })),
);
const InviteAcceptPage = lazy(() =>
  import("./routes/AuthPageRoutes").then((module) => ({
    default: module.InviteAcceptPageRoute,
  })),
);
const DashboardPage = lazy(() => import("./routes/DashboardPageRoute"));
const ContactsPage = lazy(() => import("./routes/ContactsPageRoute"));
const ContactChangeQueuePage = lazy(() =>
  import("./routes/ContactChangeQueuePageRoute"),
);
const AdminPage = lazy(() => import("./routes/AdminPageRoute"));
const ProfilePage = lazy(() => import("./routes/ProfilePageRoute"));

function RouteLoader({ children }) {
  return (
    <Suspense fallback={<FullPageState label="Loading Davvy..." />}>
      {children}
    </Suspense>
  );
}

function App() {
  const theme = useThemePreference();
  const location = useLocation();
  const { auth, value } = useAuthState({
    api,
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (cancelled) {
        return;
      }

      await refreshAnalyticsConfig(api);
    };

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    trackFeatureSnapshot(value);
  }, [
    value.user,
    value.ownerShareManagementEnabled,
    value.davCompatibilityModeEnabled,
    value.contactManagementEnabled,
    value.contactChangeModerationEnabled,
    value.twoFactorEnforcementEnabled,
  ]);

  if (auth.loading) {
    return <FullPageState label="Loading Davvy..." />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RouteLoader>
            <LoginPage auth={value} theme={theme} />
          </RouteLoader>
        }
      />
      <Route
        path="/login/2fa"
        element={
          <RouteLoader>
            <LoginTwoFactorPage auth={value} theme={theme} />
          </RouteLoader>
        }
      />
      <Route
        path="/register"
        element={
          <RouteLoader>
            <RegisterPage auth={value} theme={theme} />
          </RouteLoader>
        }
      />
      <Route
        path="/verify-email"
        element={
          <RouteLoader>
            <VerifyEmailPage auth={value} theme={theme} />
          </RouteLoader>
        }
      />
      <Route
        path="/invite"
        element={
          <RouteLoader>
            <InviteAcceptPage auth={value} theme={theme} />
          </RouteLoader>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute auth={value}>
            <RouteLoader>
              <DashboardPage auth={value} theme={theme} />
            </RouteLoader>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute auth={value}>
            {value.contactManagementEnabled ? (
              <RouteLoader>
                <ContactsPage auth={value} theme={theme} />
              </RouteLoader>
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
              <RouteLoader>
                <ContactChangeQueuePage auth={value} theme={theme} />
              </RouteLoader>
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
            <RouteLoader>
              <AdminPage auth={value} theme={theme} />
            </RouteLoader>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute auth={value}>
            <RouteLoader>
              <ProfilePage auth={value} theme={theme} />
            </RouteLoader>
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

const mountNode = document.getElementById("app");

if (mountNode) {
  createRoot(mountNode).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
}

export default App;
