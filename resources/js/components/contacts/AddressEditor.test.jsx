import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AddressEditor from "./AddressEditor";

const LABEL_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "custom", label: "Custom" },
];

function createEmptyAddress(label = "home") {
  return {
    label,
    custom_label: "",
    street: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
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

function AddressEditorHarness() {
  const [rows, setRows] = useState([createEmptyAddress("home")]);

  return (
    <AddressEditor
      rows={rows}
      setRows={setRows}
      labelOptions={LABEL_OPTIONS}
      defaultLabelOptions={LABEL_OPTIONS}
      resolveLabelSelectValue={(row) => row.label ?? "home"}
      createEmptyAddress={createEmptyAddress}
      useRowReorder={useRowReorderStub}
      RowReorderControls={RowReorderControlsStub}
    />
  );
}

describe("AddressEditor", () => {
  it("keeps row controls above fields on mobile layouts", () => {
    render(<AddressEditorHarness />);

    const controlsWrapper = screen.getByText("Row controls").parentElement;
    expect(controlsWrapper).not.toBeNull();
    expect(controlsWrapper).toHaveClass("order-first");
    expect(controlsWrapper).toHaveClass("md:order-none");
  });
});
