import React, { useEffect, useMemo, useRef, useState } from "react";

export default function AdminPage({
  auth,
  theme,
  api,
  extractError,
  AppShell,
  InfoCard,
  AdminFeatureToggle,
  FullPageState,
  Field,
  PermissionBadge,
  CheckIcon,
  buildTimezoneGroups,
  parseBackupScheduleTimes,
  isRecommendedBackupRetention,
  areBackupConfigSnapshotsEqual,
  formatAdminTimestamp,
  MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS,
  BACKUP_RUN_TOAST_AUTO_HIDE_MS,
  BACKUP_DRAWER_ANIMATION_MS,
  WEEKDAY_OPTIONS,
  MONTH_OPTIONS,
  RECOMMENDED_BACKUP_RETENTION,
}) {
  const [state, setState] = useState({
    loading: true,
    users: [],
    shares: [],
    resources: { calendars: [], address_books: [] },
    error: "",
    registrationEnabled: auth.registrationEnabled,
    registrationApprovalRequired: auth.registrationApprovalRequired,
    ownerShareManagementEnabled: auth.ownerShareManagementEnabled,
    davCompatibilityModeEnabled: auth.davCompatibilityModeEnabled,
    contactManagementEnabled: auth.contactManagementEnabled,
    contactChangeModerationEnabled: auth.contactChangeModerationEnabled,
    contactChangeRetentionDays: 90,
    milestoneGenerationYears: 3,
    milestonePurgeVisible: false,
    milestonePurgeAvailable: false,
    backupEnabled: false,
    backupLocalEnabled: true,
    backupLocalPath: "",
    backupS3Enabled: false,
    backupS3Disk: "s3",
    backupS3Prefix: "davvy-backups",
    backupTimezone: "UTC",
    backupScheduleTimes: "02:30",
    backupWeeklyDay: 0,
    backupMonthlyDay: 1,
    backupYearlyMonth: 1,
    backupYearlyDay: 1,
    backupRetentionDaily: 7,
    backupRetentionWeekly: 4,
    backupRetentionMonthly: 12,
    backupRetentionYearly: 3,
    backupLastRunAt: null,
    backupLastRunStatus: null,
    backupLastRunMessage: "",
  });
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "regular",
  });
  const [shareForm, setShareForm] = useState({
    resource_type: "calendar",
    resource_id: "",
    shared_with_id: "",
    permission: "read_only",
  });
  const [milestonePurgeSubmitting, setMilestonePurgeSubmitting] =
    useState(false);
  const [milestonePurgeSummary, setMilestonePurgeSummary] = useState("");
  const [retentionSubmitting, setRetentionSubmitting] = useState(false);
  const [milestoneGenerationSubmitting, setMilestoneGenerationSubmitting] =
    useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupRestoring, setBackupRestoring] = useState(false);
  const [backupRestoreMode, setBackupRestoreMode] = useState("merge");
  const [backupRestoreDryRun, setBackupRestoreDryRun] = useState(false);
  const [backupRestoreFile, setBackupRestoreFile] = useState(null);
  const [backupRestoreResult, setBackupRestoreResult] = useState(null);
  const [backupRestoreOpen, setBackupRestoreOpen] = useState(false);
  const [backupRestoreRendered, setBackupRestoreRendered] = useState(false);
  const [backupRunToast, setBackupRunToast] = useState(null);
  const [backupConfigOpen, setBackupConfigOpen] = useState(false);
  const [backupConfigRendered, setBackupConfigRendered] = useState(false);
  const [backupAdvancedOpen, setBackupAdvancedOpen] = useState(false);
  const [backupRetentionPreset, setBackupRetentionPreset] =
    useState("recommended");
  const backupConfigOpenFrameRef = useRef(null);
  const backupRestoreOpenFrameRef = useRef(null);
  const backupConfigSnapshotRef = useRef(null);

  const captureBackupConfigSnapshot = () => ({
    backupEnabled: state.backupEnabled,
    backupLocalEnabled: state.backupLocalEnabled,
    backupLocalPath: state.backupLocalPath,
    backupS3Enabled: state.backupS3Enabled,
    backupS3Disk: state.backupS3Disk,
    backupS3Prefix: state.backupS3Prefix,
    backupTimezone: state.backupTimezone,
    backupScheduleTimes: state.backupScheduleTimes,
    backupWeeklyDay: state.backupWeeklyDay,
    backupMonthlyDay: state.backupMonthlyDay,
    backupYearlyMonth: state.backupYearlyMonth,
    backupYearlyDay: state.backupYearlyDay,
    backupRetentionDaily: state.backupRetentionDaily,
    backupRetentionWeekly: state.backupRetentionWeekly,
    backupRetentionMonthly: state.backupRetentionMonthly,
    backupRetentionYearly: state.backupRetentionYearly,
    backupRetentionPreset,
  });

  const restoreBackupConfigSnapshot = (snapshot) => {
    if (!snapshot) {
      return;
    }

    const { backupRetentionPreset: nextRetentionPreset, ...snapshotState } =
      snapshot;

    setBackupRetentionPreset(nextRetentionPreset);
    setState((prev) => ({
      ...prev,
      ...snapshotState,
    }));
  };

  const closeBackupConfigDrawer = ({ discardChanges = true } = {}) => {
    if (backupConfigOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(backupConfigOpenFrameRef.current);
      backupConfigOpenFrameRef.current = null;
    }

    if (discardChanges) {
      restoreBackupConfigSnapshot(backupConfigSnapshotRef.current);
    }

    backupConfigSnapshotRef.current = null;
    setBackupAdvancedOpen(false);
    setBackupConfigOpen(false);
  };

  const resetBackupRestoreForm = () => {
    setBackupRestoreMode("merge");
    setBackupRestoreDryRun(false);
    setBackupRestoreFile(null);
    setBackupRestoreResult(null);
  };

  const closeBackupRestoreDrawer = () => {
    if (backupRestoreOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(backupRestoreOpenFrameRef.current);
      backupRestoreOpenFrameRef.current = null;
    }

    setBackupRestoreOpen(false);
  };

  const openBackupConfigDrawer = () => {
    if (backupConfigOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(backupConfigOpenFrameRef.current);
      backupConfigOpenFrameRef.current = null;
    }

    backupConfigSnapshotRef.current = captureBackupConfigSnapshot();
    setBackupAdvancedOpen(false);
    setBackupConfigRendered(true);
    setBackupConfigOpen(false);

    backupConfigOpenFrameRef.current = window.requestAnimationFrame(() => {
      backupConfigOpenFrameRef.current = null;
      setBackupConfigOpen(true);
    });
  };

  const openBackupRestoreDrawer = () => {
    if (backupRestoreOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(backupRestoreOpenFrameRef.current);
      backupRestoreOpenFrameRef.current = null;
    }

    resetBackupRestoreForm();
    setBackupRestoreRendered(true);
    setBackupRestoreOpen(false);

    backupRestoreOpenFrameRef.current = window.requestAnimationFrame(() => {
      backupRestoreOpenFrameRef.current = null;
      setBackupRestoreOpen(true);
    });
  };

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const [
        users,
        resources,
        shares,
        retention,
        milestoneGeneration,
        backupSettings,
      ] = await Promise.all([
        api.get("/api/admin/users"),
        api.get("/api/admin/resources"),
        api.get("/api/admin/shares"),
        api.get("/api/admin/settings/contact-change-retention"),
        api.get("/api/admin/settings/milestone-generation-years"),
        api.get("/api/admin/settings/backups"),
      ]);

      const backup = backupSettings.data ?? {};
      const lastRun = backup.last_run ?? {};
      const backupRetentionDaily = Number(backup.retention_daily ?? 7);
      const backupRetentionWeekly = Number(backup.retention_weekly ?? 4);
      const backupRetentionMonthly = Number(backup.retention_monthly ?? 12);
      const backupRetentionYearly = Number(backup.retention_yearly ?? 3);

      setBackupRetentionPreset(
        isRecommendedBackupRetention({
          daily: backupRetentionDaily,
          weekly: backupRetentionWeekly,
          monthly: backupRetentionMonthly,
          yearly: backupRetentionYearly,
        })
          ? "recommended"
          : "custom",
      );

      setState((prev) => ({
        ...prev,
        loading: false,
        users: users.data.data,
        resources: resources.data,
        shares: shares.data.data,
        contactChangeRetentionDays: Number(retention.data?.days || 90),
        milestoneGenerationYears: Number(milestoneGeneration.data?.years || 3),
        milestonePurgeVisible: !!resources.data?.milestone_purge_visible,
        milestonePurgeAvailable: !!resources.data?.milestone_purge_available,
        backupEnabled: !!backup.enabled,
        backupLocalEnabled: !!backup.local_enabled,
        backupLocalPath: backup.local_path || "",
        backupS3Enabled: !!backup.s3_enabled,
        backupS3Disk: backup.s3_disk || "s3",
        backupS3Prefix: backup.s3_prefix || "",
        backupTimezone: backup.timezone || "UTC",
        backupScheduleTimes: Array.isArray(backup.schedule_times)
          ? backup.schedule_times.join(", ")
          : "02:30",
        backupWeeklyDay: Number(backup.weekly_day ?? 0),
        backupMonthlyDay: Number(backup.monthly_day ?? 1),
        backupYearlyMonth: Number(backup.yearly_month ?? 1),
        backupYearlyDay: Number(backup.yearly_day ?? 1),
        backupRetentionDaily,
        backupRetentionWeekly,
        backupRetentionMonthly,
        backupRetentionYearly,
        backupLastRunAt: lastRun.at || null,
        backupLastRunStatus: lastRun.status || null,
        backupLastRunMessage: lastRun.message || "",
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: extractError(err, "Unable to load admin data."),
      }));
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!milestonePurgeSummary) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => setMilestonePurgeSummary(""),
      MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [milestonePurgeSummary]);

  useEffect(() => {
    if (!backupRunToast) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => setBackupRunToast(null),
      BACKUP_RUN_TOAST_AUTO_HIDE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [backupRunToast]);

  useEffect(() => {
    if (backupConfigOpen) {
      setBackupConfigRendered(true);
      return undefined;
    }

    const timer = window.setTimeout(
      () => setBackupConfigRendered(false),
      BACKUP_DRAWER_ANIMATION_MS,
    );

    return () => window.clearTimeout(timer);
  }, [backupConfigOpen]);

  useEffect(() => {
    if (backupRestoreOpen) {
      setBackupRestoreRendered(true);
      return undefined;
    }

    const timer = window.setTimeout(
      () => setBackupRestoreRendered(false),
      BACKUP_DRAWER_ANIMATION_MS,
    );

    return () => window.clearTimeout(timer);
  }, [backupRestoreOpen]);

  useEffect(
    () => () => {
      if (backupConfigOpenFrameRef.current !== null) {
        window.cancelAnimationFrame(backupConfigOpenFrameRef.current);
      }
      if (backupRestoreOpenFrameRef.current !== null) {
        window.cancelAnimationFrame(backupRestoreOpenFrameRef.current);
      }

      backupConfigSnapshotRef.current = null;
    },
    [],
  );

  const createUser = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/admin/users", userForm);
      setUserForm({ name: "", email: "", password: "", role: "regular" });
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to create user."),
      }));
    }
  };

  const approveUser = async (userId) => {
    try {
      await api.patch(`/api/admin/users/${userId}/approve`);
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to approve user."),
      }));
    }
  };

  const saveShare = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/admin/shares", {
        ...shareForm,
        resource_id: Number(shareForm.resource_id),
        shared_with_id: Number(shareForm.shared_with_id),
      });
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to save share."),
      }));
    }
  };

  const deleteShare = async (id) => {
    try {
      await api.delete(`/api/admin/shares/${id}`);
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to remove share."),
      }));
    }
  };

  const toggleRegistration = async () => {
    const next = !state.registrationEnabled;

    try {
      const response = await api.patch("/api/admin/settings/registration", {
        enabled: next,
      });
      setState((prev) => ({
        ...prev,
        registrationEnabled: !!response.data.enabled,
        registrationApprovalRequired: !!response.data.require_approval,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        registrationEnabled: !!response.data.enabled,
        registrationApprovalRequired: !!response.data.require_approval,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to update registration setting."),
      }));
    }
  };

  const toggleRegistrationApproval = async () => {
    const next = !state.registrationApprovalRequired;
    let approvePending = false;

    if (!next) {
      const pendingCount = state.users.filter(
        (user) => user?.is_approved === false,
      ).length;

      if (pendingCount > 0) {
        approvePending = window.confirm(
          `Disable registration approval requirement?\n\n${pendingCount} account(s) are pending approval.\n\nClick OK to approve all pending accounts now, or Cancel to leave them pending.`,
        );
      }
    }

    try {
      const response = await api.patch(
        "/api/admin/settings/registration-approval",
        {
          enabled: next,
        },
      );
      setState((prev) => ({
        ...prev,
        registrationApprovalRequired: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        registrationApprovalRequired: !!response.data.enabled,
      }));

      if (!next && approvePending) {
        const bulkApproval = await api.patch("/api/admin/users/approve-pending");
        const approvedCount = Number(bulkApproval.data?.approved_count ?? 0);
        setBackupRunToast({
          status: "success",
          message: `Approved ${approvedCount} pending account(s).`,
        });
        await load();
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update registration approval setting.",
        ),
      }));
    }
  };

  const toggleOwnerShareManagement = async () => {
    const next = !state.ownerShareManagementEnabled;

    try {
      const response = await api.patch(
        "/api/admin/settings/owner-share-management",
        { enabled: next },
      );
      setState((prev) => ({
        ...prev,
        ownerShareManagementEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        ownerShareManagementEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update owner share management setting.",
        ),
      }));
    }
  };

  const toggleDavCompatibilityMode = async () => {
    const next = !state.davCompatibilityModeEnabled;

    try {
      const response = await api.patch(
        "/api/admin/settings/dav-compatibility-mode",
        { enabled: next },
      );
      setState((prev) => ({
        ...prev,
        davCompatibilityModeEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        davCompatibilityModeEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update DAV compatibility mode setting.",
        ),
      }));
    }
  };

  const toggleContactManagement = async () => {
    const next = !state.contactManagementEnabled;

    try {
      const response = await api.patch(
        "/api/admin/settings/contact-management",
        {
          enabled: next,
        },
      );
      setState((prev) => ({
        ...prev,
        contactManagementEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        contactManagementEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update contact management setting.",
        ),
      }));
    }
  };

  const toggleContactChangeModeration = async () => {
    const next = !state.contactChangeModerationEnabled;

    try {
      const response = await api.patch(
        "/api/admin/settings/contact-change-moderation",
        {
          enabled: next,
        },
      );
      setState((prev) => ({
        ...prev,
        contactChangeModerationEnabled: !!response.data.enabled,
      }));
      auth.setAuth((prev) => ({
        ...prev,
        contactChangeModerationEnabled: !!response.data.enabled,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update contact change moderation setting.",
        ),
      }));
    }
  };

  const purgeGeneratedMilestoneCalendars = async () => {
    if (milestonePurgeSubmitting || !state.milestonePurgeAvailable) {
      return;
    }

    const confirmed = window.confirm(
      "This will delete all generated Birthday/Anniversary calendars and disable milestone sync across address books. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setMilestonePurgeSubmitting(true);
    setMilestonePurgeSummary("");
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.post(
        "/api/admin/contact-milestones/purge-generated-calendars",
      );
      const purgedCalendars = Number(response.data?.purged_calendar_count ?? 0);
      const purgedEvents = Number(response.data?.purged_event_count ?? 0);
      const disabledSettings = Number(
        response.data?.disabled_setting_count ?? 0,
      );
      setMilestonePurgeSummary(
        `Purged ${purgedCalendars} generated calendar(s), removed ${purgedEvents} event(s), and disabled ${disabledSettings} setting(s).`,
      );
      await load();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to purge generated milestone calendars.",
        ),
      }));
    } finally {
      setMilestonePurgeSubmitting(false);
    }
  };

  const saveContactChangeRetention = async () => {
    const days = Number(state.contactChangeRetentionDays);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      setState((prev) => ({
        ...prev,
        error: "Retention days must be between 1 and 3650.",
      }));
      return;
    }

    setRetentionSubmitting(true);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.patch(
        "/api/admin/settings/contact-change-retention",
        {
          days,
        },
      );

      setState((prev) => ({
        ...prev,
        contactChangeRetentionDays: Number(response.data?.days || days),
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to update retention setting."),
      }));
    } finally {
      setRetentionSubmitting(false);
    }
  };

  const saveMilestoneGenerationYears = async () => {
    const years = Number(state.milestoneGenerationYears);
    if (!Number.isInteger(years) || years < 1 || years > 25) {
      setState((prev) => ({
        ...prev,
        error: "Milestone generation years must be between 1 and 25.",
      }));
      return;
    }

    setMilestoneGenerationSubmitting(true);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.patch(
        "/api/admin/settings/milestone-generation-years",
        {
          years,
        },
      );

      setState((prev) => ({
        ...prev,
        milestoneGenerationYears: Number(response.data?.years || years),
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(
          err,
          "Unable to update milestone generation years.",
        ),
      }));
    } finally {
      setMilestoneGenerationSubmitting(false);
    }
  };

  const saveBackupSettings = async () => {
    const scheduleTimes = parseBackupScheduleTimes(state.backupScheduleTimes);
    const retentionDaily =
      backupRetentionPreset === "recommended"
        ? RECOMMENDED_BACKUP_RETENTION.daily
        : Number(state.backupRetentionDaily);
    const retentionWeekly =
      backupRetentionPreset === "recommended"
        ? RECOMMENDED_BACKUP_RETENTION.weekly
        : Number(state.backupRetentionWeekly);
    const retentionMonthly =
      backupRetentionPreset === "recommended"
        ? RECOMMENDED_BACKUP_RETENTION.monthly
        : Number(state.backupRetentionMonthly);
    const retentionYearly =
      backupRetentionPreset === "recommended"
        ? RECOMMENDED_BACKUP_RETENTION.yearly
        : Number(state.backupRetentionYearly);
    if (scheduleTimes.length === 0) {
      setState((prev) => ({
        ...prev,
        error: "Backup schedule must include one or more HH:MM values.",
      }));
      return;
    }

    if (
      state.backupEnabled &&
      !state.backupLocalEnabled &&
      !state.backupS3Enabled
    ) {
      setState((prev) => ({
        ...prev,
        error:
          "Enable at least one destination (local or S3) when backups are enabled.",
      }));
      return;
    }

    setBackupSaving(true);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.patch("/api/admin/settings/backups", {
        enabled: !!state.backupEnabled,
        local_enabled: !!state.backupLocalEnabled,
        local_path: state.backupLocalPath,
        s3_enabled: !!state.backupS3Enabled,
        s3_disk: state.backupS3Disk,
        s3_prefix: state.backupS3Prefix,
        schedule_times: scheduleTimes,
        timezone: state.backupTimezone,
        weekly_day: Number(state.backupWeeklyDay),
        monthly_day: Number(state.backupMonthlyDay),
        yearly_month: Number(state.backupYearlyMonth),
        yearly_day: Number(state.backupYearlyDay),
        retention_daily: retentionDaily,
        retention_weekly: retentionWeekly,
        retention_monthly: retentionMonthly,
        retention_yearly: retentionYearly,
      });

      const backup = response.data ?? {};
      const lastRun = backup.last_run ?? {};
      const nextRetentionDaily = Number(
        backup.retention_daily ?? retentionDaily,
      );
      const nextRetentionWeekly = Number(
        backup.retention_weekly ?? retentionWeekly,
      );
      const nextRetentionMonthly = Number(
        backup.retention_monthly ?? retentionMonthly,
      );
      const nextRetentionYearly = Number(
        backup.retention_yearly ?? retentionYearly,
      );

      setBackupRetentionPreset(
        isRecommendedBackupRetention({
          daily: nextRetentionDaily,
          weekly: nextRetentionWeekly,
          monthly: nextRetentionMonthly,
          yearly: nextRetentionYearly,
        })
          ? "recommended"
          : "custom",
      );

      setState((prev) => ({
        ...prev,
        backupEnabled: !!backup.enabled,
        backupLocalEnabled: !!backup.local_enabled,
        backupLocalPath: backup.local_path || "",
        backupS3Enabled: !!backup.s3_enabled,
        backupS3Disk: backup.s3_disk || "s3",
        backupS3Prefix: backup.s3_prefix || "",
        backupTimezone: backup.timezone || "UTC",
        backupScheduleTimes: Array.isArray(backup.schedule_times)
          ? backup.schedule_times.join(", ")
          : prev.backupScheduleTimes,
        backupWeeklyDay: Number(backup.weekly_day ?? 0),
        backupMonthlyDay: Number(backup.monthly_day ?? 1),
        backupYearlyMonth: Number(backup.yearly_month ?? 1),
        backupYearlyDay: Number(backup.yearly_day ?? 1),
        backupRetentionDaily: nextRetentionDaily,
        backupRetentionWeekly: nextRetentionWeekly,
        backupRetentionMonthly: nextRetentionMonthly,
        backupRetentionYearly: nextRetentionYearly,
        backupLastRunAt: lastRun.at || prev.backupLastRunAt,
        backupLastRunStatus: lastRun.status || prev.backupLastRunStatus,
        backupLastRunMessage: lastRun.message || prev.backupLastRunMessage,
      }));
      closeBackupConfigDrawer({ discardChanges: false });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: extractError(err, "Unable to save backup settings."),
      }));
    } finally {
      setBackupSaving(false);
    }
  };

  const runBackupNow = async () => {
    if (backupRunning) {
      return;
    }

    if (!state.backupLocalEnabled && !state.backupS3Enabled) {
      setState((prev) => ({
        ...prev,
        error:
          "Configure at least one destination (local or S3) before running a backup.",
      }));
      return;
    }

    setBackupRunning(true);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const response = await api.post("/api/admin/backups/run");
      const result = response.data ?? {};
      const nextStatus = result.status || "success";
      const nextMessage = result.reason || "Backup completed successfully.";

      setState((prev) => ({
        ...prev,
        backupLastRunAt: result.executed_at_utc || prev.backupLastRunAt,
        backupLastRunStatus: nextStatus,
        backupLastRunMessage: nextMessage,
      }));
      setBackupRunToast({
        status: nextStatus,
        message: nextMessage,
      });

      await load();
    } catch (err) {
      const message = extractError(err, "Unable to run backup now.");
      setState((prev) => ({
        ...prev,
        error: message,
        backupLastRunStatus: "failed",
        backupLastRunMessage: message,
      }));
      setBackupRunToast({
        status: "failed",
        message,
      });
    } finally {
      setBackupRunning(false);
    }
  };

  const runBackupRestore = async () => {
    if (backupRestoring) {
      return;
    }

    if (!backupRestoreFile) {
      setState((prev) => ({
        ...prev,
        error: "Select a backup ZIP archive before running restore.",
      }));
      return;
    }

    const confirmMessage = backupRestoreDryRun
      ? "Run backup restore dry-run? No data will be modified."
      : backupRestoreMode === "replace"
        ? "Replace mode will delete existing calendars/address books for owners included in the archive before restoring. Continue?"
        : "Run backup restore in merge mode?";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setBackupRestoring(true);
    setBackupRestoreResult(null);
    setState((prev) => ({ ...prev, error: "" }));

    try {
      const form = new FormData();
      form.append("backup", backupRestoreFile);
      form.append("mode", backupRestoreMode);
      form.append("dry_run", backupRestoreDryRun ? "1" : "0");

      const response = await api.post("/api/admin/backups/restore", form, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      const result = response.data ?? {};

      setBackupRestoreResult(result);
      setBackupRunToast({
        status: result.status || "success",
        message: result.reason || "Backup restore completed.",
      });

      if (!backupRestoreDryRun) {
        await load();
      }
    } catch (err) {
      const message = extractError(err, "Unable to restore backup archive.");
      setState((prev) => ({
        ...prev,
        error: message,
      }));
      setBackupRunToast({
        status: "failed",
        message,
      });
    } finally {
      setBackupRestoring(false);
    }
  };

  const resourceOptions =
    shareForm.resource_type === "calendar"
      ? state.resources.calendars
      : state.resources.address_books;
  const backupTimezoneGroups = useMemo(() => buildTimezoneGroups(), []);
  const backupTimezoneExistsInOptions = useMemo(
    () =>
      backupTimezoneGroups.some((group) =>
        group.options.some((option) => option.value === state.backupTimezone),
      ),
    [backupTimezoneGroups, state.backupTimezone],
  );
  const backupLastRunLabel = state.backupLastRunStatus
    ? `${state.backupLastRunStatus.toUpperCase()} at ${formatAdminTimestamp(
        state.backupLastRunAt,
      )}`
    : "No backup has run yet.";
  const backupDestinationSummary = [
    state.backupLocalEnabled ? "Local" : null,
    state.backupS3Enabled ? `S3 (${state.backupS3Disk})` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const backupHasDestination = !!backupDestinationSummary;
  const backupScheduleValues = parseBackupScheduleTimes(
    state.backupScheduleTimes,
  );
  const backupScheduleSummary =
    backupScheduleValues.length === 0
      ? `No windows (${state.backupTimezone})`
      : backupScheduleValues.length <= 2
        ? `${backupScheduleValues.join(", ")} (${state.backupTimezone})`
        : `${backupScheduleValues.length} windows (${state.backupTimezone})`;
  const backupRetentionSummary = `${Number(state.backupRetentionDaily)}d / ${Number(
    state.backupRetentionWeekly,
  )}w / ${Number(state.backupRetentionMonthly)}m / ${Number(
    state.backupRetentionYearly,
  )}y`;
  const backupRunNowDisabled = backupRunning || !backupHasDestination;
  const backupRunNowButtonClass = backupRunNowDisabled
    ? "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-400"
    : "btn btn-outline-sm";
  const backupRestoreSummary = backupRestoreResult?.summary ?? null;
  const backupRestoreWarnings = Array.isArray(backupRestoreResult?.warnings)
    ? backupRestoreResult.warnings
    : [];
  const backupRestoreRunDisabled = backupRestoring || !backupRestoreFile;
  const backupRestoreRunButtonClass = backupRestoreRunDisabled
    ? "btn-outline btn-outline-sm"
    : "btn btn-outline-sm";
  const backupRunToastStatus = String(
    backupRunToast?.status || "",
  ).toLowerCase();
  const backupRunToastToneClass =
    backupRunToastStatus === "failed"
      ? "text-app-danger"
      : backupRunToastStatus === "success"
        ? "text-app-accent"
        : "text-app-faint";
  const backupConfigHasUnsavedChanges =
    !!backupConfigSnapshotRef.current &&
    !areBackupConfigSnapshotsEqual(
      captureBackupConfigSnapshot(),
      backupConfigSnapshotRef.current,
    );
  const backupSaveButtonClass = backupConfigHasUnsavedChanges
    ? "btn btn-outline-sm"
    : "btn-outline btn-outline-sm";

  return (
    <AppShell auth={auth} theme={theme}>
      <div className="surface fade-up rounded-3xl p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Admin Control Center</h2>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <AdminFeatureToggle
            label="Public registration"
            enabled={state.registrationEnabled}
            onClick={toggleRegistration}
          />
          <AdminFeatureToggle
            label="Require registration approval"
            enabled={state.registrationApprovalRequired}
            onClick={toggleRegistrationApproval}
          />
          <AdminFeatureToggle
            label="Owner sharing"
            enabled={state.ownerShareManagementEnabled}
            onClick={toggleOwnerShareManagement}
          />
          <AdminFeatureToggle
            label="DAV compatibility mode"
            enabled={state.davCompatibilityModeEnabled}
            onClick={toggleDavCompatibilityMode}
          />
          <AdminFeatureToggle
            label="Contact management"
            enabled={state.contactManagementEnabled}
            onClick={toggleContactManagement}
          />
          <AdminFeatureToggle
            label="Review queue"
            enabled={state.contactChangeModerationEnabled}
            onClick={toggleContactChangeModeration}
          />
        </div>
        <div className="mt-4">
          <Field label="Queue retention (days)">
            <p className="mb-2 text-xs text-app-faint">
              Applied/denied queue history older than this is purged
              automatically.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <input
                className="input w-40"
                type="number"
                min="1"
                max="3650"
                value={state.contactChangeRetentionDays}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    contactChangeRetentionDays: event.target.value,
                  }))
                }
              />
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={saveContactChangeRetention}
                disabled={retentionSubmitting}
              >
                {retentionSubmitting ? "Saving..." : "Save Retention"}
              </button>
            </div>
          </Field>
          <div className="mt-4">
            <Field label="Milestone generation horizon (years)">
              <p className="mb-2 text-xs text-app-faint">
                How many upcoming years of birthday/anniversary events are
                generated.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  className="input w-40"
                  type="number"
                  min="1"
                  max="25"
                  value={state.milestoneGenerationYears}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      milestoneGenerationYears: event.target.value,
                    }))
                  }
                />
                <button
                  className="btn-outline btn-outline-sm"
                  type="button"
                  onClick={saveMilestoneGenerationYears}
                  disabled={milestoneGenerationSubmitting}
                >
                  {milestoneGenerationSubmitting ? "Saving..." : "Save Horizon"}
                </button>
              </div>
            </Field>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-app-edge bg-app-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-app-strong">
                Automated Backups
              </h3>
              <p className="mt-1 text-xs text-app-faint">
                Rotating snapshots for calendars and address books.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="mr-2 inline-flex items-center gap-1 px-1 text-xs font-medium text-app-muted transition hover:text-app-strong"
                type="button"
                onClick={openBackupRestoreDrawer}
              >
                Restore
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 21V9" />
                  <path d="m7 14 5-5 5 5" />
                  <path d="M5 4h14" />
                </svg>
                {/* <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M1 4v6h6" />
                  <path d="M3.51 15a9 9 0 1 0 .49-7L1 10" />
                </svg>*/}
              </button>
              <button
                className={backupRunNowButtonClass}
                type="button"
                onClick={runBackupNow}
                disabled={backupRunNowDisabled}
                title={
                  !backupHasDestination
                    ? "Configure at least one destination first."
                    : undefined
                }
              >
                {backupRunning ? "Running backup..." : "Run Backup Now"}
              </button>
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={openBackupConfigDrawer}
              >
                Configure
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-app-edge bg-app-surface px-2.5 py-1 text-xs">
              <span className="text-app-faint">Status</span>
              <span className="font-semibold text-app-strong">
                {state.backupEnabled ? "Enabled" : "Disabled"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-app-edge bg-app-surface px-2.5 py-1 text-xs">
              <span className="text-app-faint">Destinations</span>
              <span className="font-semibold text-app-strong">
                {backupDestinationSummary || "None"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-app-edge bg-app-surface px-2.5 py-1 text-xs">
              <span className="text-app-faint">Schedule</span>
              <span className="font-semibold text-app-strong">
                {backupScheduleSummary}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-app-edge bg-app-surface px-2.5 py-1 text-xs">
              <span className="text-app-faint">Retention</span>
              <span className="font-semibold text-app-strong">
                {backupRetentionSummary}
              </span>
            </span>
          </div>

          <p className="mt-3 text-xs text-app-faint">
            Last Run: {backupLastRunLabel}
          </p>
          {state.backupLastRunMessage ? (
            <p
              className={`mt-1 text-xs ${
                state.backupLastRunStatus === "failed"
                  ? "text-app-danger"
                  : state.backupLastRunStatus === "success"
                    ? "text-app-accent"
                    : "text-app-faint"
              }`}
            >
              {state.backupLastRunMessage}
            </p>
          ) : null}
        </div>
        {state.milestonePurgeVisible ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              className="btn-outline btn-outline-sm text-app-danger"
              type="button"
              onClick={purgeGeneratedMilestoneCalendars}
              disabled={
                milestonePurgeSubmitting || !state.milestonePurgeAvailable
              }
              title={
                !state.milestonePurgeAvailable
                  ? "No enabled/generated milestone calendars to purge."
                  : undefined
              }
            >
              {milestonePurgeSubmitting
                ? "Purging milestone calendars..."
                : "Purge Generated Milestone Calendars"}
            </button>
            <p className="text-xs text-app-faint">
              Deletes generated Birthday/Anniversary calendars and disables
              milestone sync settings.
            </p>
          </div>
        ) : null}
        {milestonePurgeSummary ? (
          <p className="mt-2 text-sm text-app-accent">
            {milestonePurgeSummary}
          </p>
        ) : null}
        {state.error ? (
          <p className="mt-3 text-sm text-app-danger">{state.error}</p>
        ) : null}
      </div>

      {backupRunToast ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-30 w-[min(92vw,28rem)] rounded-xl border border-app-edge bg-app-surface px-3 py-2 shadow-2xl">
          <p
            className={`text-[11px] font-semibold uppercase tracking-wide ${backupRunToastToneClass}`}
          >
            {String(backupRunToast.status || "status").toUpperCase()}
          </p>
          <p className="mt-1 text-sm text-app-strong">
            {backupRunToast.message}
          </p>
        </div>
      ) : null}

      {backupConfigRendered ? (
        <div
          className={`fixed inset-0 z-40 ${
            backupConfigOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
          aria-hidden={!backupConfigOpen}
        >
          <button
            type="button"
            aria-label="Close backup configuration"
            className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
              backupConfigOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeBackupConfigDrawer}
            tabIndex={backupConfigOpen ? 0 : -1}
          />
          <div
            className={`absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-app-edge bg-app-surface p-5 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
              backupConfigOpen
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-app-strong">
                  Backup Configuration
                </h3>
                <p className="mt-1 text-sm text-app-muted">
                  Configure destinations, schedule windows, and retention
                  strategy.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline btn-outline-sm"
                onClick={closeBackupConfigDrawer}
              >
                Close
              </button>
            </div>

            <section className="mt-5 rounded-2xl border border-app-edge p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <AdminFeatureToggle
                  label="Backups enabled"
                  enabled={state.backupEnabled}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      backupEnabled: !prev.backupEnabled,
                    }))
                  }
                />
                <AdminFeatureToggle
                  label="Local destination"
                  enabled={state.backupLocalEnabled}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      backupLocalEnabled: !prev.backupLocalEnabled,
                    }))
                  }
                />
                <AdminFeatureToggle
                  label="S3 destination"
                  enabled={state.backupS3Enabled}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      backupS3Enabled: !prev.backupS3Enabled,
                    }))
                  }
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Schedule times (HH:MM, comma-separated)">
                  <input
                    className="input"
                    value={state.backupScheduleTimes}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        backupScheduleTimes: event.target.value,
                      }))
                    }
                    placeholder="02:30, 14:30"
                  />
                </Field>
                <Field label="Timezone">
                  <select
                    className="input"
                    value={state.backupTimezone}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        backupTimezone: event.target.value,
                      }))
                    }
                  >
                    {!backupTimezoneExistsInOptions && state.backupTimezone ? (
                      <option value={state.backupTimezone}>
                        {state.backupTimezone} (current)
                      </option>
                    ) : null}
                    {backupTimezoneGroups.map((group) => (
                      <optgroup key={group.region} label={group.region}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                {state.backupLocalEnabled ? (
                  <Field label="Local backup path">
                    <input
                      className="input"
                      value={state.backupLocalPath}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupLocalPath: event.target.value,
                        }))
                      }
                      placeholder="/var/backups/davvy"
                    />
                  </Field>
                ) : null}
                {state.backupS3Enabled ? (
                  <Field label="S3 disk name">
                    <input
                      className="input"
                      value={state.backupS3Disk}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupS3Disk: event.target.value,
                        }))
                      }
                      placeholder="s3"
                    />
                  </Field>
                ) : null}
                {state.backupS3Enabled ? (
                  <Field label="S3 key prefix">
                    <input
                      className="input"
                      value={state.backupS3Prefix}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupS3Prefix: event.target.value,
                        }))
                      }
                      placeholder="davvy-backups"
                    />
                  </Field>
                ) : null}
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-app-edge p-4">
              <button
                className="flex w-full items-center justify-between text-left"
                type="button"
                onClick={() => setBackupAdvancedOpen((prev) => !prev)}
              >
                <span className="text-sm font-semibold text-app-strong">
                  Advanced
                </span>
                <span className="text-xs text-app-muted">
                  {backupAdvancedOpen ? "Hide" : "Show"}
                </span>
              </button>

              {backupAdvancedOpen ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Weekly backup day">
                    <select
                      className="input"
                      value={state.backupWeeklyDay}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupWeeklyDay: Number(event.target.value),
                        }))
                      }
                    >
                      {WEEKDAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monthly backup day">
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="31"
                      value={state.backupMonthlyDay}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupMonthlyDay: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Yearly backup month">
                    <select
                      className="input"
                      value={state.backupYearlyMonth}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupYearlyMonth: Number(event.target.value),
                        }))
                      }
                    >
                      {MONTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Yearly backup day">
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="31"
                      value={state.backupYearlyDay}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          backupYearlyDay: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <Field label="Retention strategy">
                    <select
                      className="input"
                      value={backupRetentionPreset}
                      onChange={(event) => {
                        const preset = event.target.value;
                        setBackupRetentionPreset(preset);

                        if (preset === "recommended") {
                          setState((prev) => ({
                            ...prev,
                            backupRetentionDaily:
                              RECOMMENDED_BACKUP_RETENTION.daily,
                            backupRetentionWeekly:
                              RECOMMENDED_BACKUP_RETENTION.weekly,
                            backupRetentionMonthly:
                              RECOMMENDED_BACKUP_RETENTION.monthly,
                            backupRetentionYearly:
                              RECOMMENDED_BACKUP_RETENTION.yearly,
                          }));
                        }
                      }}
                    >
                      <option value="recommended">
                        Recommended (7/4/12/3)
                      </option>
                      <option value="custom">Custom</option>
                    </select>
                  </Field>

                  {backupRetentionPreset === "custom" ? (
                    <div className="md:col-span-2">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Daily retention">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="3650"
                            value={state.backupRetentionDaily}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                backupRetentionDaily: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="Weekly retention">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="520"
                            value={state.backupRetentionWeekly}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                backupRetentionWeekly: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="Monthly retention">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="240"
                            value={state.backupRetentionMonthly}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                backupRetentionMonthly: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="Yearly retention">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="50"
                            value={state.backupRetentionYearly}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                backupRetentionYearly: event.target.value,
                              }))
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={closeBackupConfigDrawer}
              >
                Cancel
              </button>
              <button
                className={backupSaveButtonClass}
                type="button"
                onClick={saveBackupSettings}
                disabled={backupSaving}
              >
                {backupSaving ? "Saving..." : "Save Backup Settings"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {backupRestoreRendered ? (
        <div
          className={`fixed inset-0 z-40 ${
            backupRestoreOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
          aria-hidden={!backupRestoreOpen}
        >
          <button
            type="button"
            aria-label="Close backup restore"
            className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
              backupRestoreOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeBackupRestoreDrawer}
            tabIndex={backupRestoreOpen ? 0 : -1}
          />
          <div
            className={`absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-app-edge bg-app-surface p-5 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
              backupRestoreOpen
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-app-strong">
                  Restore Backup Archive
                </h3>
                <p className="mt-1 text-sm text-app-muted">
                  Import a generated backup ZIP into calendars and address
                  books.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline btn-outline-sm"
                onClick={closeBackupRestoreDrawer}
              >
                Close
              </button>
            </div>

            <section className="mt-5 rounded-2xl border border-app-edge p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Backup ZIP file">
                  <input
                    className="input"
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setBackupRestoreFile(nextFile);
                    }}
                  />
                </Field>
                <Field label="Restore mode">
                  <select
                    className="input"
                    value={backupRestoreMode}
                    onChange={(event) =>
                      setBackupRestoreMode(event.target.value)
                    }
                  >
                    <option value="merge">Merge (upsert)</option>
                    <option value="replace">Replace owner data</option>
                  </select>
                </Field>
              </div>

              {backupRestoreFile ? (
                <p className="mt-2 max-w-full truncate text-xs text-app-faint">
                  Selected: {backupRestoreFile.name}
                </p>
              ) : null}

              <label className="mt-3 inline-flex items-center gap-2 text-xs text-app-faint">
                <input
                  type="checkbox"
                  checked={backupRestoreDryRun}
                  onChange={(event) =>
                    setBackupRestoreDryRun(!!event.target.checked)
                  }
                />
                Dry run only (preview changes without writing data)
              </label>

              {backupRestoreMode === "replace" ? (
                <p className="mt-2 text-xs text-app-danger">
                  Replace mode deletes existing owner resources in scope before
                  restore.
                </p>
              ) : null}
            </section>

            {backupRestoreResult ? (
              <div className="mt-4 rounded-xl border border-app-edge bg-app-surface p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-app-faint">
                  Restore Result
                </p>
                <p className="mt-1 text-sm text-app-strong">
                  {backupRestoreResult.reason ||
                    "Restore completed successfully."}
                </p>

                {backupRestoreSummary ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <p className="text-xs text-app-faint">
                      Files processed:{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(backupRestoreSummary.files_processed || 0)}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Files skipped:{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(backupRestoreSummary.files_skipped || 0)}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Calendars (create/update):{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(backupRestoreSummary.calendars_created || 0)}/
                        {Number(backupRestoreSummary.calendars_updated || 0)}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Address books (create/update):{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(
                          backupRestoreSummary.address_books_created || 0,
                        )}
                        /
                        {Number(
                          backupRestoreSummary.address_books_updated || 0,
                        )}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Objects (create/update):{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(
                          (backupRestoreSummary.calendar_objects_created || 0) +
                            (backupRestoreSummary.cards_created || 0),
                        )}
                        /
                        {Number(
                          (backupRestoreSummary.calendar_objects_updated || 0) +
                            (backupRestoreSummary.cards_updated || 0),
                        )}
                      </span>
                    </p>
                    <p className="text-xs text-app-faint">
                      Invalid resources skipped:{" "}
                      <span className="font-semibold text-app-strong">
                        {Number(
                          backupRestoreSummary.resources_skipped_invalid || 0,
                        )}
                      </span>
                    </p>
                  </div>
                ) : null}

                {backupRestoreWarnings.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-app-faint">
                      Warnings
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-app-faint">
                      {backupRestoreWarnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                className="btn-outline btn-outline-sm"
                type="button"
                onClick={closeBackupRestoreDrawer}
              >
                Cancel
              </button>
              <button
                className={backupRestoreRunButtonClass}
                type="button"
                onClick={runBackupRestore}
                disabled={backupRestoreRunDisabled}
              >
                {backupRestoring
                  ? "Running restore..."
                  : backupRestoreDryRun
                    ? "Run Restore Dry-Run"
                    : "Run Restore"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {state.loading ? (
        <FullPageState label="Loading admin data..." compact />
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="surface rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Create User</h3>
            <form className="mt-3 space-y-3" onSubmit={createUser}>
              <input
                className="input"
                placeholder="Name"
                value={userForm.name}
                onChange={(e) =>
                  setUserForm({ ...userForm, name: e.target.value })
                }
                required
              />
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={userForm.email}
                onChange={(e) =>
                  setUserForm({ ...userForm, email: e.target.value })
                }
                required
              />
              <input
                className="input"
                type="password"
                placeholder="Password"
                value={userForm.password}
                onChange={(e) =>
                  setUserForm({ ...userForm, password: e.target.value })
                }
                required
              />
              <select
                className="input"
                value={userForm.role}
                onChange={(e) =>
                  setUserForm({ ...userForm, role: e.target.value })
                }
              >
                <option value="regular">Regular</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn" type="submit">
                Create User
              </button>
            </form>

            <div className="mt-5 space-y-2">
              {state.users.map((user) => {
                const isApproved = user.is_approved !== false;

                return (
                  <div
                    key={user.id}
                    className="rounded-xl border border-app-edge bg-app-surface p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-app-strong">{user.name}</p>
                      {!isApproved ? (
                        <button
                          className="btn-outline btn-outline-sm inline-flex items-center gap-1"
                          type="button"
                          onClick={() => approveUser(user.id)}
                        >
                          <span>Approve</span>
                          {CheckIcon ? (
                            <CheckIcon className="h-3.5 w-3.5" />
                          ) : null}
                        </button>
                      ) : null}
                    </div>
                    <p className="text-app-muted">{user.email}</p>
                    <p className="text-xs text-app-faint">
                      Role: {user.role} | Calendars: {user.calendars_count} |
                      Address books: {user.address_books_count}
                    </p>
                    <p className="text-xs text-app-faint">
                      Status: {isApproved ? "approved" : "pending approval"}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="surface rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Assign Share Access</h3>
            <form className="mt-3 space-y-3" onSubmit={saveShare}>
              <select
                className="input"
                value={shareForm.resource_type}
                onChange={(e) =>
                  setShareForm({
                    ...shareForm,
                    resource_type: e.target.value,
                    resource_id: "",
                  })
                }
              >
                <option value="calendar">Calendar</option>
                <option value="address_book">Address Book</option>
              </select>
              <select
                className="input"
                value={shareForm.resource_id}
                onChange={(e) =>
                  setShareForm({ ...shareForm, resource_id: e.target.value })
                }
                required
              >
                <option value="">Select sharable resource</option>
                {resourceOptions.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.display_name} ({resource.owner?.email})
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={shareForm.shared_with_id}
                onChange={(e) =>
                  setShareForm({ ...shareForm, shared_with_id: e.target.value })
                }
                required
              >
                <option value="">Select user</option>
                {state.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={shareForm.permission}
                onChange={(e) =>
                  setShareForm({ ...shareForm, permission: e.target.value })
                }
              >
                <option value="read_only">General (read-only)</option>
                <option value="editor">Editor (full edit, no delete)</option>
                <option value="admin">Admin (full edit + delete)</option>
              </select>
              <button className="btn" type="submit">
                Save Share
              </button>
            </form>

            <div className="mt-5 space-y-2">
              {state.shares.map((share) => (
                <div
                  key={share.id}
                  className="rounded-xl border border-app-edge bg-app-surface p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-app-strong">
                      {share.resource_type} #{share.resource_id}
                    </p>
                    <PermissionBadge permission={share.permission} />
                  </div>
                  <p className="text-app-muted">
                    Owner: {share.owner.name} ({share.owner.email})
                  </p>
                  <p className="text-app-muted">
                    Shared with: {share.shared_with.name} (
                    {share.shared_with.email})
                  </p>
                  <button
                    className="mt-2 text-xs font-semibold text-app-danger"
                    onClick={() => deleteShare(share.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
