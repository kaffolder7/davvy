import React from "react";

/**
 * Renders the Address Editor component.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function AddressEditor({
  rows,
  setRows,
  labelOptions,
  defaultLabelOptions,
  resolveLabelSelectValue,
  createEmptyAddress,
  useRowReorder,
  RowReorderControls,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeLabelOptions =
    Array.isArray(labelOptions) && labelOptions.length > 0
      ? labelOptions
      : defaultLabelOptions;
  const reorder = useRowReorder(safeRows, setRows);
  const rowGroup = "reorder-address";

  const updateRow = (index, field, value) => {
    const patch =
      typeof field === "string"
        ? { [field]: value }
        : field && typeof field === "object"
          ? field
          : {};

    setRows(
      safeRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const addRow = () => {
    setRows([...safeRows, createEmptyAddress("home")]);
  };

  const removeRow = (index) => {
    setRows(safeRows.filter((_, rowIndex) => rowIndex !== index));
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

  return (
    <section className="rounded-2xl border border-app-edge bg-app-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-base">
          Address
        </h3>
        <button
          className="btn-outline btn-outline-sm"
          type="button"
          onClick={addRow}
        >
          Add address
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {safeRows.length === 0 ? (
          <p className="text-sm text-app-faint">No addresses.</p>
        ) : (
          safeRows.map((row, index) => {
            const rowIsDragSource = reorder.isDragSource(index);
            const rowIsDropTarget = reorder.isDropTarget(index);

            return (
              <div
                key={`address-${index}`}
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
                    value={resolveLabelSelectValue(row, safeLabelOptions, "home")}
                    onChange={(event) => updateLabel(index, event.target.value)}
                  >
                    {safeLabelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    value={row.street ?? ""}
                    onChange={(event) =>
                      updateRow(index, "street", event.target.value)
                    }
                    placeholder="Street"
                  />
                  <div className="self-center">
                    <RowReorderControls
                      rowLabel="Address"
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
                {row.label === "custom" ? (
                  <input
                    className="input mt-2"
                    value={row.custom_label ?? ""}
                    onChange={(event) =>
                      updateRow(index, "custom_label", event.target.value)
                    }
                    placeholder="Custom label"
                  />
                ) : null}
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <input
                    className="input"
                    value={row.city ?? ""}
                    onChange={(event) => updateRow(index, "city", event.target.value)}
                    placeholder="City"
                  />
                  <input
                    className="input"
                    value={row.state ?? ""}
                    onChange={(event) =>
                      updateRow(index, "state", event.target.value)
                    }
                    placeholder="State / Region"
                  />
                  <input
                    className="input"
                    value={row.postal_code ?? ""}
                    onChange={(event) =>
                      updateRow(index, "postal_code", event.target.value)
                    }
                    placeholder="Postal code"
                  />
                  <input
                    className="input"
                    value={row.country ?? ""}
                    onChange={(event) =>
                      updateRow(index, "country", event.target.value)
                    }
                    placeholder="Country"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
