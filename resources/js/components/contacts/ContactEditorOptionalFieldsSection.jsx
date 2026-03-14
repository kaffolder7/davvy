import React from "react";

/**
 * Renders the Contact Editor Optional Fields Section component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function ContactEditorOptionalFieldsSection({
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
}) {
  return (
    <section className="rounded-2xl border border-dashed border-app-accent-edge bg-app-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-accent">
          Add Optional Field
        </h3>
        <span className="text-xs text-app-faint">Customize this form as needed</span>
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
              className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-app-edge bg-app-surface p-1 shadow-lg backdrop-blur"
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
          <p className="text-sm text-app-faint">Optional fields are hidden by default.</p>
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
  );
}
