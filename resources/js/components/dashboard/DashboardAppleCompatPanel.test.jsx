import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardAppleCompatPanel from "./DashboardAppleCompatPanel";

function AppleCompatHarness({
  appleCompat,
  initialForm,
  onSaveAppleCompat,
  canSelectAppleCompatSources,
}) {
  const [appleCompatForm, setAppleCompatForm] = useState(initialForm);

  return (
    <>
      <DashboardAppleCompatPanel
        appleCompat={appleCompat}
        appleCompatForm={appleCompatForm}
        setAppleCompatForm={setAppleCompatForm}
        canSelectAppleCompatSources={canSelectAppleCompatSources}
        onSaveAppleCompat={onSaveAppleCompat}
      />
      <pre data-testid="apple-form-state">{JSON.stringify(appleCompatForm)}</pre>
    </>
  );
}

function formState() {
  return JSON.parse(screen.getByTestId("apple-form-state").textContent ?? "{}");
}

describe("DashboardAppleCompatPanel", () => {
  it("shows missing-target warning and disables save controls", () => {
    render(
      <AppleCompatHarness
        appleCompat={{
          target_address_book_id: null,
          target_display_name: "Contacts",
          target_address_book_uri: "contacts",
          source_options: [],
        }}
        initialForm={{ enabled: false, source_ids: [] }}
        canSelectAppleCompatSources={false}
        onSaveAppleCompat={vi.fn((event) => event.preventDefault())}
      />,
    );

    expect(
      screen.getByText("No default Contacts address book found for your account."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Enable Apple compatibility mirroring" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save Apple Compatibility Settings" }),
    ).toBeDisabled();
  });

  it("updates enabled and source_ids state when selecting sources", async () => {
    const user = userEvent.setup();

    render(
      <AppleCompatHarness
        appleCompat={{
          target_address_book_id: 12,
          target_display_name: "Contacts",
          target_address_book_uri: "contacts",
          source_options: [
            {
              id: 4,
              display_name: "Family",
              scope: "owned",
              owner_name: "Admin",
              owner_email: "admin@example.com",
            },
            {
              id: 8,
              display_name: "Vendors",
              scope: "shared",
              owner_name: "Pat",
              owner_email: "pat@example.com",
            },
          ],
        }}
        initialForm={{ enabled: false, source_ids: [] }}
        canSelectAppleCompatSources={true}
        onSaveAppleCompat={vi.fn((event) => event.preventDefault())}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Enable Apple compatibility mirroring" }),
    );
    expect(formState()).toEqual({ enabled: true, source_ids: [] });

    await user.click(screen.getByRole("checkbox", { name: /Family/i }));
    expect(formState()).toEqual({ enabled: true, source_ids: [4] });

    await user.click(screen.getByRole("checkbox", { name: /Vendors/i }));
    expect(formState()).toEqual({ enabled: true, source_ids: [4, 8] });

    await user.click(screen.getByRole("checkbox", { name: /Family/i }));
    expect(formState()).toEqual({ enabled: true, source_ids: [8] });
  });

  it("submits save form", async () => {
    const user = userEvent.setup();
    const onSaveAppleCompat = vi.fn((event) => event.preventDefault());

    render(
      <AppleCompatHarness
        appleCompat={{
          target_address_book_id: 12,
          target_display_name: "Contacts",
          target_address_book_uri: "contacts",
          source_options: [],
        }}
        initialForm={{ enabled: true, source_ids: [4] }}
        canSelectAppleCompatSources={true}
        onSaveAppleCompat={onSaveAppleCompat}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Save Apple Compatibility Settings" }),
    );
    expect(onSaveAppleCompat).toHaveBeenCalledTimes(1);
  });
});
