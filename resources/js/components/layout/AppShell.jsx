import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

/**
 * Renders the App Shell.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function AppShell({
  auth,
  theme,
  children,
  api,
  ThemeControl,
  SponsorshipLinkIcon,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const onAdminPage = location.pathname === "/admin";
  const onReviewQueuePage = location.pathname === "/review-queue";
  const [reviewQueueCount, setReviewQueueCount] = useState(0);
  const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);
  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
  const sponsorLinks = Array.isArray(auth.sponsorship?.links)
    ? auth.sponsorship.links
    : [];
  const showSponsorButton =
    Boolean(auth.sponsorship?.enabled) && sponsorLinks.length > 0;

  const logout = async () => {
    setMobileAccountMenuOpen(false);
    setSponsorModalOpen(false);
    await api.post("/api/auth/logout");
    auth.setAuth((current) => ({
      ...current,
      loading: false,
      user: null,
    }));
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
    setSponsorModalOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sponsorModalOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSponsorModalOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sponsorModalOpen]);

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
      <div
        className={`mt-6 flex flex-wrap items-center gap-3 ${
          showSponsorButton ? "justify-between" : "justify-end"
        }`}
      >
        {showSponsorButton ? (
          <button
            type="button"
            className="sponsor-btn"
            onClick={() => setSponsorModalOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sponsorModalOpen}
            aria-controls="sponsor-modal"
          >
            <svg
              aria-hidden="true"
              className="sponsor-btn-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
            </svg>
            <span>Sponsor</span>
          </button>
        ) : null}
        <ThemeControl
          theme={theme.theme}
          setTheme={theme.setTheme}
          className="theme-control-inline"
        />
      </div>

      {showSponsorButton && sponsorModalOpen ? (
        <div
          className="fixed inset-0 z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sponsor-modal-title"
          id="sponsor-modal"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close sponsor links"
            onClick={() => setSponsorModalOpen(false)}
          />
          <div className="surface relative mx-auto mt-[10vh] w-full max-w-md rounded-2xl p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="sponsor-modal-title"
                  className="text-lg font-semibold text-app-strong"
                >
                  Support Davvy
                </h3>
                <p className="mt-1 text-sm text-app-muted">
                  Pick a link below to sponsor the project.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline btn-outline-sm"
                onClick={() => setSponsorModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {sponsorLinks.map((link) => (
                <a
                  key={link.url}
                  className="sponsor-modal-link"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="sponsor-modal-link-main">
                    <SponsorshipLinkIcon name={link.name} url={link.url} />
                    <span className="sponsor-modal-link-label">
                      {link.name}
                    </span>
                  </span>
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 17 17 7" />
                    <path d="M7 7h10v10" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
