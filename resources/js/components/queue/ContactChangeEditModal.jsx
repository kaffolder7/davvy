import React from "react";
import Field from "../common/Field";

/**
 * Renders the Contact Change Edit Modal.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function ContactChangeEditModal({
  row,
  payloadText,
  onPayloadTextChange,
  addressBookIdsText,
  onAddressBookIdsTextChange,
  onCancel,
  onSubmit,
  submitting,
}) {
  if (!row) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="surface w-full max-w-3xl rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-app-strong">
          Edit Request #{row.id} Before Approve
        </h3>
        <p className="mt-1 text-sm text-app-muted">
          Adjust payload/address book IDs, then approve this queued request.
        </p>

        <div className="mt-4 grid gap-3">
          <Field label="Resolved Payload JSON">
            <textarea
              className="input min-h-[14rem] font-mono text-xs"
              value={payloadText}
              onChange={(event) => onPayloadTextChange(event.target.value)}
            />
          </Field>
          <Field label="Resolved Address Book IDs JSON Array">
            <textarea
              className="input min-h-[6rem] font-mono text-xs"
              value={addressBookIdsText}
              onChange={(event) => onAddressBookIdsTextChange(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            className="btn-outline btn-outline-sm"
            type="button"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="btn"
            type="button"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Approving..." : "Save Edits & Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
