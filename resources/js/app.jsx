import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminFeatureToggleComponent from "./components/admin/AdminFeatureToggle";
import AdminPageComponent from "./components/admin/AdminPage";
import AuthShellComponent from "./components/auth/AuthShell";
import LoginPageComponent from "./components/auth/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RegisterPageComponent from "./components/auth/RegisterPage";
import useAuthState from "./components/auth/useAuthState";
import CopyableResourceUriComponent from "./components/common/CopyableResourceUri";
import FieldComponent from "./components/common/Field";
import InfoCardComponent from "./components/common/InfoCard";
import { api, extractError } from "./lib/api";
import AddressBookMilestoneControlsComponent from "./components/contacts/AddressBookMilestoneControls";
import AddressEditorComponent from "./components/contacts/AddressEditor";
import ContactEditorHideFieldModalComponent from "./components/contacts/ContactEditorHideFieldModal";
import ContactEditorPanelComponent from "./components/contacts/ContactEditorPanel";
import ContactsListSidebarComponent from "./components/contacts/ContactsListSidebar";
import ContactsPageComponent from "./components/contacts/ContactsPage";
import DateEditorComponent from "./components/contacts/DateEditor";
import LabeledValueEditorComponent from "./components/contacts/LabeledValueEditor";
import RowReorderControls from "./components/contacts/RowReorderControls";
import RelatedNameEditorComponent from "./components/contacts/RelatedNameEditor";
import {
  ADDRESS_LABEL_OPTIONS,
  DATE_LABEL_OPTIONS,
  EMAIL_LABEL_OPTIONS,
  IM_LABEL_OPTIONS,
  PHONE_LABEL_OPTIONS,
  RELATED_LABEL_OPTIONS,
  URL_LABEL_OPTIONS,
  buildLabelOptions,
  buildRelatedNameLabelOptions,
  buildSavedCustomLabelsByField,
  resolveLabelSelectValue,
} from "./components/contacts/contactLabelUtils";
import {
  OPTIONAL_CONTACT_FIELDS,
  clearOptionalFieldValue,
  createContactSectionOpenState,
  createEmptyAddress,
  createEmptyContactForm,
  createEmptyDate,
  createEmptyLabeledValue,
  createEmptyRelatedName,
  deriveContactSectionOpenState,
  deriveOptionalFieldVisibility,
  hasTextValue,
  hydrateContactForm,
  normalizeDatePartInput,
  normalizeDatePartsForPayload,
  normalizeDateRowsForPayload,
  normalizePositiveInt,
  optionalFieldHasValue,
} from "./components/contacts/contactFormUtils";
import { useRowReorder } from "./components/contacts/useRowReorder";
import ResourcePanelComponent from "./components/dashboard/ResourcePanel";
import DashboardPageComponent from "./components/dashboard/DashboardPage";
import ContactChangeQueuePageComponent from "./components/queue/ContactChangeQueuePage";
import AppShellComponent from "./components/layout/AppShell";
import SponsorshipLinkIcon from "./components/layout/SponsorshipLinkIcon";
import ProfilePageComponent from "./components/profile/ProfilePage";
import ThemeControl from "./components/theme/ThemeControl";
import useThemePreference from "./components/theme/useThemePreference";

function fileStem(value, fallback = "export") {
  const stem = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "");

  return stem || fallback;
}

function parseDispositionFilename(header) {
  if (!header) {
    return null;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const standardMatch = header.match(/filename="?([^";]+)"?/i);
  return standardMatch?.[1] ?? null;
}

async function copyTextToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("copy-failed");
  }
}

function buildDavCollectionUrl(resourceKind, principalId, resourceUri) {
  const collectionRoot =
    resourceKind === "calendar" ? "calendars" : "addressbooks";
  const normalizedUri = String(resourceUri ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return `${window.location.origin}/dav/${collectionRoot}/${principalId}/${normalizedUri}`;
}

async function downloadExport(url, fallbackName) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!response.ok) {
    let message = "Unable to download export.";

    try {
      const payload = await response.json();
      if (typeof payload?.message === "string" && payload.message) {
        message = payload.message;
      }
    } catch {
      // ignore parsing issues and use fallback message
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const fileName =
    parseDispositionFilename(response.headers.get("content-disposition")) ||
    fallbackName;

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

const MILESTONE_PURGE_SUMMARY_AUTO_HIDE_MS = 6000;
const BACKUP_RUN_TOAST_AUTO_HIDE_MS = 3200;
const BACKUP_DRAWER_ANIMATION_MS = 220;
const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];
const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];
const RECOMMENDED_BACKUP_RETENTION = {
  daily: 7,
  weekly: 4,
  monthly: 12,
  yearly: 3,
};

function parseSponsorshipConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object") {
    return {
      enabled: false,
      links: [],
    };
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

