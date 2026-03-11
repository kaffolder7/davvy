import React from "react";

export default function ContactEditorPersonalSection({
  isOpen,
  onToggle,
  form,
  Field,
  isOptionalFieldVisible,
  updateFormField,
  PRONOUN_OPTIONS,
  showOptionalField,
  updateBirthdayField,
  DateEditor,
  labelOptions,
  RelatedNameEditor,
  relatedNameOptions,
  setForm,
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
            Personal
          </span>
          <span className="block text-xs text-app-faint">
            Pronouns, birthday, and personal metadata.
          </span>
        </span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
          {isOpen ? "-" : "+"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-4 px-1 pb-1">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Pronouns">
              <select
                className="input"
                value={form.pronouns}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  updateFormField("pronouns", nextValue);

                  if (nextValue === "custom") {
                    showOptionalField("pronouns_custom");
                  }
                }}
              >
                {PRONOUN_OPTIONS.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {isOptionalFieldVisible("pronouns_custom") ? (
              <Field label="Custom Pronouns">
                <input
                  className="input"
                  value={form.pronouns_custom}
                  onChange={(event) =>
                    updateFormField("pronouns_custom", event.target.value)
                  }
                  placeholder="Optional custom value"
                  disabled={form.pronouns !== "custom" && !form.pronouns_custom}
                />
              </Field>
            ) : null}
            {isOptionalFieldVisible("ringtone") ? (
              <Field label="Ringtone">
                <input
                  className="input"
                  value={form.ringtone}
                  onChange={(event) => updateFormField("ringtone", event.target.value)}
                />
              </Field>
            ) : null}
            {isOptionalFieldVisible("text_tone") ? (
              <Field label="Text Tone">
                <input
                  className="input"
                  value={form.text_tone}
                  onChange={(event) => updateFormField("text_tone", event.target.value)}
                />
              </Field>
            ) : null}
            {isOptionalFieldVisible("verification_code") ? (
              <Field label="Verification Code">
                <input
                  className="input"
                  value={form.verification_code}
                  onChange={(event) =>
                    updateFormField("verification_code", event.target.value)
                  }
                />
              </Field>
            ) : null}
            {isOptionalFieldVisible("profile") ? (
              <Field label="Profile">
                <input
                  className="input"
                  value={form.profile}
                  onChange={(event) => updateFormField("profile", event.target.value)}
                />
              </Field>
            ) : null}
          </div>

          <section className="rounded-2xl border border-app-accent-edge bg-app-surface p-3 ring-1 ring-teal-500/10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-app-accent">
              Household
            </p>
            <label className="inline-flex items-center gap-2 text-[13px] font-semibold leading-5 text-app-base">
              <input
                type="checkbox"
                checked={!!form.head_of_household}
                onChange={(event) =>
                  updateFormField("head_of_household", event.target.checked)
                }
              />
              Head of Household
            </label>
          </section>

          <section className="rounded-2xl border border-app-accent-edge bg-app-surface p-4 ring-1 ring-teal-500/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-app-accent">
                Milestones &amp; Dates
              </h3>
              <span className="text-xs text-app-faint">
                Birthday, notable dates, and calendar behavior.
              </span>
            </div>
            <div className="mt-3 space-y-3">
              <section className="rounded-2xl border border-app-edge bg-app-surface p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
                  Birthday
                </h3>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Field label="Month">
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      placeholder="MM"
                      value={form.birthday.month}
                      onChange={(event) =>
                        updateBirthdayField("month", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Day">
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      placeholder="DD"
                      value={form.birthday.day}
                      onChange={(event) => updateBirthdayField("day", event.target.value)}
                    />
                  </Field>
                  <Field label="Year">
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="YYYY"
                      value={form.birthday.year}
                      onChange={(event) => updateBirthdayField("year", event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              {isOptionalFieldVisible("dates") ? (
                <DateEditor
                  rows={form.dates}
                  setRows={(rows) => updateFormField("dates", rows)}
                  labelOptions={labelOptions.dates}
                />
              ) : null}

              <section className="rounded-2xl bg-app-surface pt-2 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-app-base">
                  Calendar Behavior
                </p>
                <label className="inline-flex items-center gap-2 text-[13px] font-semibold leading-5 text-app-base">
                  <input
                    type="checkbox"
                    checked={!!form.exclude_milestone_calendars}
                    onChange={(event) =>
                      updateFormField(
                        "exclude_milestone_calendars",
                        event.target.checked,
                      )
                    }
                  />
                  Exclude From Milestone Calendars
                </label>
                <p className="mt-1.5 text-[11px] text-app-faint">
                  Skip Birthday and Anniversary events for this contact in
                  generated milestone calendars.
                </p>
              </section>
            </div>
          </section>

          <RelatedNameEditor
            rows={form.related_names}
            setRows={(nextRowsOrUpdater) =>
              setForm((previousForm) => {
                const currentRows = Array.isArray(previousForm.related_names)
                  ? previousForm.related_names
                  : [];
                const nextRows =
                  typeof nextRowsOrUpdater === "function"
                    ? nextRowsOrUpdater(currentRows)
                    : nextRowsOrUpdater;

                return {
                  ...previousForm,
                  related_names: nextRows,
                };
              })
            }
            contactOptions={relatedNameOptions}
            labelOptions={labelOptions.related_names}
          />
        </div>
      ) : null}
    </section>
  );
}
