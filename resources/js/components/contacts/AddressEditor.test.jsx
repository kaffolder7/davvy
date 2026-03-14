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
  it("places mobile controls before fields and keeps desktop controls after fields", () => {
    render(<AddressEditorHarness />);

    const mobileControls = document.querySelector("[data-row-controls-mobile]");
    const desktopControls = document.querySelector("[data-row-controls-desktop]");
    const typeSelect = screen.getByRole("combobox");
    const streetInput = screen.getByPlaceholderText("Street");

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
      mobileControls.compareDocumentPosition(streetInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      streetInput.compareDocumentPosition(desktopControls) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
