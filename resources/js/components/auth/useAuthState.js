import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildAuthStateFromPayload,
  createDefaultAuthState,
  createSignedOutAuthState,
} from "./authStateMapper";

/**
 * Hydrates and exposes authentication state from authenticated and public APIs.
 *
 * @param {{api: {get: (url: string) => Promise<{data: any}>}}} deps
 * @returns {{
 *   auth: ReturnType<typeof createDefaultAuthState>,
 *   value: ReturnType<typeof createDefaultAuthState> & {
 *     setAuth: Function,
 *     refreshAuth: () => Promise<void>
 *   },
 *   setAuth: Function,
 *   refreshAuth: () => Promise<void>
 * }}
 */
export default function useAuthState({ api }) {
  const [auth, setAuth] = useState(createDefaultAuthState);

  const refreshAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/api/auth/me");
      setAuth(buildAuthStateFromPayload(data, { user: data.user }));
      return;
    } catch {
      // Fall through to public configuration fetch.
    }

    try {
      const { data } = await api.get("/api/public/config");
      setAuth(buildAuthStateFromPayload(data));
    } catch {
      setAuth(createSignedOutAuthState());
    }
  }, [api]);

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
