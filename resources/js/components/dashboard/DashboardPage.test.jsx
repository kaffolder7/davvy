import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./DashboardPage";

function AppShellStub({ children }) {
  return <div>{children}</div>;
}

function FullPageStateStub({ label }) {
  return <div>{label}</div>;
}

function InfoCardStub({ title, value }) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}

function PermissionBadgeStub({ permission }) {
  return <span>{permission}</span>;
}

function ResourcePanelStub({ title, onToggle }) {
  return (
    <section>
      <h4>{title}</h4>
      <button
        type="button"
        onClick={() => onToggle(1, true, `${title} Resource`)}
      >
        Toggle {title}
      </button>
    </section>
  );
}

function AddressBookMilestoneControlsStub() {
  return <span>Milestone</span>;
}

function DashboardOverviewCardsStub() {
  return <section>Overview Cards</section>;
}

function DashboardSharingPanelStub() {
  return <section>Sharing Panel</section>;
}

function DashboardAppleCompatPanelStub({
  setAppleCompatForm,
  onSaveAppleCompat,
}) {
  return (
    <section>
      <button
        type="button"
        onClick={() =>
          setAppleCompatForm({
            enabled: true,
            source_ids: [9],
          })
        }
      >
        Enable Apple Compat
      </button>
      <button
        type="button"
        onClick={() => onSaveAppleCompat({ preventDefault() {} })}
      >
        Save Apple Compat
      </button>
    </section>
  );
}

function baseDashboardPayload(overrides = {}) {
  return {
    owned: { calendars: [], address_books: [] },
    shared: { calendars: [], address_books: [] },
    sharing: { can_manage: true, targets: [], outgoing: [] },
    apple_compat: {
      enabled: false,
      target_address_book_id: 77,
      target_address_book_uri: "contacts",
      target_display_name: "Contacts",
      selected_source_ids: [],
      source_options: [],
    },
    ...overrides,
  };
}

function buildProps(overrides = {}) {
  return {
    auth: {
      user: {
        id: 10,
        role: "admin",
      },
    },
    theme: {},
    api: {
      get: vi
        .fn()
        .mockResolvedValue({ data: baseDashboardPayload() }),
      patch: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    extractError: vi.fn((_, fallback) => fallback),
    downloadExport: vi.fn().mockResolvedValue(undefined),
    fileStem: vi.fn((value, fallback) => value || fallback),
    AppShell: AppShellStub,
    FullPageState: FullPageStateStub,
    InfoCard: InfoCardStub,
    PermissionBadge: PermissionBadgeStub,
    ResourcePanel: ResourcePanelStub,
    AddressBookMilestoneControls: AddressBookMilestoneControlsStub,
    DashboardOverviewCards: DashboardOverviewCardsStub,
    DashboardSharingPanel: DashboardSharingPanelStub,
    DashboardAppleCompatPanel: DashboardAppleCompatPanelStub,
    ...overrides,
  };
}

describe("DashboardPage", () => {
  it("loads dashboard data and renders primary sections", async () => {
    const props = buildProps();
    render(<DashboardPage {...props} />);

    expect(screen.getByText("Loading resources...")).toBeInTheDocument();

    await waitFor(() =>
      expect(props.api.get).toHaveBeenCalledWith("/api/dashboard"),
    );

    expect(screen.getByText("Overview Cards")).toBeInTheDocument();
    expect(screen.getByText("Your Calendars")).toBeInTheDocument();
    expect(screen.getByText("Your Address Books")).toBeInTheDocument();
    expect(screen.getByText("Sharing Panel")).toBeInTheDocument();
  });

  it("toggles sharable status and shows share status notice", async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<DashboardPage {...props} />);

    await waitFor(() => expect(props.api.get).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Toggle Your Calendars" }));

    await waitFor(() =>
      expect(props.api.patch).toHaveBeenCalledWith("/api/calendars/1", {
        is_sharable: true,
      }),
    );
    expect(
      screen.getByText("Your Calendars Resource is now shared."),
    ).toBeInTheDocument();
  });

  it("saves apple compatibility settings with current form", async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<DashboardPage {...props} />);

    await waitFor(() => expect(props.api.get).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Enable Apple Compat" }));
    await user.click(screen.getByRole("button", { name: "Save Apple Compat" }));

    await waitFor(() =>
      expect(props.api.patch).toHaveBeenCalledWith(
        "/api/address-books/apple-compat",
        {
          enabled: true,
          source_ids: [9],
        },
      ),
    );
  });
});
