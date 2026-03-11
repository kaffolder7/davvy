import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "./AdminPage";

function AppShellStub({ children }) {
  return <div>{children}</div>;
}

function InfoCardStub({ title, value }) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}

function FullPageStateStub({ label }) {
  return <div>{label}</div>;
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
];
const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
];
const RECOMMENDED_BACKUP_RETENTION = {
  daily: 7,
  weekly: 4,
  monthly: 12,
  yearly: 3,
};

function buildApi({ users } = {}) {
  const usersData = Array.isArray(users)
    ? users
    : [
        {
          id: 2,
          name: "Admin",
          email: "admin@example.com",
          role: "admin",
          calendars_count: 1,
          address_books_count: 1,
        },
      ];

  const get = vi.fn((url) => {
    if (url === "/api/admin/users") {
      return Promise.resolve({
        data: {
          data: usersData,
        },
      });
    }

    if (url === "/api/admin/resources") {
      return Promise.resolve({
        data: {
          calendars: [],
          address_books: [],
          milestone_purge_visible: false,
          milestone_purge_available: false,
        },
      });
    }

    if (url === "/api/admin/shares") {
      return Promise.resolve({ data: { data: [] } });
    }

    if (url === "/api/admin/settings/contact-change-retention") {
      return Promise.resolve({ data: { days: 90 } });
    }

    if (url === "/api/admin/settings/milestone-generation-years") {
      return Promise.resolve({ data: { years: 3 } });
    }

    if (url === "/api/admin/settings/backups") {
      return Promise.resolve({
        data: {
          enabled: false,
          local_enabled: true,
          local_path: "/tmp/davvy/backups",
          s3_enabled: false,
          s3_disk: "s3",
          s3_prefix: "davvy-backups",
          timezone: "UTC",
          schedule_times: ["02:30"],
          weekly_day: 0,
          monthly_day: 1,
          yearly_month: 1,
          yearly_day: 1,
          retention_daily: 7,
          retention_weekly: 4,
          retention_monthly: 12,
          retention_yearly: 3,
          last_run: {
            at: null,
            status: null,
            message: "",
          },
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

  const patch = vi.fn((url, payload) => {
    if (url === "/api/admin/settings/registration") {
      return Promise.resolve({
        data: {
          enabled: !!payload.enabled,
          require_approval: !!payload.enabled,
        },
      });
    }

    if (url === "/api/admin/settings/registration-approval") {
      return Promise.resolve({ data: { enabled: !!payload.enabled } });
    }

    if (url === "/api/admin/users/approve-pending") {
      return Promise.resolve({ data: { approved_count: 1 } });
    }

    if (url === "/api/admin/settings/contact-change-retention") {
      return Promise.resolve({ data: { days: Number(payload.days) } });
    }

    return Promise.resolve({ data: {} });
  });

  return {
    get,
    patch,
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  };
}

function buildProps(overrides = {}) {
  const auth = {
    user: {
      id: 1,
      name: "Owner",
      role: "admin",
    },
    registrationEnabled: false,
    registrationApprovalRequired: false,
    ownerShareManagementEnabled: false,
    davCompatibilityModeEnabled: false,
    contactManagementEnabled: true,
    contactChangeModerationEnabled: true,
    setAuth: vi.fn(),
  };

  return {
    auth,
    theme: {},
    api: buildApi(),
    extractError: vi.fn((_, fallback) => fallback),
    AppShell: AppShellStub,
    InfoCard: InfoCardStub,
    AdminFeatureToggle: ({ label, enabled, onClick }) => (
      <button type="button" onClick={onClick}>
        {label}: {enabled ? "On" : "Off"}
      </button>
    ),
    FullPageState: FullPageStateStub,
    Field: ({ label, children }) => (
      <label>
        <span>{label}</span>
        {children}
      </label>
    ),
    PermissionBadge: ({ permission }) => <span>{permission}</span>,
    buildTimezoneGroups: () => [
      {
        label: "Common",
        options: [{ value: "UTC", label: "UTC" }],
      },
    ],
    parseBackupScheduleTimes: (value) =>
      String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    isRecommendedBackupRetention: ({ daily, weekly, monthly, yearly }) =>
      Number(daily) === RECOMMENDED_BACKUP_RETENTION.daily &&
      Number(weekly) === RECOMMENDED_BACKUP_RETENTION.weekly &&
      Number(monthly) === RECOMMENDED_BACKUP_RETENTION.monthly &&
      Number(yearly) === RECOMMENDED_BACKUP_RETENTION.yearly,
    areBackupConfigSnapshotsEqual: (left, right) =>
      JSON.stringify(left) === JSON.stringify(right),
    formatAdminTimestamp: () => "Mar 1, 2026",
    MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS: 6000,
    BACKUP_RUN_TOAST_AUTO_HIDE_MS: 3200,
    BACKUP_DRAWER_ANIMATION_MS: 220,
    WEEKDAY_OPTIONS,
    MONTH_OPTIONS,
    RECOMMENDED_BACKUP_RETENTION,
    ...overrides,
  };
}

describe("AdminPage", () => {
  it("loads admin data and renders the control center", async () => {
    const props = buildProps();

    render(<AdminPage {...props} />);

    expect(screen.getByText("Loading admin data...")).toBeInTheDocument();

    await waitFor(() =>
      expect(props.api.get).toHaveBeenCalledWith("/api/admin/users"),
    );

    expect(screen.getByText("Admin Control Center")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Create User" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Assign Share Access")).toBeInTheDocument();
  });

  it("toggles registration and saves queue retention", async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<AdminPage {...props} />);

    await waitFor(() =>
      expect(props.api.get).toHaveBeenCalledWith("/api/admin/users"),
    );

    await user.click(screen.getByRole("button", { name: /public registration/i }));

    await waitFor(() =>
      expect(props.api.patch).toHaveBeenCalledWith(
        "/api/admin/settings/registration",
        { enabled: true },
      ),
    );

    expect(props.auth.setAuth).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /require registration approval/i }),
    );

    await waitFor(() =>
      expect(props.api.patch).toHaveBeenCalledWith(
        "/api/admin/settings/registration-approval",
        { enabled: false },
      ),
    );

    const retentionInput = screen.getAllByRole("spinbutton")[0];
    await user.clear(retentionInput);
    await user.type(retentionInput, "120");
    await user.click(screen.getByRole("button", { name: "Save Retention" }));

    await waitFor(() =>
      expect(props.api.patch).toHaveBeenCalledWith(
        "/api/admin/settings/contact-change-retention",
        { days: 120 },
      ),
    );
  });

  it("optionally bulk-approves pending users when disabling registration approval", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const props = buildProps({
      auth: {
        user: {
          id: 1,
          name: "Owner",
          role: "admin",
        },
        registrationEnabled: true,
        registrationApprovalRequired: true,
        ownerShareManagementEnabled: false,
        davCompatibilityModeEnabled: false,
        contactManagementEnabled: true,
        contactChangeModerationEnabled: true,
        setAuth: vi.fn(),
      },
      api: buildApi({
        users: [
          {
            id: 3,
            name: "Pending User",
            email: "pending@example.com",
            role: "regular",
            is_approved: false,
            calendars_count: 0,
            address_books_count: 0,
          },
        ],
      }),
    });

    render(<AdminPage {...props} />);

    await waitFor(() =>
      expect(props.api.get).toHaveBeenCalledWith("/api/admin/users"),
    );

    await user.click(
      screen.getByRole("button", { name: /require registration approval/i }),
    );

    await waitFor(() =>
      expect(props.api.patch).toHaveBeenCalledWith(
        "/api/admin/settings/registration-approval",
        { enabled: false },
      ),
    );

    await waitFor(() =>
      expect(props.api.patch).toHaveBeenCalledWith(
        "/api/admin/users/approve-pending",
      ),
    );

    expect(
      await screen.findByText("Approved 1 pending account(s)."),
    ).toBeInTheDocument();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
