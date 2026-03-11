import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_AUTH_STATE = {
  loading: true,
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
};

function buildAuthState(payload, parseSponsorshipConfig, user = null) {
  return {
    loading: false,
    user,
    registrationEnabled: !!payload.registration_enabled,
    ownerShareManagementEnabled: !!payload.owner_share_management_enabled,
    davCompatibilityModeEnabled: !!payload.dav_compatibility_mode_enabled,
    contactManagementEnabled: !!payload.contact_management_enabled,
    contactChangeModerationEnabled: !!payload.contact_change_moderation_enabled,
    sponsorship: parseSponsorshipConfig(payload.sponsorship),
  };
}

export default function useAuthState({ api, parseSponsorshipConfig }) {
  const [auth, setAuth] = useState(DEFAULT_AUTH_STATE);

  const refreshAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/api/auth/me");
      setAuth(buildAuthState(data, parseSponsorshipConfig, data.user));
      return;
    } catch {
      // Fall through to public configuration fetch.
    }

    try {
      const { data } = await api.get("/api/public/config");
      setAuth(buildAuthState(data, parseSponsorshipConfig));
    } catch {
      setAuth((prev) => ({
        ...prev,
        ...DEFAULT_AUTH_STATE,
        loading: false,
      }));
    }
  }, [api, parseSponsorshipConfig]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const value = useMemo(
    () => ({
      ...auth,
      setAuth,
      refreshAuth,
    }),
    [auth, refreshAuth],
  );

  return {
    auth,
    value,
    setAuth,
    refreshAuth,
  };
}
