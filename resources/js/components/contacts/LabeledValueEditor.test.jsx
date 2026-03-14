import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LabeledValueEditor from "./LabeledValueEditor";

const LABEL_OPTIONS = [
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom" },
];

function createEmptyLabeledValue(label = "other") {
  return {
    label,
    custom_label: "",
    value: "",
  };
}

function useRowReorderStub() {
  return {
    handleDragStart: () => {},
    handleDragMove: () => {},
    completeDrag: () => {},
    moveRowUp: () => {},
    moveRowDown: () => {},
    isDragSource: () => false,
    isDropTarget: () => false,
  };
}

function RowReorderControlsStub() {
  return <div>Row controls</div>;
}

function LabeledValueEditorHarness() {
  const [rows, setRows] = useState([createEmptyLabeledValue("other")]);

  return (
    <LabeledValueEditor
      title="Phone"
      rows={rows}
      setRows={setRows}
      labelOptions={LABEL_OPTIONS}
      valuePlaceholder="Phone number"
      addLabel="Add phone number"
      resolveLabelSelectValue={(row) => row.label ?? "other"}
      createEmptyLabeledValue={createEmptyLabeledValue}
      useRowReorder={useRowReorderStub}
      RowReorderControls={RowReorderControlsStub}
    />
  );
}

describe("LabeledValueEditor", () => {
  it("places mobile controls before fields and keeps desktop controls after fields", () => {
    render(<LabeledValueEditorHarness />);

    const mobileControls = document.querySelector("[data-row-controls-mobile]");
    const desktopControls = document.querySelector("[data-row-controls-desktop]");
    const typeSelect = screen.getByRole("combobox");
    const valueInput = screen.getByPlaceholderText("Phone number");

    expect(mobileControls).not.toBeNull();
    expect(desktopControls).not.toBeNull();
    expect(mobileControls).toHaveClass("md:hidden");
    expect(desktopControls).toHaveClass("hidden");
    expect(desktopControls).toHaveClass("md:block");
    expect(
      mobileControls.compareDocumentPosition(typeSelect) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      mobileControls.compareDocumentPosition(valueInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      valueInput.compareDocumentPosition(desktopControls) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
