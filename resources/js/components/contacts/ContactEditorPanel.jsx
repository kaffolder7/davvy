import React from "react";

export default function ContactEditorPanel({
  form,
  submitting,
  addressBooks,
  selectedAddressBookCount,
  hasRequiredContactIdentity,
  saveContact,
  removeContact,
  openSections,
  toggleSection,
  isOptionalFieldVisible,
  Field,
  updateFormField,
  PRONOUN_OPTIONS,
  showOptionalField,
  updateBirthdayField,
  DateEditor,
  LabeledValueEditor,
  AddressEditor,
  RelatedNameEditor,
  labelOptions,
  relatedNameOptions,
  setForm,
  hiddenOptionalFields,
  fieldSearchTerm,
  setFieldSearchTerm,
  fieldPickerOpen,
  setFieldPickerOpen,
  addSelectedOptionalField,
  filteredHiddenOptionalFields,
  fieldToAdd,
  setFieldToAdd,
  visibleOptionalFields,
  hideOptionalField,
  OPTIONAL_CONTACT_FIELDS,
  toggleAssignedAddressBook,
}) {
  return (
              <section className="surface rounded-3xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-app-strong">
                      {form.id ? "Edit Contact" : "New Contact"}
                    </h2>
                    <p className="mt-1 text-sm text-app-muted">
                      Enter at least a First Name, Last Name, or Company. Address
                      book assignment supports one or more selections.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {form.id ? (
                      <button
                        className="btn-outline btn-outline-sm text-app-danger"
                        type="button"
                        onClick={removeContact}
                        disabled={submitting}
                      >
                        Delete
                      </button>
                    ) : null}
                    <button
                      className="btn"
                      type="submit"
                      form="contact-editor"
                      disabled={
                        submitting ||
                        addressBooks.length === 0 ||
                        selectedAddressBookCount === 0 ||
                        !hasRequiredContactIdentity
                      }
                    >
                      {submitting ? "Saving..." : "Save Contact"}
                    </button>
                  </div>
                </div>
    
                {addressBooks.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    You do not currently have write access to any address books.
                  </p>
                ) : null}
    
                <form
                  id="contact-editor"
                  className="mt-5 space-y-6"
                  onSubmit={saveContact}
                >
                  <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                    <button
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                      type="button"
                      onClick={() => toggleSection("name")}
                      aria-expanded={openSections.name}
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
                        {openSections.name ? "-" : "+"}
                      </span>
                    </button>
    
                    {openSections.name ? (
                      <div className="mt-3 px-1 pb-1">
                        <div className="grid gap-3 md:grid-cols-3">
                          {isOptionalFieldVisible("prefix") ? (
                            <Field label="Prefix">
                              <input
                                className="input"
                                value={form.prefix}
                                onChange={(event) =>
                                  updateFormField("prefix", event.target.value)
                                }
                              />
                            </Field>
                          ) : null}
                          <Field label="First Name">
                            <input
                              className="input"
                              value={form.first_name}
                              onChange={(event) =>
                                updateFormField("first_name", event.target.value)
                              }
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
                              onChange={(event) =>
                                updateFormField("last_name", event.target.value)
                              }
                            />
                          </Field>
                          {isOptionalFieldVisible("suffix") ? (
                            <Field label="Suffix">
                              <input
                                className="input"
                                value={form.suffix}
                                onChange={(event) =>
                                  updateFormField("suffix", event.target.value)
                                }
                              />
                            </Field>
                          ) : null}
                          {isOptionalFieldVisible("nickname") ? (
                            <Field label="Nickname">
                              <input
                                className="input"
                                value={form.nickname}
                                onChange={(event) =>
                                  updateFormField("nickname", event.target.value)
                                }
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
                                  updateFormField(
                                    "phonetic_first_name",
                                    event.target.value,
                                  )
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
                                  updateFormField(
                                    "phonetic_last_name",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
    
                  <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                    <button
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                      type="button"
                      onClick={() => toggleSection("work")}
                      aria-expanded={openSections.work}
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
                        {openSections.work ? "-" : "+"}
                      </span>
                    </button>
    
                    {openSections.work ? (
                      <div className="mt-3 px-1 pb-1">
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="Company">
                            <input
                              className="input"
                              value={form.company}
                              onChange={(event) =>
                                updateFormField("company", event.target.value)
                              }
                            />
                          </Field>
                          {isOptionalFieldVisible("phonetic_company") ? (
                            <Field label="Phonetic Company">
                              <input
                                className="input"
                                value={form.phonetic_company}
                                onChange={(event) =>
                                  updateFormField(
                                    "phonetic_company",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                          ) : null}
                          <Field label="Job Title">
                            <input
                              className="input"
                              value={form.job_title}
                              onChange={(event) =>
                                updateFormField("job_title", event.target.value)
                              }
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
    
                  <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                    <button
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                      type="button"
                      onClick={() => toggleSection("personal")}
                      aria-expanded={openSections.personal}
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
                        {openSections.personal ? "-" : "+"}
                      </span>
                    </button>
    
                    {openSections.personal ? (
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
                                <option
                                  key={option.value || "none"}
                                  value={option.value}
                                >
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
                                  updateFormField(
                                    "pronouns_custom",
                                    event.target.value,
                                  )
                                }
                                placeholder="Optional custom value"
                                disabled={
                                  form.pronouns !== "custom" &&
                                  !form.pronouns_custom
                                }
                              />
                            </Field>
                          ) : null}
                          {isOptionalFieldVisible("ringtone") ? (
                            <Field label="Ringtone">
                              <input
                                className="input"
                                value={form.ringtone}
                                onChange={(event) =>
                                  updateFormField("ringtone", event.target.value)
                                }
                              />
                            </Field>
                          ) : null}
                          {isOptionalFieldVisible("text_tone") ? (
                            <Field label="Text Tone">
                              <input
                                className="input"
                                value={form.text_tone}
                                onChange={(event) =>
                                  updateFormField("text_tone", event.target.value)
                                }
                              />
                            </Field>
                          ) : null}
                          {isOptionalFieldVisible("verification_code") ? (
                            <Field label="Verification Code">
                              <input
                                className="input"
                                value={form.verification_code}
                                onChange={(event) =>
                                  updateFormField(
                                    "verification_code",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                          ) : null}
                          {isOptionalFieldVisible("profile") ? (
                            <Field label="Profile">
                              <input
                                className="input"
                                value={form.profile}
                                onChange={(event) =>
                                  updateFormField("profile", event.target.value)
                                }
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
                                updateFormField(
                                  "head_of_household",
                                  event.target.checked,
                                )
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
                                      updateBirthdayField(
                                        "month",
                                        event.target.value,
                                      )
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
                                    onChange={(event) =>
                                      updateBirthdayField("day", event.target.value)
                                    }
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
                                    onChange={(event) =>
                                      updateBirthdayField(
                                        "year",
                                        event.target.value,
                                      )
                                    }
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
                                Skip Birthday and Anniversary events for this
                                contact in generated milestone calendars.
                              </p>
                            </section>
                          </div>
                        </section>
    
                        <RelatedNameEditor
                          rows={form.related_names}
                          setRows={(nextRowsOrUpdater) =>
                            setForm((previousForm) => {
                              const currentRows = Array.isArray(
                                previousForm.related_names,
                              )
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
    
                  <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                    <button
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                      type="button"
                      onClick={() => toggleSection("communication")}
                      aria-expanded={openSections.communication}
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
                        {openSections.communication ? "-" : "+"}
                      </span>
                    </button>
    
                    {openSections.communication ? (
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
                            setRows={(rows) =>
                              updateFormField("instant_messages", rows)
                            }
                            labelOptions={labelOptions.instant_messages}
                            valuePlaceholder="im:username@example.com"
                            addLabel="Add IM"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </section>
    
                  <section className="rounded-2xl border border-dashed border-app-accent-edge bg-app-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-app-accent">
                        Add Optional Field
                      </h3>
                      <span className="text-xs text-app-faint">
                        Customize this form as needed
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="relative w-full max-w-xs">
                        <input
                          className="input"
                          value={fieldSearchTerm}
                          onFocus={() => {
                            if (hiddenOptionalFields.length > 0) {
                              setFieldPickerOpen(true);
                            }
                          }}
                          onChange={(event) => {
                            setFieldSearchTerm(event.target.value);
                            setFieldPickerOpen(true);
                          }}
                          onBlur={() => {
                            window.setTimeout(() => setFieldPickerOpen(false), 80);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addSelectedOptionalField();
                            }
    
                            if (event.key === "Escape") {
                              setFieldPickerOpen(false);
                            }
                          }}
                          placeholder={
                            hiddenOptionalFields.length === 0
                              ? "All optional fields added"
                              : "Search optional fields..."
                          }
                          disabled={hiddenOptionalFields.length === 0}
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={fieldPickerOpen}
                          aria-controls="optional-field-combobox-list"
                        />
                        {fieldPickerOpen && hiddenOptionalFields.length > 0 ? (
                          <div
                            id="optional-field-combobox-list"
                            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-app-edge bg-app-surface p-1 shadow-lg backdrop-blur"
                          >
                            {filteredHiddenOptionalFields.length === 0 ? (
                              <p className="px-2 py-2 text-sm text-app-faint">
                                No matching optional fields.
                              </p>
                            ) : (
                              filteredHiddenOptionalFields.map((field) => {
                                const isSelected = field.id === fieldToAdd;
    
                                return (
                                  <button
                                    key={field.id}
                                    className={`mb-1 block w-full rounded-lg border px-2.5 py-2 text-left text-sm transition last:mb-0 ${
                                      isSelected
                                        ? "border-app-accent-edge bg-app-surface text-app-strong ring-1 ring-teal-500/30"
                                        : "border-transparent text-app-base hover:border-app-edge hover:bg-app-surface"
                                    }`}
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      setFieldToAdd(field.id);
                                      setFieldSearchTerm(field.label);
                                      setFieldPickerOpen(false);
                                    }}
                                  >
                                    {field.label}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        ) : null}
                      </div>
                      <button
                        className="btn-outline btn-outline-sm"
                        type="button"
                        onClick={addSelectedOptionalField}
                        disabled={!fieldToAdd}
                      >
                        Add Field
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {visibleOptionalFields.length === 0 ? (
                        <p className="text-sm text-app-faint">
                          Optional fields are hidden by default.
                        </p>
                      ) : (
                        visibleOptionalFields.map((fieldId) => {
                          const fieldMeta = OPTIONAL_CONTACT_FIELDS.find(
                            (field) => field.id === fieldId,
                          );
    
                          return (
                            <button
                              key={fieldId}
                              className="btn-outline btn-outline-sm"
                              type="button"
                              onClick={() => hideOptionalField(fieldId)}
                            >
                              Hide {fieldMeta?.label ?? fieldId}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </section>
    
                  <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
                    <button
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                      type="button"
                      onClick={() => toggleSection("addressBooks")}
                      aria-expanded={openSections.addressBooks}
                    >
                      <span>
                        <span className="block text-sm font-semibold uppercase tracking-wide text-app-base">
                          Address Books
                        </span>
                        <span className="block text-xs text-app-faint">
                          Choose where this contact will be stored.
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="rounded-full border border-app-warn-edge bg-app-warn-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-base">
                          Required
                        </span>
                        <span className="rounded-full border border-app-edge bg-app-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-faint">
                          {selectedAddressBookCount} selected
                        </span>
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
                          {openSections.addressBooks ? "-" : "+"}
                        </span>
                      </span>
                    </button>
    
                    {openSections.addressBooks ? (
                      <div className="mt-3 space-y-3 px-1 pb-1">
                        <p className="text-xs text-app-faint">
                          Choose one or more address books for this contact.
                        </p>
                        <div className="space-y-2">
                          {addressBooks.length === 0 ? (
                            <p className="text-sm text-app-faint">
                              No writable address books.
                            </p>
                          ) : (
                            addressBooks.map((book) => {
                              const isAssigned = form.address_book_ids.includes(
                                book.id,
                              );
    
                              return (
                                <label
                                  key={book.id}
                                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                                    isAssigned
                                      ? "border-app-accent-edge bg-app-surface ring-1 ring-teal-500/30"
                                      : "border-app-edge bg-app-surface"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 shrink-0 self-start"
                                    checked={isAssigned}
                                    onChange={(event) =>
                                      toggleAssignedAddressBook(
                                        book.id,
                                        event.target.checked,
                                      )
                                    }
                                  />
                                  <span className="min-w-0">
                                    <span className="flex items-start gap-2">
                                      <span className="block font-medium text-app-strong">
                                        {book.display_name}
                                      </span>
                                      <span
                                        className={`mt-0.5 inline-flex h-4 shrink-0 items-center rounded-full border border-app-accent-edge px-1.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-app-accent ${
                                          isAssigned ? "" : "invisible"
                                        }`}
                                        aria-hidden={!isAssigned}
                                      >
                                        Selected
                                      </span>
                                    </span>
                                    <span className="block text-xs text-app-faint">
                                      /{book.uri} •{" "}
                                      {book.scope === "owned" ? "Owned" : "Shared"}
                                      {book.owner_name
                                        ? ` • ${book.owner_name}`
                                        : ""}
                                    </span>
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </section>
    
                  <section className="sticky bottom-2 z-20 sm:bottom-3">
                    <div className="surface flex items-center justify-end gap-1.5 rounded-xl px-2.5 py-1.5 shadow-lg shadow-black/10 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2">
                      {form.id ? (
                        <button
                          className="btn-outline btn-outline-sm text-app-danger"
                          type="button"
                          onClick={removeContact}
                          disabled={submitting}
                        >
                          Delete
                        </button>
                      ) : null}
                      <button
                        className="btn !px-3 !py-1.5 sm:!px-4 sm:!py-2"
                        type="submit"
                        disabled={
                          submitting ||
                          addressBooks.length === 0 ||
                          selectedAddressBookCount === 0 ||
                          !hasRequiredContactIdentity
                        }
                      >
                        {submitting ? "Saving..." : "Save Contact"}
                      </button>
                    </div>
                  </section>
                </form>
              </section>
  );
}
