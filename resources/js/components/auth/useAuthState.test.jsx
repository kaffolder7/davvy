import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import useAuthState from "./useAuthState";

describe("useAuthState", () => {
  it("loads auth state from /api/auth/me", async () => {
    const sponsorship = { enabled: true, links: [{ name: "GitHub" }] };
    const parseSponsorshipConfig = vi.fn().mockReturnValue(sponsorship);
    const api = {
      get: vi.fn().mockResolvedValue({
        data: {
          user: { id: 12, name: "Admin" },
          registration_enabled: true,
          owner_share_management_enabled: true,
          dav_compatibility_mode_enabled: true,
          contact_management_enabled: true,
          contact_change_moderation_enabled: false,
          sponsorship: { enabled: true, links: [{ name: "GitHub" }] },
        },
      }),
    };

    const { result } = renderHook(() =>
      useAuthState({ api, parseSponsorshipConfig }),
    );

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/api/auth/me"),
    );

    expect(parseSponsorshipConfig).toHaveBeenCalledTimes(1);
    expect(result.current.auth).toEqual(
      expect.objectContaining({
        loading: false,
        user: { id: 12, name: "Admin" },
        registrationEnabled: true,
        ownerShareManagementEnabled: true,
        davCompatibilityModeEnabled: true,
        contactManagementEnabled: true,
        contactChangeModerationEnabled: false,
        sponsorship,
      }),
    );

    await act(async () => {
      await result.current.value.refreshAuth();
    });

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("falls back to /api/public/config when /api/auth/me fails", async () => {
    const sponsorship = { enabled: false, links: [] };
    const parseSponsorshipConfig = vi.fn().mockReturnValue(sponsorship);
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

    const { result } = renderHook(() =>
      useAuthState({ api, parseSponsorshipConfig }),
    );

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
        sponsorship,
      }),
    );
  });

  it("returns default disabled state when both auth endpoints fail", async () => {
    const parseSponsorshipConfig = vi.fn();
    const api = {
      get: vi.fn().mockRejectedValue(new Error("network")),
    };

    const { result } = renderHook(() =>
      useAuthState({ api, parseSponsorshipConfig }),
    );

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
    expect(parseSponsorshipConfig).not.toHaveBeenCalled();
  });
});
