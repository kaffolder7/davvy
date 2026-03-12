import React from "react";

/**
 * Renders the Contact Editor Work Section component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function ContactEditorWorkSection({
  isOpen,
  onToggle,
  form,
  Field,
  isOptionalFieldVisible,
  updateFormField,
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
            Work
          </span>
          <span className="block text-xs text-app-faint">
            Company and role details.
          </span>
        </span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
          {isOpen ? "-" : "+"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 px-1 pb-1">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Company">
              <input
                className="input"
                value={form.company}
                onChange={(event) => updateFormField("company", event.target.value)}
              />
            </Field>
            {isOptionalFieldVisible("phonetic_company") ? (
              <Field label="Phonetic Company">
                <input
                  className="input"
                  value={form.phonetic_company}
                  onChange={(event) =>
                    updateFormField("phonetic_company", event.target.value)
                  }
                />
              </Field>
            ) : null}
            <Field label="Job Title">
              <input
                className="input"
                value={form.job_title}
                onChange={(event) => updateFormField("job_title", event.target.value)}
              />
            </Field>
            {isOptionalFieldVisible("department") ? (
              <Field label="Department">
                <input
                  className="input"
                  value={form.department}
                  onChange={(event) =>
                    updateFormField("department", event.target.value)
                  }
                />
              </Field>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
