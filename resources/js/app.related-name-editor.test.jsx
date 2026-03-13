import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RelatedNameEditor } from "./routes/ContactsPageRoute.jsx";

const LABEL_OPTIONS = [
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom..." },
];

const createRow = (overrides = {}) => ({
  label: "other",
  custom_label: "",
  value: "",
  related_contact_id: null,
  ...overrides,
});

function EditorHarness({ initialRows, contactOptions }) {
  const [rows, setRows] = useState(initialRows);

  return (
    <>
      <RelatedNameEditor
        rows={rows}
        setRows={setRows}
        contactOptions={contactOptions}
        labelOptions={LABEL_OPTIONS}
      />
      <pre data-testid="rows-state">{JSON.stringify(rows)}</pre>
    </>
  );
}

function renderEditor({ initialRows, contactOptions }) {
  return render(
    <EditorHarness initialRows={initialRows} contactOptions={contactOptions} />,
  );
}

function rowsState() {
  return JSON.parse(screen.getByTestId("rows-state").textContent ?? "[]");
}

describe("RelatedNameEditor suggestion flow", () => {
  it("shows an exact-match suggestion when one contact matches case-insensitively", () => {
    renderEditor({
      initialRows: [createRow({ value: "alex doe" })],
      contactOptions: [{ id: 11, display_name: "Alex Doe" }],
    });

    expect(screen.getByText("Match found: Alex Doe")).toBeInTheDocument();
  });

  it("does not show suggestion when exact match is ambiguous", () => {
    renderEditor({
      initialRows: [createRow({ value: "Alex Doe" })],
      contactOptions: [
        { id: 11, display_name: "Alex Doe" },
        { id: 12, display_name: "ALEX DOE" },
      ],
    });

    expect(screen.queryByText(/Match found:/i)).not.toBeInTheDocument();
  });

  it("links the suggested contact when Link is clicked", async () => {
    const user = userEvent.setup();

    renderEditor({
      initialRows: [createRow({ value: "Alex Doe" })],
      contactOptions: [{ id: 11, display_name: "Alex Doe" }],
    });

    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(await screen.findByText("Linked to contact #11.")).toBeInTheDocument();
    expect(screen.queryByText("Match found: Alex Doe")).not.toBeInTheDocument();
    expect(rowsState()[0]).toMatchObject({
      value: "Alex Doe",
      related_contact_id: 11,
    });
  });

  it("keeps a dismissed suggestion hidden for the same value/contact key", async () => {
    const user = userEvent.setup();

    renderEditor({
      initialRows: [createRow({ value: "Alex Doe" })],
      contactOptions: [{ id: 11, display_name: "Alex Doe" }],
    });

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Match found: Alex Doe")).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText("Name");
    await user.type(input, " ");
    expect(screen.queryByText("Match found: Alex Doe")).not.toBeInTheDocument();
  });

  it("shows a new suggestion after value changes to a new exact-match key", async () => {
    const user = userEvent.setup();

    renderEditor({
      initialRows: [createRow({ value: "Alex Doe" })],
      contactOptions: [
        { id: 11, display_name: "Alex Doe" },
        { id: 12, display_name: "Jamie Doe" },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    const input = screen.getByPlaceholderText("Name");
    await user.clear(input);
    await user.type(input, "Jamie Doe");

    expect(await screen.findByText("Match found: Jamie Doe")).toBeInTheDocument();
  });

  it("clears dismissed suggestion state after selecting from picker", async () => {
    const user = userEvent.setup();

    renderEditor({
      initialRows: [createRow({ value: "Alex Doe" })],
      contactOptions: [{ id: 11, display_name: "Alex Doe" }],
    });

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    const input = screen.getByPlaceholderText("Name");
    await user.click(input);
    await user.click(screen.getByRole("button", { name: "Alex Doe" }));
    expect(await screen.findByText("Linked to contact #11.")).toBeInTheDocument();

    await user.click(input);
    await user.type(input, " ");

    expect(await screen.findByText("Match found: Alex Doe")).toBeInTheDocument();
  });

  it("does not show suggestion when row is already linked", () => {
    renderEditor({
      initialRows: [createRow({ value: "Alex Doe", related_contact_id: 11 })],
      contactOptions: [{ id: 11, display_name: "Alex Doe" }],
    });

    expect(screen.getByText("Linked to contact #11.")).toBeInTheDocument();
    expect(screen.queryByText(/Match found:/i)).not.toBeInTheDocument();
  });
});
