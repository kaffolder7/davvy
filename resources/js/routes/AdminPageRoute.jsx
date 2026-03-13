import React from "react";
import AdminFeatureToggleComponent from "../components/admin/AdminFeatureToggle";
import AdminPageComponent from "../components/admin/AdminPage";
import {
  BACKUP_DRAWER_ANIMATION_MS,
  BACKUP_RUN_TOAST_AUTO_HIDE_MS,
  MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS,
  MONTH_OPTIONS,
  RECOMMENDED_BACKUP_RETENTION,
  WEEKDAY_OPTIONS,
  areBackupConfigSnapshotsEqual,
  buildTimezoneGroups,
  formatAdminTimestamp,
  isRecommendedBackupRetention,
  parseBackupScheduleTimes,
} from "../components/admin/adminConfigUtils";
import FieldComponent from "../components/common/Field";
import FullPageState from "../components/common/FullPageState";
import InfoCardComponent from "../components/common/InfoCard";
import PermissionBadge from "../components/common/PermissionBadge";
import { CheckIcon } from "../components/icons/AppIcons";
import AppShellComponent from "../components/layout/AppShell";
import SponsorshipLinkIcon from "../components/layout/SponsorshipLinkIcon";
import ThemeControl from "../components/theme/ThemeControl";
import { api, extractError } from "../lib/api";
import { copyTextToClipboard } from "../lib/browserDavUtils";

function AppShell({ auth, theme, children }) {
  return (
    <AppShellComponent
      auth={auth}
      theme={theme}
      api={api}
      ThemeControl={ThemeControl}
      SponsorshipLinkIcon={SponsorshipLinkIcon}
    >
      {children}
    </AppShellComponent>
  );
}

function InfoCard({ title, value, helper, copyable = false }) {
  return (
    <InfoCardComponent
      title={title}
      value={value}
      helper={helper}
      copyable={copyable}
      copyTextToClipboard={copyTextToClipboard}
    />
  );
}

function Field({ label, children }) {
  return <FieldComponent label={label}>{children}</FieldComponent>;
}

function AdminFeatureToggle({ label, enabled, onClick }) {
  return (
    <AdminFeatureToggleComponent
      label={label}
      enabled={enabled}
      onClick={onClick}
    />
  );
}

export default function AdminPageRoute({ auth, theme }) {
  return (
    <AdminPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AppShell={AppShell}
      InfoCard={InfoCard}
      AdminFeatureToggle={AdminFeatureToggle}
      FullPageState={FullPageState}
      Field={Field}
      PermissionBadge={PermissionBadge}
      CheckIcon={CheckIcon}
      buildTimezoneGroups={buildTimezoneGroups}
      parseBackupScheduleTimes={parseBackupScheduleTimes}
      isRecommendedBackupRetention={isRecommendedBackupRetention}
      areBackupConfigSnapshotsEqual={areBackupConfigSnapshotsEqual}
      formatAdminTimestamp={formatAdminTimestamp}
      MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS={MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS}
      BACKUP_RUN_TOAST_AUTO_HIDE_MS={BACKUP_RUN_TOAST_AUTO_HIDE_MS}
      BACKUP_DRAWER_ANIMATION_MS={BACKUP_DRAWER_ANIMATION_MS}
      WEEKDAY_OPTIONS={WEEKDAY_OPTIONS}
      MONTH_OPTIONS={MONTH_OPTIONS}
      RECOMMENDED_BACKUP_RETENTION={RECOMMENDED_BACKUP_RETENTION}
    />
  );
}
