import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResourcePanel from "./ResourcePanel";

function TestCopyableResourceUri({ resourceUri }) {
  return <span data-testid={`uri-${resourceUri}`}>{resourceUri}</span>;
}

function TestPermissionBadge({ permission }) {
  return <span data-testid={`permission-${permission}`}>{permission}</span>;
}

function TestIcon({ className = "" }) {
  return <svg className={className} aria-hidden="true" />;
}

const OWNED_ITEMS = [
  {
    id: 101,
    display_name: "Work",
    uri: "work",
    is_sharable: false,
    is_default: false,
  },
];

const SHARED_ITEMS = [
  {
    id: 202,
    share_id: 1,
    display_name: "Family",
    uri: "family",
    owner_name: "Owner",
    owner_email: "owner@example.com",
    permission: "editor",
  },
];

function ResourcePanelHarness({
  items,
  sharedItems,
  onCreate,
  onExportAll,
  onExportItem,
  onToggle,
  onRename,
}) {
  const [form, setForm] = useState({
    display_name: "",
    is_sharable: false,
  });

  return (
    <>
      <ResourcePanel
        title="Resources"
        createLabel="Create Resource"
        exportAllLabel="Export All"
        resourceKind="address-book"
        principalId={42}
        items={items}
        sharedItems={sharedItems}
        onCreate={onCreate}
        form={form}
        setForm={setForm}
        onExportAll={onExportAll}
        onExportItem={onExportItem}
        onToggle={onToggle}
        onRename={onRename}
        CopyableResourceUri={TestCopyableResourceUri}
        PermissionBadge={TestPermissionBadge}
        DownloadIcon={TestIcon}
        PencilIcon={TestIcon}
      />
      <pre data-testid="form-state">{JSON.stringify(form)}</pre>
    </>
  );
}

function renderPanel({
  items = OWNED_ITEMS,
  sharedItems = SHARED_ITEMS,
  onCreate = vi.fn((event) => event.preventDefault()),
  onExportAll = vi.fn(),
  onExportItem = vi.fn(),
  onToggle = vi.fn(),
  onRename = vi.fn().mockResolvedValue(undefined),
} = {}) {
  render(
    <ResourcePanelHarness
      items={items}
      sharedItems={sharedItems}
      onCreate={onCreate}
      onExportAll={onExportAll}
      onExportItem={onExportItem}
      onToggle={onToggle}
      onRename={onRename}
    />,
  );

  return {
    user: userEvent.setup(),
    onCreate,
    onExportAll,
    onExportItem,
    onToggle,
    onRename,
  };
}

function currentFormState() {
  return JSON.parse(screen.getByTestId("form-state").textContent ?? "{}");
}

describe("ResourcePanel", () => {
  it("updates create form state and submits", async () => {
    const { user, onCreate } = renderPanel();

    await user.type(screen.getByPlaceholderText("Display name"), "Team");
    await user.click(screen.getAllByRole("checkbox", { name: "Sharable" })[0]);
    await user.click(screen.getByRole("button", { name: "Create Resource" }));

    expect(currentFormState()).toEqual({
      display_name: "Team",
      is_sharable: true,
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("renames an owned resource when the name changes", async () => {
    const { user, onRename } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Edit name for Work" }));
    await user.clear(screen.getByRole("textbox", { name: "Edit name for Work" }));
    await user.type(
      screen.getByRole("textbox", { name: "Edit name for Work" }),
      "Work Updated",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onRename).toHaveBeenCalledWith(101, "Work Updated"));
    expect(
      screen.queryByRole("textbox", { name: "Edit name for Work" }),
    ).not.toBeInTheDocument();
  });

  it("closes rename mode without saving when name is unchanged", async () => {
    const { user, onRename } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Edit name for Work" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onRename).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "Edit name for Work" }),
    ).not.toBeInTheDocument();
  });

  it("routes export and toggle actions to callbacks", async () => {
    const { user, onExportAll, onExportItem, onToggle } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Export All" }));
    await user.click(screen.getByRole("button", { name: "Export Work" }));
    await user.click(screen.getByRole("button", { name: "Export Family" }));
    await user.click(screen.getAllByRole("checkbox", { name: "Sharable" })[1]);

    expect(onExportAll).toHaveBeenCalledTimes(1);
    expect(onExportItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 101, display_name: "Work" }),
    );
    expect(onExportItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 202, display_name: "Family" }),
    );
    expect(onToggle).toHaveBeenCalledWith(101, true, "Work");
  });
});
