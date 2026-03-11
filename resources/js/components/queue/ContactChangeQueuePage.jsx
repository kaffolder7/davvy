import React, { useEffect, useState } from "react";
import ContactChangeEditModal from "./ContactChangeEditModal";
import ContactChangeRequestCard from "./ContactChangeRequestCard";

export default function ContactChangeQueuePage({
  auth,
  theme,
  api,
  extractError,
  AppShell,
  FullPageState,
}) {
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
              <ContactChangeRequestCard
                key={row.id}
                row={row}
                submitting={submitting}
                onOpenEdit={openEditDialog}
                onApprove={approveRow}
                onDeny={denyRow}
              />
            ))
          )}
        </section>
      )}

      <ContactChangeEditModal
        row={editingRow}
        payloadText={editPayloadText}
        onPayloadTextChange={setEditPayloadText}
        addressBookIdsText={editAddressBookIdsText}
        onAddressBookIdsTextChange={setEditAddressBookIdsText}
        onCancel={closeEditDialog}
        onSubmit={submitEditAndApprove}
        submitting={submitting}
      />
    </AppShell>
  );
}
