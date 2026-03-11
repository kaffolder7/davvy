import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminFeatureToggleComponent from "./components/admin/AdminFeatureToggle";
import AdminPageComponent from "./components/admin/AdminPage";
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
} from "./components/admin/adminConfigUtils";
import AuthShellComponent from "./components/auth/AuthShell";
import LoginPageComponent from "./components/auth/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RegisterPageComponent from "./components/auth/RegisterPage";
import useAuthState from "./components/auth/useAuthState";
import CopyableResourceUriComponent from "./components/common/CopyableResourceUri";
import FieldComponent from "./components/common/Field";
import FullPageState from "./components/common/FullPageState";
import InfoCardComponent from "./components/common/InfoCard";
import PermissionBadge from "./components/common/PermissionBadge";
import { api, extractError } from "./lib/api";
import {
  buildDavCollectionUrl,
  copyTextToClipboard,
  downloadExport,
  fileStem,
} from "./lib/browserDavUtils";
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
  CONTACTS_PAGE_SIZE,
  PRONOUN_OPTIONS,
} from "./components/contacts/contactConfig";
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
import {
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  PencilIcon,
  ResetIcon,
  TimesIcon,
} from "./components/icons/AppIcons";
import SponsorshipLinkIcon from "./components/layout/SponsorshipLinkIcon";
import ProfilePageComponent from "./components/profile/ProfilePage";
import ThemeControl from "./components/theme/ThemeControl";
import useThemePreference from "./components/theme/useThemePreference";

function App() {
  const theme = useThemePreference();
  const { auth, value } = useAuthState({
    api,
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

const mountNode = document.getElementById("app");

if (mountNode) {
  createRoot(mountNode).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
}

export default App;
