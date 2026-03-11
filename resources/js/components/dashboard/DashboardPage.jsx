import React, { useEffect, useState } from "react";
import DashboardAppleCompatPanelComponent from "./DashboardAppleCompatPanel";
import DashboardOverviewCardsComponent from "./DashboardOverviewCards";
import DashboardSharingPanelComponent from "./DashboardSharingPanel";

export default function DashboardPage({
  auth,
  theme,
  api,
  extractError,
  downloadExport,
  fileStem,
  AppShell,
  FullPageState,
  InfoCard,
  PermissionBadge,
  ResourcePanel,
  AddressBookMilestoneControls,
  DashboardOverviewCards = DashboardOverviewCardsComponent,
  DashboardSharingPanel = DashboardSharingPanelComponent,
  DashboardAppleCompatPanel = DashboardAppleCompatPanelComponent,
}) {
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
      <DashboardOverviewCards auth={auth} InfoCard={InfoCard} />

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
        <DashboardSharingPanel
          shareForm={shareForm}
          setShareForm={setShareForm}
          shareableResourceOptions={shareableResourceOptions}
          targets={data.sharing.targets}
          outgoing={data.sharing.outgoing}
          onSaveShare={saveShare}
          onDeleteShare={deleteShare}
          PermissionBadge={PermissionBadge}
        />
      ) : null}

      {!loading ? (
        <DashboardAppleCompatPanel
          appleCompat={data.apple_compat}
          appleCompatForm={appleCompatForm}
          setAppleCompatForm={setAppleCompatForm}
          canSelectAppleCompatSources={canSelectAppleCompatSources}
          onSaveAppleCompat={saveAppleCompat}
        />
      ) : null}
    </AppShell>
  );
}
