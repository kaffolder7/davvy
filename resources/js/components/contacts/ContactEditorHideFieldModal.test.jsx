import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditorHideFieldModal from "./ContactEditorHideFieldModal";

describe("ContactEditorHideFieldModal", () => {
  it("does not render when there is no pending field", () => {
    render(
      <ContactEditorHideFieldModal
        pendingHideFieldId={null}
        pendingHideFieldLabel="Nickname"
        onCancel={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.queryByText("Hide Nickname?")).not.toBeInTheDocument();
  });

  it("invokes cancel and resolve callbacks from modal actions", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onResolve = vi.fn();

    render(
      <ContactEditorHideFieldModal
        pendingHideFieldId="nickname"
        pendingHideFieldLabel="Nickname"
        onCancel={onCancel}
        onResolve={onResolve}
      />,
    );

    expect(screen.getByText("Hide Nickname?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep Hidden Value" }));
    await user.click(screen.getByRole("button", { name: "Clear and Hide" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenNthCalledWith(1, false);
    expect(onResolve).toHaveBeenNthCalledWith(2, true);
  });
});
