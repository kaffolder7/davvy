import React from "react";
import {
  formatQueueTimestamp,
  queueOperationLabel,
  queueStatusLabel,
} from "./queueDisplayUtils";

export default function ContactChangeRequestCard({
  row,
  submitting,
  onOpenEdit,
  onApprove,
  onDeny,
}) {
  const isActionable =
    row.status === "pending" || row.status === "manual_merge_needed";

  return (
    <article
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
          {isActionable ? (
            <>
              {row.operation === "update" ? (
                <button
                  className="btn-outline btn-outline-sm"
                  type="button"
                  disabled={submitting}
                  onClick={() => onOpenEdit(row)}
                >
                  Edit & Approve
                </button>
              ) : null}
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                disabled={submitting}
                onClick={() => onApprove(row)}
              >
                Approve
              </button>
              <button
                className="btn-outline btn-outline-sm text-app-danger"
                type="button"
                disabled={submitting}
                onClick={() => onDeny(row)}
              >
                Deny
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-app-base md:grid-cols-2">
        <p>
          Requester: {row.requester?.name} ({row.requester?.email})
        </p>
        <p>
          Approval Owner: {row.approval_owner?.name} ({row.approval_owner?.email}
          )
        </p>
        <p>Source: {row.source}</p>
        <p>
          Reviewer:{" "}
          {row.reviewer
            ? `${row.reviewer.name} (${row.reviewer.email})`
            : "Not reviewed yet"}
        </p>
      </div>

      {Array.isArray(row.changed_fields) && row.changed_fields.length > 0 ? (
        <p className="mt-2 text-xs text-app-muted">
          Changed fields: {row.changed_fields.join(", ")}
        </p>
      ) : null}

      {row.status_reason ? (
        <p className="mt-2 text-sm text-app-danger">{row.status_reason}</p>
      ) : null}
    </article>
  );
}
