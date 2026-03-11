import React from "react";

export default function ContactEditorHideFieldModal({
  pendingHideFieldId,
  pendingHideFieldLabel,
  onCancel,
  onResolve,
}) {
  if (!pendingHideFieldId) {
    return null;
  }

  return (
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
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn-outline btn-outline-sm"
            type="button"
            onClick={() => onResolve(false)}
          >
            Keep Hidden Value
          </button>
          <button className="btn" type="button" onClick={() => onResolve(true)}>
            Clear and Hide
          </button>
        </div>
      </div>
    </div>
  );
}
