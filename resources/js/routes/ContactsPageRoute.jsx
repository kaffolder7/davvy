import React from "react";
import AddressEditorComponent from "../components/contacts/AddressEditor";
import ContactEditorHideFieldModalComponent from "../components/contacts/ContactEditorHideFieldModal";
import ContactEditorPanelComponent from "../components/contacts/ContactEditorPanel";
import ContactsListSidebarComponent from "../components/contacts/ContactsListSidebar";
import ContactsPageComponent from "../components/contacts/ContactsPage";
import DateEditorComponent from "../components/contacts/DateEditor";
import LabeledValueEditorComponent from "../components/contacts/LabeledValueEditor";
import RelatedNameEditorComponent from "../components/contacts/RelatedNameEditor";
import RowReorderControls from "../components/contacts/RowReorderControls";
import { CONTACTS_PAGE_SIZE, PRONOUN_OPTIONS } from "../components/contacts/contactConfig";
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
} from "../components/contacts/contactLabelUtils";
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
} from "../components/contacts/contactFormUtils";
import { useRowReorder } from "../components/contacts/useRowReorder";
import FullPageState from "../components/common/FullPageState";
import FieldComponent from "../components/common/Field";
import InfoCardComponent from "../components/common/InfoCard";
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

export default function ContactsPageRoute({ auth, theme }) {
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
