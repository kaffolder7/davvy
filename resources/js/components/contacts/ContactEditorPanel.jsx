import React from "react";
import ContactEditorAddressBooksSection from "./ContactEditorAddressBooksSection";
import ContactEditorCommunicationSection from "./ContactEditorCommunicationSection";
import ContactEditorNameSection from "./ContactEditorNameSection";
import ContactEditorOptionalFieldsSection from "./ContactEditorOptionalFieldsSection";
import ContactEditorPersonalSection from "./ContactEditorPersonalSection";
import ContactEditorWorkSection from "./ContactEditorWorkSection";

/**
 * Renders the Contact Editor Panel.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function ContactEditorPanel({
  form,
  submitting,
  addressBooks,
  selectedAddressBookCount,
  hasRequiredContactIdentity,
  saveContact,
  removeContact,
  openSections,
  toggleSection,
  isOptionalFieldVisible,
  Field,
  updateFormField,
  PRONOUN_OPTIONS,
  showOptionalField,
  updateBirthdayField,
  DateEditor,
  LabeledValueEditor,
  AddressEditor,
  RelatedNameEditor,
  labelOptions,
  relatedNameOptions,
  setForm,
  hiddenOptionalFields,
  fieldSearchTerm,
  setFieldSearchTerm,
  fieldPickerOpen,
  setFieldPickerOpen,
  addSelectedOptionalField,
  filteredHiddenOptionalFields,
  fieldToAdd,
  setFieldToAdd,
  visibleOptionalFields,
  hideOptionalField,
  OPTIONAL_CONTACT_FIELDS,
  toggleAssignedAddressBook,
}) {
  const saveDisabled =
    submitting ||
    addressBooks.length === 0 ||
    selectedAddressBookCount === 0 ||
    !hasRequiredContactIdentity;

  return (
    <section className="surface rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-app-strong">
            {form.id ? "Edit Contact" : "New Contact"}
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Enter at least a First Name, Last Name, or Company. Address book
            assignment supports one or more selections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {form.id ? (
            <button
              className="btn-outline btn-outline-sm text-app-danger"
              type="button"
              onClick={removeContact}
              disabled={submitting}
            >
              Delete
            </button>
          ) : null}
          <button
            className="btn"
            type="submit"
            form="contact-editor"
            disabled={saveDisabled}
          >
            {submitting ? "Saving..." : "Save Contact"}
          </button>
        </div>
      </div>

      {addressBooks.length === 0 ? (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You do not currently have write access to any address books.
        </p>
      ) : null}

      <form id="contact-editor" className="mt-5 space-y-6" onSubmit={saveContact}>
        <ContactEditorNameSection
          isOpen={openSections.name}
          onToggle={() => toggleSection("name")}
          form={form}
          Field={Field}
          isOptionalFieldVisible={isOptionalFieldVisible}
          updateFormField={updateFormField}
        />

        <ContactEditorWorkSection
          isOpen={openSections.work}
          onToggle={() => toggleSection("work")}
          form={form}
          Field={Field}
          isOptionalFieldVisible={isOptionalFieldVisible}
          updateFormField={updateFormField}
        />

        <ContactEditorPersonalSection
          isOpen={openSections.personal}
          onToggle={() => toggleSection("personal")}
          form={form}
          Field={Field}
          isOptionalFieldVisible={isOptionalFieldVisible}
          updateFormField={updateFormField}
          PRONOUN_OPTIONS={PRONOUN_OPTIONS}
          showOptionalField={showOptionalField}
          updateBirthdayField={updateBirthdayField}
          DateEditor={DateEditor}
          labelOptions={labelOptions}
          RelatedNameEditor={RelatedNameEditor}
          relatedNameOptions={relatedNameOptions}
          setForm={setForm}
        />

        <ContactEditorCommunicationSection
          isOpen={openSections.communication}
          onToggle={() => toggleSection("communication")}
          form={form}
          updateFormField={updateFormField}
          labelOptions={labelOptions}
          isOptionalFieldVisible={isOptionalFieldVisible}
          LabeledValueEditor={LabeledValueEditor}
          AddressEditor={AddressEditor}
        />

        <ContactEditorOptionalFieldsSection
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
        />

        <ContactEditorAddressBooksSection
          isOpen={openSections.addressBooks}
          onToggle={() => toggleSection("addressBooks")}
          selectedAddressBookCount={selectedAddressBookCount}
          addressBooks={addressBooks}
          form={form}
          toggleAssignedAddressBook={toggleAssignedAddressBook}
        />

        <section className="sticky bottom-2 z-20 sm:bottom-3">
          <div className="surface flex items-center justify-end gap-1.5 rounded-xl px-2.5 py-1.5 shadow-lg shadow-black/10 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2">
            {form.id ? (
              <button
                className="btn-outline btn-outline-sm text-app-danger"
                type="button"
                onClick={removeContact}
                disabled={submitting}
              >
                Delete
              </button>
            ) : null}
            <button
              className="btn !px-3 !py-1.5 sm:!px-4 sm:!py-2"
              type="submit"
              disabled={saveDisabled}
            >
              {submitting ? "Saving..." : "Save Contact"}
            </button>
          </div>
        </section>
      </form>
    </section>
  );
}
