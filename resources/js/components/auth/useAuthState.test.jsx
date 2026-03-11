import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import useAuthState from "./useAuthState";

describe("useAuthState", () => {
  it("loads auth state from /api/auth/me", async () => {
    const api = {
      get: vi.fn().mockResolvedValue({
        data: {
          user: { id: 12, name: "Admin" },
          registration_enabled: true,
          owner_share_management_enabled: true,
          dav_compatibility_mode_enabled: true,
          contact_management_enabled: true,
          contact_change_moderation_enabled: false,
          sponsorship: {
            enabled: true,
            links: [{ name: "GitHub", url: "https://example.com" }],
          },
        },
      }),
    };

    const { result } = renderHook(() => useAuthState({ api }));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/api/auth/me"),
    );
    await waitFor(() => expect(result.current.auth.loading).toBe(false));

    expect(result.current.auth).toEqual(
      expect.objectContaining({
        loading: false,
        user: { id: 12, name: "Admin" },
        registrationEnabled: true,
        ownerShareManagementEnabled: true,
        davCompatibilityModeEnabled: true,
        contactManagementEnabled: true,
        contactChangeModerationEnabled: false,
        sponsorship: {
          enabled: true,
          links: [{ name: "GitHub", url: "https://example.com" }],
        },
      }),
    );

    await act(async () => {
      await result.current.value.refreshAuth();
    });

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("falls back to /api/public/config when /api/auth/me fails", async () => {
    const api = {
      get: vi
        .fn()
        .mockRejectedValueOnce(new Error("unauthorized"))
        .mockResolvedValueOnce({
          data: {
            registration_enabled: true,
            owner_share_management_enabled: false,
            dav_compatibility_mode_enabled: true,
            contact_management_enabled: false,
            contact_change_moderation_enabled: true,
            sponsorship: { enabled: false, links: [] },
          },
        }),
    };

    const { result } = renderHook(() => useAuthState({ api }));

    await waitFor(() =>
      expect(api.get).toHaveBeenNthCalledWith(2, "/api/public/config"),
    );

    expect(result.current.auth).toEqual(
      expect.objectContaining({
        loading: false,
        user: null,
        registrationEnabled: true,
        ownerShareManagementEnabled: false,
        davCompatibilityModeEnabled: true,
        contactManagementEnabled: false,
        contactChangeModerationEnabled: true,
        sponsorship: {
          enabled: false,
          links: [],
        },
      }),
    );
  });

  it("returns default disabled state when both auth endpoints fail", async () => {
    const api = {
      get: vi.fn().mockRejectedValue(new Error("network")),
    };

    const { result } = renderHook(() => useAuthState({ api }));

    await waitFor(() => expect(result.current.auth.loading).toBe(false));

    expect(result.current.auth).toEqual(
      expect.objectContaining({
        loading: false,
        user: null,
        registrationEnabled: false,
        ownerShareManagementEnabled: false,
        davCompatibilityModeEnabled: false,
        contactManagementEnabled: false,
        contactChangeModerationEnabled: false,
        sponsorship: {
          enabled: false,
          links: [],
        },
      }),
    );
  });
});
