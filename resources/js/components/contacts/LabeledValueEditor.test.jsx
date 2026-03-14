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
  it("keeps row controls above fields on mobile layouts", () => {
    render(<LabeledValueEditorHarness />);

    const controlsWrapper = screen.getByText("Row controls").parentElement;
    expect(controlsWrapper).not.toBeNull();
    expect(controlsWrapper).toHaveClass("order-first");
    expect(controlsWrapper).toHaveClass("md:order-none");
  });
});
