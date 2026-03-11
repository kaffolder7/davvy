import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddressBookMilestoneControls from "./AddressBookMilestoneControls";

function TestIcon({ className = "" }) {
  return <svg className={className} aria-hidden="true" />;
}

function createItem(overrides = {}) {
  return {
    id: 42,
    display_name: "Friends",
    milestone_calendars: {
      birthdays: {
        enabled: false,
        custom_name: "",
        default_name: "Friends Birthdays",
      },
      anniversaries: {
        enabled: true,
        custom_name: "",
        default_name: "Friends Anniversaries",
      },
    },
    ...overrides,
  };
}

function renderControls({ item = createItem(), onSave } = {}) {
  const saveHandler = onSave ?? vi.fn().mockResolvedValue(undefined);

  render(
    <AddressBookMilestoneControls
      item={item}
      onSave={saveHandler}
      ChevronRightIcon={TestIcon}
      ResetIcon={TestIcon}
      PencilIcon={TestIcon}
      CheckIcon={TestIcon}
      TimesIcon={TestIcon}
    />,
  );

  return {
    user: userEvent.setup(),
    onSave: saveHandler,
  };
}

describe("AddressBookMilestoneControls", () => {
  it("saves birthday enabled toggle changes", async () => {
    const { user, onSave } = renderControls();

    await user.click(
      screen.getByRole("button", { name: "Expand milestone calendars" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Birthdays" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(42, {
        birthdays_enabled: true,
      }),
    );
  });

  it("saves renamed birthday calendar names", async () => {
    const { user, onSave } = renderControls();

    await user.click(
      screen.getByRole("button", { name: "Expand milestone calendars" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Rename Birthdays calendar" }),
    );
    await user.type(screen.getByPlaceholderText("Friends Birthdays"), "Family");
    await user.click(
      screen.getByRole("button", { name: "Save Birthdays calendar name" }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(42, {
        birthday_calendar_name: "Family",
      }),
    );
  });

  it("resets custom birthday calendar names to default", async () => {
    const item = createItem({
      milestone_calendars: {
        birthdays: {
          enabled: true,
          custom_name: "Legacy Birthdays",
          default_name: "Friends Birthdays",
        },
        anniversaries: {
          enabled: false,
          custom_name: "",
          default_name: "Friends Anniversaries",
        },
      },
    });
    const { user, onSave } = renderControls({ item });

    await user.click(
      screen.getByRole("button", { name: "Expand milestone calendars" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Reset Birthdays calendar name to default",
      }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(42, {
        birthday_calendar_name: null,
      }),
    );
  });
});
