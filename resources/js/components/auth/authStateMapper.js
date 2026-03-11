function createDefaultSponsorship() {
  return {
    enabled: false,
    links: [],
  };
}

export function createDefaultAuthState() {
  return {
    loading: true,
    user: null,
    registrationEnabled: false,
    registrationApprovalRequired: false,
    ownerShareManagementEnabled: false,
    davCompatibilityModeEnabled: false,
    contactManagementEnabled: false,
    contactChangeModerationEnabled: false,
    sponsorship: createDefaultSponsorship(),
  };
}

export function createSignedOutAuthState() {
  return {
    ...createDefaultAuthState(),
    loading: false,
  };
}

export function parseSponsorshipConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object") {
    return createDefaultSponsorship();
  }

  const links = Array.isArray(rawConfig.links)
    ? rawConfig.links
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          name: String(item.name ?? "").trim(),
          url: String(item.url ?? "").trim(),
        }))
        .filter(
          (item) => item.name !== "" && /^https?:\/\/\S+$/i.test(item.url),
        )
    : [];

  return {
    enabled: Boolean(rawConfig.enabled) && links.length > 0,
    links,
  };
}

export function buildAuthStateFromPayload(payload, { user = null } = {}) {
  const source = payload && typeof payload === "object" ? payload : {};

  return {
    loading: false,
    user,
    registrationEnabled: !!source.registration_enabled,
    registrationApprovalRequired: !!source.registration_approval_required,
    ownerShareManagementEnabled: !!source.owner_share_management_enabled,
    davCompatibilityModeEnabled: !!source.dav_compatibility_mode_enabled,
    contactManagementEnabled: !!source.contact_management_enabled,
    contactChangeModerationEnabled: !!source.contact_change_moderation_enabled,
    sponsorship: parseSponsorshipConfig(source.sponsorship),
  };
}
