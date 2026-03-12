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
    emailVerificationRequired: false,
    ownerShareManagementEnabled: false,
    davCompatibilityModeEnabled: false,
    contactManagementEnabled: false,
    contactChangeModerationEnabled: false,
    twoFactorEnforcementEnabled: false,
    twoFactorGracePeriodDays: 14,
    twoFactorEnabled: false,
    twoFactorSetupRequired: false,
    twoFactorMandated: false,
    twoFactorGraceExpiresAt: null,
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
    emailVerificationRequired: !!source.email_verification_required,
    ownerShareManagementEnabled: !!source.owner_share_management_enabled,
    davCompatibilityModeEnabled: !!source.dav_compatibility_mode_enabled,
    contactManagementEnabled: !!source.contact_management_enabled,
    contactChangeModerationEnabled: !!source.contact_change_moderation_enabled,
    twoFactorEnforcementEnabled: !!source.two_factor_enforcement_enabled,
    twoFactorGracePeriodDays: Number(source.two_factor_grace_period_days || 14),
    twoFactorEnabled: !!source.two_factor_enabled,
    twoFactorSetupRequired: !!source.two_factor_setup_required,
    twoFactorMandated: !!source.two_factor_mandated,
    twoFactorGraceExpiresAt: source.two_factor_grace_expires_at || null,
    sponsorship: parseSponsorshipConfig(source.sponsorship),
  };
}
