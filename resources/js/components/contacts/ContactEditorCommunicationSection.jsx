import React from "react";

/**
 * Renders the Contact Editor Communication Section component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function ContactEditorCommunicationSection({
  isOpen,
  onToggle,
  form,
  updateFormField,
  labelOptions,
  isOptionalFieldVisible,
  LabeledValueEditor,
  AddressEditor,
}) {
  return (
    <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
      <button
        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span>
          <span className="block text-sm font-semibold uppercase tracking-wide text-app-base">
            Communication
          </span>
          <span className="block text-xs text-app-faint">
            Contact methods and addresses.
          </span>
        </span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
          {isOpen ? "-" : "+"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-4 px-1 pb-1">
          <LabeledValueEditor
            title="Phone"
            rows={form.phones}
            setRows={(rows) => updateFormField("phones", rows)}
            labelOptions={labelOptions.phones}
            valuePlaceholder="Phone number"
            addLabel="Add phone"
          />
          <LabeledValueEditor
            title="Email"
            rows={form.emails}
            setRows={(rows) => updateFormField("emails", rows)}
            labelOptions={labelOptions.emails}
            valuePlaceholder="Email address"
            addLabel="Add email"
          />
          <AddressEditor
            rows={form.addresses}
            setRows={(rows) => updateFormField("addresses", rows)}
            labelOptions={labelOptions.addresses}
          />
          <LabeledValueEditor
            title="URL"
            rows={form.urls}
            setRows={(rows) => updateFormField("urls", rows)}
            labelOptions={labelOptions.urls}
            valuePlaceholder="https://example.com"
            addLabel="Add URL"
          />
          {isOptionalFieldVisible("instant_messages") ? (
            <LabeledValueEditor
              title="Instant Message"
              rows={form.instant_messages}
              setRows={(rows) => updateFormField("instant_messages", rows)}
              labelOptions={labelOptions.instant_messages}
              valuePlaceholder="im:username@example.com"
              addLabel="Add IM"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