function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");

  return `UTC${sign}${hours}:${minutes}`;
}

function timezoneOffsetMinutes(timeZone, referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(referenceDate);
  const values = Object.create(null);
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUtcTimestamp = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((asUtcTimestamp - referenceDate.getTime()) / 60000);
}

function formatTimezoneDisplayName(timeZone) {
  return timeZone.replace(/_/g, " ");
}

function buildTimezoneGroups(referenceDate = new Date()) {
  let names = ["UTC"];

  if (typeof Intl?.supportedValuesOf === "function") {
    try {
      names = Array.from(
        new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]),
      );
    } catch {
      names = ["UTC"];
    }
  }

  const options = names
    .map((timeZone) => {
      try {
        const offset = timezoneOffsetMinutes(timeZone, referenceDate);
        return {
          value: timeZone,
          offset,
          region: timeZone.includes("/") ? timeZone.split("/")[0] : "Global",
          label: `(${formatUtcOffset(offset)}) ${formatTimezoneDisplayName(
            timeZone,
          )}`,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.offset - b.offset ||
        a.region.localeCompare(b.region) ||
        a.value.localeCompare(b.value),
    );

  const map = new Map();
  for (const option of options) {
    if (!map.has(option.region)) {
      map.set(option.region, []);
    }

    map.get(option.region).push(option);
  }

  return Array.from(map.entries())
    .map(([region, values]) => ({
      region,
      minOffset: values[0]?.offset ?? 0,
      options: values,
    }))
    .sort(
      (a, b) => a.minOffset - b.minOffset || a.region.localeCompare(b.region),
    );
}

function parseBackupScheduleTimes(value) {
  const parsed = String(value ?? "")
    .split(/[,\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item));

  return Array.from(new Set(parsed)).sort();
}

function isRecommendedBackupRetention({ daily, weekly, monthly, yearly }) {
  return (
    Number(daily) === RECOMMENDED_BACKUP_RETENTION.daily &&
    Number(weekly) === RECOMMENDED_BACKUP_RETENTION.weekly &&
    Number(monthly) === RECOMMENDED_BACKUP_RETENTION.monthly &&
    Number(yearly) === RECOMMENDED_BACKUP_RETENTION.yearly
  );
}

function normalizeBackupConfigSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    backupEnabled: !!snapshot.backupEnabled,
    backupLocalEnabled: !!snapshot.backupLocalEnabled,
    backupLocalPath: String(snapshot.backupLocalPath ?? ""),
    backupS3Enabled: !!snapshot.backupS3Enabled,
    backupS3Disk: String(snapshot.backupS3Disk ?? ""),
    backupS3Prefix: String(snapshot.backupS3Prefix ?? ""),
    backupTimezone: String(snapshot.backupTimezone ?? ""),
    backupScheduleTimes: parseBackupScheduleTimes(
      snapshot.backupScheduleTimes,
    ).join(","),
    backupWeeklyDay: Number(snapshot.backupWeeklyDay ?? 0),
    backupMonthlyDay: Number(snapshot.backupMonthlyDay ?? 1),
    backupYearlyMonth: Number(snapshot.backupYearlyMonth ?? 1),
    backupYearlyDay: Number(snapshot.backupYearlyDay ?? 1),
    backupRetentionDaily: Number(snapshot.backupRetentionDaily ?? 0),
    backupRetentionWeekly: Number(snapshot.backupRetentionWeekly ?? 0),
    backupRetentionMonthly: Number(snapshot.backupRetentionMonthly ?? 0),
    backupRetentionYearly: Number(snapshot.backupRetentionYearly ?? 0),
    backupRetentionPreset: String(snapshot.backupRetentionPreset ?? ""),
  };
}

function areBackupConfigSnapshotsEqual(left, right) {
  const normalizedLeft = normalizeBackupConfigSnapshot(left);
  const normalizedRight = normalizeBackupConfigSnapshot(right);

  if (!normalizedLeft || !normalizedRight) {
    return normalizedLeft === normalizedRight;
  }

  for (const key of Object.keys(normalizedLeft)) {
    if (normalizedLeft[key] !== normalizedRight[key]) {
      return false;
    }
  }

  return true;
}

function formatAdminTimestamp(value) {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Invalid timestamp";
  }

  return parsed.toLocaleString();
}

