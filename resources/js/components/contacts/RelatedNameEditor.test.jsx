import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RelatedNameEditor from "./RelatedNameEditor";

const LABEL_OPTIONS = [
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom" },
];

function normalizePositiveInt(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function createEmptyRelatedName(label = "other") {
  return {
    label,
    custom_label: "",
    value: "",
    related_contact_id: null,
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
  return null;
}

function RelatedNameEditorHarness({ contactOptions }) {
  const [rows, setRows] = useState([createEmptyRelatedName("other")]);

  return (
    <>
      <RelatedNameEditor
        rows={rows}
        setRows={setRows}
        contactOptions={contactOptions}
        labelOptions={LABEL_OPTIONS}
        defaultLabelOptions={LABEL_OPTIONS}
        resolveLabelSelectValue={(row) => row.label ?? "other"}
        normalizePositiveInt={normalizePositiveInt}
        createEmptyRelatedName={createEmptyRelatedName}
        useRowReorder={useRowReorderStub}
        RowReorderControls={RowReorderControlsStub}
      />
      <pre data-testid="rows-state">{JSON.stringify(rows)}</pre>
    </>
  );
}

describe("RelatedNameEditor", () => {
  it("matches contacts by nickname and applies full-name selection", async () => {
    const user = userEvent.setup();

    render(
      <RelatedNameEditorHarness
        contactOptions={[
          { id: 7, display_name: "Alex Doe", nickname: "Ace" },
          { id: 12, display_name: "Taylor Young", nickname: "Tay" },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText("Name");
    await user.click(input);
    await user.type(input, "ACE");

    expect(screen.getByRole("button", { name: "Alex Doe" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Taylor Young" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Alex Doe" }));

    expect(input).toHaveValue("Alex Doe");
    expect(screen.getByTestId("rows-state")).toHaveTextContent(
      '"related_contact_id":7',
    );
  });
});
