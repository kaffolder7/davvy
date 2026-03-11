import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardSharingPanel from "./DashboardSharingPanel";

function PermissionBadgeStub({ permission }) {
  return <span data-testid={`permission-${permission}`}>{permission}</span>;
}

function SharingPanelHarness({
  initialForm,
  onSaveShare,
  onDeleteShare,
  shareableResourceOptions,
  targets,
  outgoing,
}) {
  const [shareForm, setShareForm] = useState(initialForm);

  return (
    <>
      <DashboardSharingPanel
        shareForm={shareForm}
        setShareForm={setShareForm}
        shareableResourceOptions={shareableResourceOptions}
        targets={targets}
        outgoing={outgoing}
        onSaveShare={onSaveShare}
        onDeleteShare={onDeleteShare}
        PermissionBadge={PermissionBadgeStub}
      />
      <pre data-testid="share-form-state">{JSON.stringify(shareForm)}</pre>
    </>
  );
}

function currentFormState() {
  return JSON.parse(screen.getByTestId("share-form-state").textContent ?? "{}");
}

describe("DashboardSharingPanel", () => {
  it("submits share form and updates form state", async () => {
    const user = userEvent.setup();
    const onSaveShare = vi.fn((event) => event.preventDefault());

    render(
      <SharingPanelHarness
        initialForm={{
          resource_type: "calendar",
          resource_id: "",
          shared_with_id: "",
          permission: "read_only",
        }}
        onSaveShare={onSaveShare}
        onDeleteShare={vi.fn()}
        shareableResourceOptions={[
          { id: 10, display_name: "Team Calendar" },
          { id: 11, display_name: "Family Calendar" },
        ]}
        targets={[{ id: 7, name: "Pat", email: "pat@example.com" }]}
        outgoing={[]}
      />,
    );

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "address_book");
    expect(currentFormState()).toMatchObject({
      resource_type: "address_book",
      resource_id: "",
    });

    await user.selectOptions(selects[1], "11");
    await user.selectOptions(selects[2], "7");
    await user.selectOptions(selects[3], "admin");
    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(currentFormState()).toMatchObject({
      resource_type: "address_book",
      resource_id: "11",
      shared_with_id: "7",
      permission: "admin",
    });
    expect(onSaveShare).toHaveBeenCalledTimes(1);
  });

  it("renders outgoing share entries and revokes by id", async () => {
    const user = userEvent.setup();
    const onDeleteShare = vi.fn();

    render(
      <SharingPanelHarness
        initialForm={{
          resource_type: "calendar",
          resource_id: "",
          shared_with_id: "",
          permission: "read_only",
        }}
        onSaveShare={vi.fn((event) => event.preventDefault())}
        onDeleteShare={onDeleteShare}
        shareableResourceOptions={[]}
        targets={[]}
        outgoing={[
          {
            id: 99,
            resource_type: "calendar",
            resource_id: 10,
            permission: "editor",
            shared_with: { name: "Pat", email: "pat@example.com" },
          },
        ]}
      />,
    );

    expect(screen.getByText("calendar #10")).toBeInTheDocument();
    expect(
      screen.getByText("Shared with: Pat (pat@example.com)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("permission-editor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onDeleteShare).toHaveBeenCalledWith(99);
  });
});
