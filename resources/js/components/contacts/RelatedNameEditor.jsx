import React, { useEffect, useState } from "react";

/**
 * Renders the Related Name Editor component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function RelatedNameEditor({
  rows,
  setRows,
  contactOptions,
  labelOptions,
  defaultLabelOptions,
  resolveLabelSelectValue,
  normalizePositiveInt,
  createEmptyRelatedName,
  useRowReorder,
  RowReorderControls,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeLabelOptions =
    Array.isArray(labelOptions) && labelOptions.length > 0
      ? labelOptions
      : defaultLabelOptions;
  const safeContactOptions = Array.isArray(contactOptions) ? contactOptions : [];
  const reorder = useRowReorder(safeRows, setRows);
  const rowGroup = "reorder-related-name";
  const [pickerRowIndex, setPickerRowIndex] = useState(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState({});

  useEffect(() => {
    if (pickerRowIndex === null || pickerRowIndex < safeRows.length) {
      return;
    }

    setPickerRowIndex(null);
  }, [pickerRowIndex, safeRows.length]);

  const suggestionKeyFor = (index, rowValue, contactId) =>
    `${index}:${String(rowValue ?? "").trim().toLowerCase()}:${contactId}`;

  const updateRows = (nextRowsOrUpdater) => {
    if (typeof nextRowsOrUpdater === "function") {
      setRows((previousRows) => {
        const normalizedPreviousRows = Array.isArray(previousRows)
          ? previousRows
          : [];

        return nextRowsOrUpdater(normalizedPreviousRows);
      });
      return;
    }

    setRows(nextRowsOrUpdater);
  };

  const updateRow = (index, patch) => {
    updateRows((previousRows) =>
      previousRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const updateLabel = (index, nextValue) => {
    const selectedOption = safeLabelOptions.find(
      (option) => option.value === nextValue,
    );

    if (selectedOption?.saved_custom_label) {
      updateRow(index, {
        label: "custom",
        custom_label: selectedOption.saved_custom_label,
      });
      return;
    }

    if (nextValue === "custom") {
      updateRow(index, {
        label: "custom",
        custom_label: safeRows[index]?.custom_label ?? "",
      });
      return;
    }

    updateRow(index, {
      label: nextValue,
      custom_label: "",
    });
  };

  const addRow = () => {
    updateRows((previousRows) => [
      ...previousRows,
      createEmptyRelatedName("other"),
    ]);
  };

  const removeRow = (index) => {
    updateRows((previousRows) =>
      previousRows.filter((_, rowIndex) => rowIndex !== index),
    );
  };

  const matchingContactOptions = (value) => {
    const query = String(value ?? "").trim().toLowerCase();
    if (!query) {
      return safeContactOptions;
    }

    return safeContactOptions.filter((contact) =>
      contact.display_name.toLowerCase().includes(query),
    );
  };

  const selectContactOption = (index, option) => {
    const rowValue = safeRows[index]?.value ?? "";
    updateRow(index, {
      value: option.display_name,
      related_contact_id: option.id,
    });
    setDismissedSuggestions((previous) => {
      const key = suggestionKeyFor(index, rowValue, option.id);
      if (!previous[key]) {
        return previous;
      }

      const next = { ...previous };
      delete next[key];
      return next;
    });
    setPickerRowIndex(null);
  };

  const exactMatchSuggestion = (row) => {
    if (normalizePositiveInt(row?.related_contact_id) !== null) {
      return null;
    }

    const candidate = String(row?.value ?? "").trim();
    if (!candidate) {
      return null;
    }

    const matches = safeContactOptions.filter(
      (contact) =>
        contact.display_name.localeCompare(candidate, undefined, {
          sensitivity: "base",
        }) === 0,
    );

    return matches.length === 1 ? matches[0] : null;
  };

  return (
    <section className="rounded-2xl border border-app-edge bg-app-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
          Related Name
        </h3>
        <button
          className="btn-outline btn-outline-sm"
          type="button"
          onClick={addRow}
        >
          Add related name
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {safeRows.length === 0 ? (
          <p className="text-sm text-app-faint">No related names.</p>
        ) : (
          safeRows.map((row, index) => {
            const rowIsDragSource = reorder.isDragSource(index);
            const rowIsDropTarget = reorder.isDropTarget(index);
            const isPickerOpen = pickerRowIndex === index;
            const optionListId = `related-name-combobox-list-${index}`;
            const options = matchingContactOptions(row?.value);
            const selectedRelatedId = normalizePositiveInt(row?.related_contact_id);
            const selectedContact = safeContactOptions.find(
              (option) => option.id === selectedRelatedId,
            );
            const suggestedContact = exactMatchSuggestion(row);
            const suggestionKey =
              suggestedContact !== null
                ? suggestionKeyFor(index, row?.value, suggestedContact.id)
                : null;
            const suggestionDismissed =
              suggestionKey !== null && dismissedSuggestions[suggestionKey];

            return (
              <div
                key={`related-name-${index}`}
                data-reorder-index={index}
                data-reorder-group={rowGroup}
                className={`group/row rounded-xl border px-2 py-3 transition ${
                  rowIsDropTarget
                    ? "border-app-accent-edge ring-1 ring-teal-500/30"
                    : "border-app-edge"
                } ${rowIsDragSource ? "opacity-70" : ""}`}
              >
                <div className="grid items-center gap-2 md:grid-cols-[12rem_1fr_auto]">
                  <select
                    className="input"
                    value={resolveLabelSelectValue(row, safeLabelOptions, "other")}
                    onChange={(event) => updateLabel(index, event.target.value)}
                  >
                    {safeLabelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <input
                      className="input"
                      value={row.value ?? ""}
                      onFocus={() => setPickerRowIndex(index)}
                      onChange={(event) => {
                        updateRow(index, {
                          value: event.target.value,
                          related_contact_id: null,
                        });
                        setPickerRowIndex(index);
                      }}
                      onBlur={() => {
                        window.setTimeout(() => {
                          setPickerRowIndex((previous) =>
                            previous === index ? null : previous,
                          );
                        }, 80);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setPickerRowIndex(null);
                          return;
                        }

                        if (
                          event.key === "Enter" &&
                          isPickerOpen &&
                          options.length > 0
                        ) {
                          event.preventDefault();
                          selectContactOption(index, options[0]);
                        }
                      }}
                      placeholder="Name"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={isPickerOpen}
                      aria-controls={optionListId}
                    />
                    {isPickerOpen ? (
                      <div
                        id={optionListId}
                        className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-app-edge bg-app-surface p-1 shadow-lg backdrop-blur"
                      >
                        {options.length === 0 ? (
                          <p className="px-2 py-2 text-sm text-app-faint">
                            No matching contacts. Keep typing to use a custom
                            name.
                          </p>
                        ) : (
                          options.map((option) => {
                            const isSelected = option.id === selectedRelatedId;
                            return (
                              <button
                                key={option.id}
                                className={`mb-1 block w-full rounded-lg border px-2.5 py-2 text-left text-sm transition last:mb-0 ${
                                  isSelected
                                    ? "border-app-accent-edge bg-app-surface text-app-strong ring-1 ring-teal-500/30"
                                    : "border-transparent text-app-base hover:border-app-edge hover:bg-app-surface"
                                }`}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  selectContactOption(index, option);
                                }}
                              >
                                {option.display_name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="self-center">
                    <RowReorderControls
                      rowLabel="Related Name"
                      rowGroup={rowGroup}
                      rowIndex={index}
                      rowCount={safeRows.length}
                      onDragStart={reorder.handleDragStart}
                      onDragMove={reorder.handleDragMove}
                      onDragEnd={reorder.completeDrag}
                      onDragCancel={reorder.completeDrag}
                      onMoveUp={reorder.moveRowUp}
                      onMoveDown={reorder.moveRowDown}
                      onRemove={removeRow}
                    />
                  </div>
                </div>
                {selectedContact ? (
                  <p className="mt-1.5 text-[11px] text-app-faint">
                    Linked to contact #{selectedContact.id}.
                  </p>
                ) : null}
                {!selectedContact &&
                suggestedContact &&
                !suggestionDismissed ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <p className="text-[11px] text-app-faint">
                      Match found: {suggestedContact.display_name}
                    </p>
                    <button
                      className="btn-outline btn-outline-sm"
                      type="button"
                      onClick={() => selectContactOption(index, suggestedContact)}
                    >
                      Link
                    </button>
                    <button
                      className="btn-outline btn-outline-sm"
                      type="button"
                      onClick={() =>
                        setDismissedSuggestions((previous) =>
                          suggestionKey === null
                            ? previous
                            : { ...previous, [suggestionKey]: true },
                        )
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
                {row.label === "custom" ? (
                  <input
                    className="input mt-2"
                    value={row.custom_label ?? ""}
                    onChange={(event) =>
                      updateRow(index, { custom_label: event.target.value })
                    }
                    placeholder="Custom label"
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
