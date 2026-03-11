import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactChangeQueuePage from "./ContactChangeQueuePage";

const BASE_ROW = {
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
  changed_fields: ["emails"],
  status_reason: "",
  proposed_payload: { first_name: "Alex" },
  proposed_address_book_ids: [2],
};

function TestAppShell({ children }) {
  return <div>{children}</div>;
}

function TestFullPageState({ label }) {
  return <div>{label}</div>;
}

function renderQueuePage({
  rows = [BASE_ROW],
  api = {
    get: vi.fn().mockResolvedValue({ data: { data: rows } }),
    patch: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ data: { processed: 1, skipped: 0 } }),
  },
  extractError = (_, fallback) => fallback,
} = {}) {
  render(
    <ContactChangeQueuePage
      auth={{ user: { id: 1 } }}
      theme={{}}
      api={api}
      extractError={extractError}
      AppShell={TestAppShell}
      FullPageState={TestFullPageState}
    />,
  );

  return {
    user: userEvent.setup(),
    api,
  };
}

describe("ContactChangeQueuePage", () => {
  it("loads queue rows and approves a request", async () => {
    const { user, api } = renderQueuePage();

    expect(
      await screen.findByText("Alex Doe (Update)", {}, { timeout: 2000 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/api/contact-change-requests/7/approve",
        {},
      ),
    );
    expect(screen.getByText("Request approved.")).toBeInTheDocument();
  });

  it("surfaces validation error for invalid resolved payload JSON", async () => {
    const { user, api } = renderQueuePage();

    await screen.findByText("Alex Doe (Update)", {}, { timeout: 2000 });
    await user.click(screen.getByRole("button", { name: "Edit & Approve" }));

    fireEvent.change(screen.getByLabelText("Resolved Payload JSON"), {
      target: { value: "{" },
    });
    await user.click(screen.getByRole("button", { name: "Save Edits & Approve" }));

    expect(screen.getByText("Resolved payload must be valid JSON.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("approves edited payload and address book ids", async () => {
    const { user, api } = renderQueuePage();

    await screen.findByText("Alex Doe (Update)", {}, { timeout: 2000 });
    await user.click(screen.getByRole("button", { name: "Edit & Approve" }));

    fireEvent.change(screen.getByLabelText("Resolved Payload JSON"), {
      target: { value: '{"nickname":"AJ"}' },
    });
    fireEvent.change(screen.getByLabelText("Resolved Address Book IDs JSON Array"), {
      target: { value: "[4,5]" },
    });
    await user.click(screen.getByRole("button", { name: "Save Edits & Approve" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/api/contact-change-requests/7/approve",
        {
          resolved_payload: { nickname: "AJ" },
          resolved_address_book_ids: [4, 5],
        },
      ),
    );
  });
});
