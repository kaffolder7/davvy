import React from "react";
import { useNavigate } from "react-router-dom";
import useContactsPageState from "./useContactsPageState";

export default function ContactsPage({
  auth,
  theme,
  api,
  extractError,
  createEmptyContactForm,
  OPTIONAL_CONTACT_FIELDS,
  createContactSectionOpenState,
  normalizePositiveInt,
  buildSavedCustomLabelsByField,
  buildLabelOptions,
  PHONE_LABEL_OPTIONS,
  EMAIL_LABEL_OPTIONS,
  URL_LABEL_OPTIONS,
  ADDRESS_LABEL_OPTIONS,
  DATE_LABEL_OPTIONS,
  buildRelatedNameLabelOptions,
  IM_LABEL_OPTIONS,
  CONTACTS_PAGE_SIZE,
  hasTextValue,
  deriveOptionalFieldVisibility,
  deriveContactSectionOpenState,
  hydrateContactForm,
  normalizeDatePartInput,
  normalizeDatePartsForPayload,
  normalizeDateRowsForPayload,
  optionalFieldHasValue,
  clearOptionalFieldValue,
  PRONOUN_OPTIONS,
  AppShell,
  InfoCard,
  FullPageState,
  ContactsListSidebar,
  ContactEditorPanel,
  ContactEditorHideFieldModal,
  DateEditor,
  LabeledValueEditor,
  AddressEditor,
  RelatedNameEditor,
  Field,
}) {
  const navigate = useNavigate();
  const {
    loading,
    submitting,
    error,
    queueStatusNotice,
    contacts,
    addressBooks,
    selectedContactId,
    form,
    openSections,
    hiddenOptionalFields,
    filteredHiddenOptionalFields,
    filteredContacts,
    paginatedContacts,
    contactSearchTerm,
    setContactSearchTerm,
    contactAddressBookFilter,
    setContactAddressBookFilter,
    currentContactPage,
    totalContactPages,
    firstContactIndex,
    lastContactIndex,
    hasContactFilters,
    setContactsPage,
    selectedAddressBookCount,
    hasRequiredContactIdentity,
    pendingHideFieldId,
    pendingHideFieldLabel,
    fieldSearchTerm,
    setFieldSearchTerm,
    fieldPickerOpen,
    setFieldPickerOpen,
    fieldToAdd,
    setFieldToAdd,
    visibleOptionalFields,
    setForm,
    labelOptions,
    relatedNameOptions,
    saveContact,
    removeContact,
    startNewContact,
    selectContact,
    updateFormField,
    updateBirthdayField,
    toggleAssignedAddressBook,
    showOptionalField,
    hideOptionalField,
    addSelectedOptionalField,
    toggleSection,
    isOptionalFieldVisible,
    cancelHideOptionalField,
    resolveHideOptionalField,
  } = useContactsPageState({
    auth,
    api,
    extractError,
    createEmptyContactForm,
    OPTIONAL_CONTACT_FIELDS,
    createContactSectionOpenState,
    normalizePositiveInt,
    buildSavedCustomLabelsByField,
    buildLabelOptions,
    PHONE_LABEL_OPTIONS,
    EMAIL_LABEL_OPTIONS,
    URL_LABEL_OPTIONS,
    ADDRESS_LABEL_OPTIONS,
    DATE_LABEL_OPTIONS,
    buildRelatedNameLabelOptions,
    IM_LABEL_OPTIONS,
    CONTACTS_PAGE_SIZE,
    hasTextValue,
    deriveOptionalFieldVisibility,
    deriveContactSectionOpenState,
    hydrateContactForm,
    normalizeDatePartInput,
    normalizeDatePartsForPayload,
    normalizeDateRowsForPayload,
    optionalFieldHasValue,
    clearOptionalFieldValue,
    navigate,
  });

  return (
    <AppShell auth={auth} theme={theme}>
      {queueStatusNotice ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <p className="rounded-xl border border-app-accent-edge bg-teal-700/95 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 backdrop-blur">
            {queueStatusNotice}
          </p>
        </div>
      ) : null}
      <section className="fade-up grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Contacts"
          value={String(contacts.length)}
          helper="Managed contacts in this web UI."
        />
        <InfoCard
          title="Writable Books"
          value={String(addressBooks.length)}
          helper="Address books where you can add or edit contacts."
        />
        <InfoCard
          title="User"
          value={auth.user.name}
          helper="Contact ownership is scoped to your account."
        />
      </section>

      {error ? (
        <div className="surface mt-4 rounded-2xl p-3 text-sm text-app-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <FullPageState label="Loading contacts..." compact />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
          <ContactsListSidebar
            contacts={contacts}
            filteredContacts={filteredContacts}
            paginatedContacts={paginatedContacts}
            addressBooks={addressBooks}
            contactSearchTerm={contactSearchTerm}
            onContactSearchTermChange={setContactSearchTerm}
            contactAddressBookFilter={contactAddressBookFilter}
            onContactAddressBookFilterChange={setContactAddressBookFilter}
            selectedContactId={selectedContactId}
            onSelectContact={selectContact}
            onStartNewContact={startNewContact}
            hasContactFilters={hasContactFilters}
            onClearFilters={() => {
              setContactSearchTerm("");
              setContactAddressBookFilter("all");
            }}
            contactsPageSize={CONTACTS_PAGE_SIZE}
            firstContactIndex={firstContactIndex}
            lastContactIndex={lastContactIndex}
            currentContactPage={currentContactPage}
            totalContactPages={totalContactPages}
            setContactsPage={setContactsPage}
          />

          <ContactEditorPanel
            form={form}
            submitting={submitting}
            addressBooks={addressBooks}
            selectedAddressBookCount={selectedAddressBookCount}
            hasRequiredContactIdentity={hasRequiredContactIdentity}
            saveContact={saveContact}
            removeContact={removeContact}
            openSections={openSections}
            toggleSection={toggleSection}
            isOptionalFieldVisible={isOptionalFieldVisible}
            Field={Field}
            updateFormField={updateFormField}
            PRONOUN_OPTIONS={PRONOUN_OPTIONS}
            showOptionalField={showOptionalField}
            updateBirthdayField={updateBirthdayField}
            DateEditor={DateEditor}
            LabeledValueEditor={LabeledValueEditor}
            AddressEditor={AddressEditor}
            RelatedNameEditor={RelatedNameEditor}
            labelOptions={labelOptions}
            relatedNameOptions={relatedNameOptions}
            setForm={setForm}
            hiddenOptionalFields={hiddenOptionalFields}
            fieldSearchTerm={fieldSearchTerm}
            setFieldSearchTerm={setFieldSearchTerm}
            fieldPickerOpen={fieldPickerOpen}
            setFieldPickerOpen={setFieldPickerOpen}
            addSelectedOptionalField={addSelectedOptionalField}
            filteredHiddenOptionalFields={filteredHiddenOptionalFields}
            fieldToAdd={fieldToAdd}
            setFieldToAdd={setFieldToAdd}
            visibleOptionalFields={visibleOptionalFields}
            hideOptionalField={hideOptionalField}
            OPTIONAL_CONTACT_FIELDS={OPTIONAL_CONTACT_FIELDS}
            toggleAssignedAddressBook={toggleAssignedAddressBook}
          />
        </div>
      )}

      <ContactEditorHideFieldModal
        pendingHideFieldId={pendingHideFieldId}
        pendingHideFieldLabel={pendingHideFieldLabel}
        onCancel={cancelHideOptionalField}
        onResolve={resolveHideOptionalField}
      />
    </AppShell>
  );
}
