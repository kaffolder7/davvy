import React from "react";

export default function ContactEditorNameSection({
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
            Name
          </span>
          <span className="block text-xs text-app-faint">
            Basic identity and phonetic naming fields.
          </span>
        </span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
          {isOpen ? "-" : "+"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 px-1 pb-1">
          <div className="grid gap-3 md:grid-cols-3">
            {isOptionalFieldVisible("prefix") ? (
              <Field label="Prefix">
                <input
                  className="input"
                  value={form.prefix}
                  onChange={(event) => updateFormField("prefix", event.target.value)}
                />
              </Field>
            ) : null}
            <Field label="First Name">
              <input
                className="input"
                value={form.first_name}
                onChange={(event) => updateFormField("first_name", event.target.value)}
              />
            </Field>
            {isOptionalFieldVisible("middle_name") ? (
              <Field label="Middle Name">
                <input
                  className="input"
                  value={form.middle_name}
                  onChange={(event) =>
                    updateFormField("middle_name", event.target.value)
                  }
                />
              </Field>
            ) : null}
            <Field label="Last Name">
              <input
                className="input"
                value={form.last_name}
                onChange={(event) => updateFormField("last_name", event.target.value)}
              />
            </Field>
            {isOptionalFieldVisible("suffix") ? (
              <Field label="Suffix">
                <input
                  className="input"
                  value={form.suffix}
                  onChange={(event) => updateFormField("suffix", event.target.value)}
                />
              </Field>
            ) : null}
            {isOptionalFieldVisible("nickname") ? (
              <Field label="Nickname">
                <input
                  className="input"
                  value={form.nickname}
                  onChange={(event) => updateFormField("nickname", event.target.value)}
                />
              </Field>
            ) : null}
            {isOptionalFieldVisible("maiden_name") ? (
              <Field label="Maiden Name">
                <input
                  className="input"
                  value={form.maiden_name}
                  onChange={(event) =>
                    updateFormField("maiden_name", event.target.value)
                  }
                />
              </Field>
            ) : null}
            {isOptionalFieldVisible("phonetic_first_name") ? (
              <Field label="Phonetic First Name">
                <input
                  className="input"
                  value={form.phonetic_first_name}
                  onChange={(event) =>
                    updateFormField("phonetic_first_name", event.target.value)
                  }
                />
              </Field>
            ) : null}
            {isOptionalFieldVisible("phonetic_last_name") ? (
              <Field label="Phonetic Last Name">
                <input
                  className="input"
                  value={form.phonetic_last_name}
                  onChange={(event) =>
                    updateFormField("phonetic_last_name", event.target.value)
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
