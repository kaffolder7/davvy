import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactChangeRequestCard from "./ContactChangeRequestCard";

function createRow(overrides = {}) {
  return {
    id: 7,
    group_uuid: "group-abc",
    operation: "update",
    status: "pending",
    created_at: "2026-03-01T12:30:00.000Z",
    contact: { display_name: "Alex Doe" },
    requester: { name: "Requester", email: "requester@example.com" },
    approval_owner: { name: "Owner", email: "owner@example.com" },
    source: "ui",
    reviewer: null,
    changed_fields: ["emails", "phones"],
    status_reason: "",
    ...overrides,
  };
}

describe("ContactChangeRequestCard", () => {
  it("renders actionable update rows and dispatches callbacks", async () => {
    const user = userEvent.setup();
    const row = createRow();
    const onOpenEdit = vi.fn();
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <ContactChangeRequestCard
        row={row}
        submitting={false}
        onOpenEdit={onOpenEdit}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    expect(screen.getByText("Alex Doe (Update)")).toBeInTheDocument();
    expect(screen.getByText(/Status: Pending/)).toBeInTheDocument();
    expect(screen.getByText("Changed fields: emails, phones")).toBeInTheDocument();
    expect(screen.getByText("Reviewer: Not reviewed yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit & Approve" }));
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Deny" }));

    expect(onOpenEdit).toHaveBeenCalledWith(row);
    expect(onApprove).toHaveBeenCalledWith(row);
    expect(onDeny).toHaveBeenCalledWith(row);
  });

  it("hides edit button for delete operations but keeps approve/deny", () => {
    render(
      <ContactChangeRequestCard
        row={createRow({ operation: "delete" })}
        submitting={false}
        onOpenEdit={vi.fn()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit & Approve" })).toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
  });

  it("hides action buttons for non-actionable statuses", () => {
    render(
      <ContactChangeRequestCard
        row={createRow({ status: "applied", status_reason: "Already merged" })}
        submitting={false}
        onOpenEdit={vi.fn()}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
    expect(screen.getByText("Already merged")).toBeInTheDocument();
  });
});
