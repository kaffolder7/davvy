import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RowReorderControls from "./RowReorderControls";
import { moveArrayItem, useRowReorder } from "./useRowReorder";

function ReorderHarness({ initialRows = ["A", "B", "C"] }) {
  const [rows, setRows] = useState(initialRows);
  const reorder = useRowReorder(rows, setRows);
  const rowGroup = "test-reorder-group";

  const removeRow = (index) => {
    setRows(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <>
      <pre data-testid="rows-state">{JSON.stringify(rows)}</pre>
      <div>
        {rows.map((value, index) => (
          <div
            key={`row-${value}-${index}`}
            data-reorder-index={index}
            data-reorder-group={rowGroup}
            className="group/row"
          >
            <span>{value}</span>
            <RowReorderControls
              rowLabel="Item"
              rowGroup={rowGroup}
              rowIndex={index}
              rowCount={rows.length}
              onDragStart={reorder.handleDragStart}
              onDragMove={reorder.handleDragMove}
              onDragEnd={reorder.completeDrag}
              onDragCancel={reorder.completeDrag}
              onMoveUp={reorder.moveRowUp}
              onMoveDown={reorder.moveRowDown}
              onRemove={removeRow}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function rowsState() {
  return JSON.parse(screen.getByTestId("rows-state").textContent ?? "[]");
}

describe("moveArrayItem", () => {
  it("moves an item between valid indices", () => {
    expect(moveArrayItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("returns a copy when indices are invalid", () => {
    const initial = ["a", "b", "c"];
    const result = moveArrayItem(initial, -1, 1);

    expect(result).toEqual(initial);
    expect(result).not.toBe(initial);
  });
});

describe("useRowReorder with RowReorderControls", () => {
  it("moves rows down and up from action buttons", async () => {
    const user = userEvent.setup();
    render(<ReorderHarness />);

    await user.click(screen.getByRole("button", { name: "Move Item 1 down" }));
    expect(rowsState()).toEqual(["B", "A", "C"]);

    await user.click(screen.getByRole("button", { name: "Move Item 2 up" }));
    expect(rowsState()).toEqual(["A", "B", "C"]);
  });

  it("disables boundary move buttons", () => {
    render(<ReorderHarness />);

    expect(
      screen.getByRole("button", { name: "Move Item 1 up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Item 3 down" }),
    ).toBeDisabled();
  });

  it("removes the targeted row", async () => {
    const user = userEvent.setup();
    render(<ReorderHarness />);

    await user.click(screen.getByRole("button", { name: "Remove Item 2" }));
    expect(rowsState()).toEqual(["A", "C"]);
  });
});
