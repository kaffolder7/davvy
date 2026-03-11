import React from "react";

export default function ContactEditorAddressBooksSection({
  isOpen,
  onToggle,
  selectedAddressBookCount,
  addressBooks,
  form,
  toggleAssignedAddressBook,
}) {
  return (
    <section className="rounded-2xl border border-app-edge bg-app-surface p-3">
      <button
        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span>
          <span className="block text-sm font-semibold uppercase tracking-wide text-app-base">
            Address Books
          </span>
          <span className="block text-xs text-app-faint">
            Choose where this contact will be stored.
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-app-warn-edge bg-app-warn-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-base">
            Required
          </span>
          <span className="rounded-full border border-app-edge bg-app-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-faint">
            {selectedAddressBookCount} selected
          </span>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-app-edge text-xs text-app-faint">
            {isOpen ? "-" : "+"}
          </span>
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-3 px-1 pb-1">
          <p className="text-xs text-app-faint">
            Choose one or more address books for this contact.
          </p>
          <div className="space-y-2">
            {addressBooks.length === 0 ? (
              <p className="text-sm text-app-faint">No writable address books.</p>
            ) : (
              addressBooks.map((book) => {
                const isAssigned = form.address_book_ids.includes(book.id);

                return (
                  <label
                    key={book.id}
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                      isAssigned
                        ? "border-app-accent-edge bg-app-surface ring-1 ring-teal-500/30"
                        : "border-app-edge bg-app-surface"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 self-start"
                      checked={isAssigned}
                      onChange={(event) =>
                        toggleAssignedAddressBook(book.id, event.target.checked)
                      }
                    />
                    <span className="min-w-0">
                      <span className="flex items-start gap-2">
                        <span className="block font-medium text-app-strong">
                          {book.display_name}
                        </span>
                        <span
                          className={`mt-0.5 inline-flex h-4 shrink-0 items-center rounded-full border border-app-accent-edge px-1.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-app-accent ${
                            isAssigned ? "" : "invisible"
                          }`}
                          aria-hidden={!isAssigned}
                        >
                          Selected
                        </span>
                      </span>
                      <span className="block text-xs text-app-faint">
                        /{book.uri} • {book.scope === "owned" ? "Owned" : "Shared"}
                        {book.owner_name ? ` • ${book.owner_name}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
