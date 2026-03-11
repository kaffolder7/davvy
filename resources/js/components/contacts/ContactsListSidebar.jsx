import React from "react";

export default function ContactsListSidebar({
  contacts,
  filteredContacts,
  paginatedContacts,
  addressBooks,
  contactSearchTerm,
  onContactSearchTermChange,
  contactAddressBookFilter,
  onContactAddressBookFilterChange,
  selectedContactId,
  onSelectContact,
  onStartNewContact,
  hasContactFilters,
  onClearFilters,
  contactsPageSize,
  firstContactIndex,
  lastContactIndex,
  currentContactPage,
  totalContactPages,
  setContactsPage,
}) {
  return (
    <aside className="surface h-fit rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-app-base">
          Contacts
        </h2>
        <button className="btn-outline btn-outline-sm" onClick={onStartNewContact}>
          New
        </button>
      </div>
      <div className="mt-3 space-y-2">
        <input
          className="input"
          type="search"
          placeholder="Search contacts..."
          value={contactSearchTerm}
          onChange={(event) => onContactSearchTermChange(event.target.value)}
        />
        <select
          className="input"
          value={contactAddressBookFilter}
          onChange={(event) => onContactAddressBookFilterChange(event.target.value)}
        >
          <option value="all">All address books</option>
          {addressBooks.map((book) => (
            <option key={book.id} value={String(book.id)}>
              {book.display_name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-app-faint">
        <span>
          {filteredContacts.length} match
          {filteredContacts.length === 1 ? "" : "es"}
        </span>
        {hasContactFilters ? (
          <button
            className="text-xs font-semibold text-app-accent hover:text-app-accent-strong"
            type="button"
            onClick={onClearFilters}
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {contacts.length === 0 ? (
          <p className="text-sm text-app-faint">No contacts yet.</p>
        ) : filteredContacts.length === 0 ? (
          <p className="text-sm text-app-faint">No contacts match this filter.</p>
        ) : (
          paginatedContacts.map((contact) => {
            const addressBookCount = Array.isArray(contact.address_books)
              ? contact.address_books.length
              : 0;

            return (
              <button
                key={contact.id}
                type="button"
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selectedContactId === contact.id
                    ? "border-app-accent-edge bg-app-surface text-app-strong ring-1 ring-teal-500/30"
                    : "border-app-edge bg-app-surface text-app-base hover:border-app-accent-edge"
                }`}
                onClick={() => onSelectContact(contact)}
              >
                <p className="truncate text-sm font-semibold">{contact.display_name}</p>
                <p className="mt-1 text-xs text-app-faint">
                  {addressBookCount} address book{addressBookCount === 1 ? "" : "s"}
                </p>
              </button>
            );
          })
        )}
      </div>
      {filteredContacts.length > contactsPageSize ? (
        <div className="mt-3 rounded-xl border border-app-edge px-2 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-app-faint">
            <span>
              {firstContactIndex + 1}-{lastContactIndex} of {filteredContacts.length}
            </span>
            <span>
              Page {currentContactPage} / {totalContactPages}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="btn-outline btn-outline-sm w-full"
              type="button"
              onClick={() =>
                setContactsPage((prevPage) => Math.max(1, prevPage - 1))
              }
              disabled={currentContactPage === 1}
            >
              Prev
            </button>
            <button
              className="btn-outline btn-outline-sm w-full"
              type="button"
              onClick={() =>
                setContactsPage((prevPage) =>
                  Math.min(totalContactPages, prevPage + 1),
                )
              }
              disabled={currentContactPage >= totalContactPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