function App() {
  const theme = useThemePreference();
  const { auth, value } = useAuthState({
    api,
    parseSponsorshipConfig,
  });

  if (auth.loading) {
    return <FullPageState label="Loading Davvy..." />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage auth={value} theme={theme} />} />
      <Route
        path="/register"
        element={<RegisterPage auth={value} theme={theme} />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute auth={value}>
            <DashboardPage auth={value} theme={theme} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute auth={value}>
            {value.contactManagementEnabled ? (
              <ContactsPage auth={value} theme={theme} />
            ) : (
              <Navigate to="/" replace />
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/review-queue"
        element={
          <ProtectedRoute auth={value}>
            {value.contactChangeModerationEnabled ? (
              <ContactChangeQueuePage auth={value} theme={theme} />
            ) : (
              <Navigate to="/" replace />
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute auth={value} adminOnly>
            <AdminPage auth={value} theme={theme} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute auth={value}>
            <ProfilePage auth={value} theme={theme} />
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={<Navigate to={auth.user ? "/" : "/login"} replace />}
      />
    </Routes>
  );
}

function LoginPage({ auth, theme }) {
  return (
    <LoginPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      parseSponsorshipConfig={parseSponsorshipConfig}
      AuthShell={AuthShellComponent}
      Field={Field}
    />
  );
}

function RegisterPage({ auth, theme }) {
  return (
    <RegisterPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      parseSponsorshipConfig={parseSponsorshipConfig}
      AuthShell={AuthShellComponent}
      Field={Field}
    />
  );
}

function DashboardPage({ auth, theme }) {
  return (
    <DashboardPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      downloadExport={downloadExport}
      fileStem={fileStem}
      AppShell={AppShell}
      FullPageState={FullPageState}
      InfoCard={InfoCard}
      PermissionBadge={PermissionBadge}
      ResourcePanel={ResourcePanel}
      AddressBookMilestoneControls={AddressBookMilestoneControls}
    />
  );
}

const PRONOUN_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "she/her", label: "she/her" },
  { value: "he/him", label: "he/him" },
  { value: "they/them", label: "they/them" },
  { value: "xe/xem", label: "xe/xem" },
  { value: "custom", label: "Custom..." },
];

const CONTACTS_PAGE_SIZE = 12;

function ContactsPage({ auth, theme }) {
  return (
    <ContactsPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      createEmptyContactForm={createEmptyContactForm}
      OPTIONAL_CONTACT_FIELDS={OPTIONAL_CONTACT_FIELDS}
      createContactSectionOpenState={createContactSectionOpenState}
      normalizePositiveInt={normalizePositiveInt}
      buildSavedCustomLabelsByField={buildSavedCustomLabelsByField}
      buildLabelOptions={buildLabelOptions}
      PHONE_LABEL_OPTIONS={PHONE_LABEL_OPTIONS}
      EMAIL_LABEL_OPTIONS={EMAIL_LABEL_OPTIONS}
      URL_LABEL_OPTIONS={URL_LABEL_OPTIONS}
      ADDRESS_LABEL_OPTIONS={ADDRESS_LABEL_OPTIONS}
      DATE_LABEL_OPTIONS={DATE_LABEL_OPTIONS}
      buildRelatedNameLabelOptions={buildRelatedNameLabelOptions}
      IM_LABEL_OPTIONS={IM_LABEL_OPTIONS}
      CONTACTS_PAGE_SIZE={CONTACTS_PAGE_SIZE}
      hasTextValue={hasTextValue}
      deriveOptionalFieldVisibility={deriveOptionalFieldVisibility}
      deriveContactSectionOpenState={deriveContactSectionOpenState}
      hydrateContactForm={hydrateContactForm}
      normalizeDatePartInput={normalizeDatePartInput}
      normalizeDatePartsForPayload={normalizeDatePartsForPayload}
      normalizeDateRowsForPayload={normalizeDateRowsForPayload}
      optionalFieldHasValue={optionalFieldHasValue}
      clearOptionalFieldValue={clearOptionalFieldValue}
      PRONOUN_OPTIONS={PRONOUN_OPTIONS}
      AppShell={AppShell}
      InfoCard={InfoCard}
      FullPageState={FullPageState}
      ContactsListSidebar={ContactsListSidebar}
      ContactEditorPanel={ContactEditorPanel}
      ContactEditorHideFieldModal={ContactEditorHideFieldModal}
      DateEditor={DateEditor}
      LabeledValueEditor={LabeledValueEditor}
      AddressEditor={AddressEditor}
      RelatedNameEditor={RelatedNameEditor}
      Field={Field}
    />
  );
}

function LabeledValueEditor({
  title,
  rows,
  setRows,
  labelOptions,
  valuePlaceholder,
  addLabel,
}) {
  return (
    <LabeledValueEditorComponent
      title={title}
      rows={rows}
      setRows={setRows}
      labelOptions={labelOptions}
      valuePlaceholder={valuePlaceholder}
      addLabel={addLabel}
      resolveLabelSelectValue={resolveLabelSelectValue}
      createEmptyLabeledValue={createEmptyLabeledValue}
      useRowReorder={useRowReorder}
      RowReorderControls={RowReorderControls}
    />
  );
}

export function RelatedNameEditor({
  rows,
  setRows,
  contactOptions,
  labelOptions,
}) {
  return (
    <RelatedNameEditorComponent
      rows={rows}
      setRows={setRows}
      contactOptions={contactOptions}
      labelOptions={labelOptions}
      defaultLabelOptions={RELATED_LABEL_OPTIONS}
      resolveLabelSelectValue={resolveLabelSelectValue}
      normalizePositiveInt={normalizePositiveInt}
      createEmptyRelatedName={createEmptyRelatedName}
      useRowReorder={useRowReorder}
      RowReorderControls={RowReorderControls}
    />
  );
}

function AddressEditor({ rows, setRows, labelOptions }) {
  return (
    <AddressEditorComponent
      rows={rows}
      setRows={setRows}
      labelOptions={labelOptions}
      defaultLabelOptions={ADDRESS_LABEL_OPTIONS}
      resolveLabelSelectValue={resolveLabelSelectValue}
      createEmptyAddress={createEmptyAddress}
      useRowReorder={useRowReorder}
      RowReorderControls={RowReorderControls}
    />
  );
}

function DateEditor({ rows, setRows, labelOptions }) {
  return (
    <DateEditorComponent
      rows={rows}
      setRows={setRows}
      labelOptions={labelOptions}
      defaultLabelOptions={DATE_LABEL_OPTIONS}
      resolveLabelSelectValue={resolveLabelSelectValue}
      createEmptyDate={createEmptyDate}
      normalizeDatePartInput={normalizeDatePartInput}
    />
  );
}

function ContactEditorPanel(props) {
  return <ContactEditorPanelComponent {...props} />;
}

function ContactsListSidebar(props) {
  return <ContactsListSidebarComponent {...props} />;
}

function ContactEditorHideFieldModal(props) {
  return <ContactEditorHideFieldModalComponent {...props} />;
}

function AddressBookMilestoneControls({ item, onSave }) {
  return (
    <AddressBookMilestoneControlsComponent
      item={item}
      onSave={onSave}
      ChevronRightIcon={ChevronRightIcon}
      ResetIcon={ResetIcon}
      PencilIcon={PencilIcon}
      CheckIcon={CheckIcon}
      TimesIcon={TimesIcon}
    />
  );
}

function ResourcePanel({
  title,
  createLabel,
  exportAllLabel,
  resourceKind,
  principalId,
  items,
  sharedItems,
  onCreate,
  form,
  setForm,
  onExportAll,
  onExportItem,
  onToggle,
  onRename,
  renderOwnedItemExtra = null,
}) {
  return (
    <ResourcePanelComponent
      title={title}
      createLabel={createLabel}
      exportAllLabel={exportAllLabel}
      resourceKind={resourceKind}
      principalId={principalId}
      items={items}
      sharedItems={sharedItems}
      onCreate={onCreate}
      form={form}
      setForm={setForm}
      onExportAll={onExportAll}
      onExportItem={onExportItem}
      onToggle={onToggle}
      onRename={onRename}
      renderOwnedItemExtra={renderOwnedItemExtra}
      CopyableResourceUri={CopyableResourceUri}
      PermissionBadge={PermissionBadge}
      DownloadIcon={DownloadIcon}
      PencilIcon={PencilIcon}
    />
  );
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

function ContactChangeQueuePage({ auth, theme }) {
  return (
    <ContactChangeQueuePageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AppShell={AppShell}
      FullPageState={FullPageState}
    />
  );
}

function AdminPage({ auth, theme }) {
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

function ProfilePage({ auth, theme }) {
  return (
    <ProfilePageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AppShell={AppShell}
      InfoCard={InfoCard}
      Field={Field}
    />
  );
}

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

function PermissionBadge({ permission }) {
  if (permission === "admin") {
    return <span className="pill pill-admin">Admin</span>;
  }

  if (permission === "editor") {
    return <span className="pill pill-editor">Editor</span>;
  }

  return <span className="pill pill-read">General</span>;
}

function DownloadIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v10" />
      <path d="M8 10.5 12 14.5l4-4" />
      <path d="M4.5 18.5h15" />
    </svg>
  );
}

function PencilIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function TimesIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ResetIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 15.5 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function CopyableResourceUri({ resourceKind, principalId, resourceUri }) {
  return (
    <CopyableResourceUriComponent
      resourceKind={resourceKind}
      principalId={principalId}
      resourceUri={resourceUri}
      buildDavCollectionUrl={buildDavCollectionUrl}
      copyTextToClipboard={copyTextToClipboard}
    />
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

function FullPageState({ label, compact = false }) {
  return (
    <div
      className={
        compact
          ? "mt-4 text-sm font-semibold text-app-muted"
          : "flex min-h-screen items-center justify-center text-lg font-semibold text-app-base"
      }
    >
      {label}
    </div>
  );
}

const mountNode = document.getElementById("app");

if (mountNode) {
  createRoot(mountNode).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
}

export default App;
