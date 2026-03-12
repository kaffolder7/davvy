import React from "react";

/**
 * Renders the Dashboard Apple Compat Panel.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function DashboardAppleCompatPanel({
  appleCompat,
  appleCompatForm,
  setAppleCompatForm,
  canSelectAppleCompatSources,
  onSaveAppleCompat,
}) {
  return (
    <section className="surface mt-6 rounded-3xl p-6">
      <h2 className="text-xl font-semibold text-app-strong">
        Apple Contacts Compatibility
      </h2>
      <p className="mt-1 text-sm text-app-muted">
        Off by default. Mirror selected address books into your main address
        book (<code>{appleCompat.target_display_name}</code>) so macOS and iOS
        clients can see them.
      </p>

      {appleCompat.target_address_book_id ? (
        <p className="mt-2 text-xs text-app-faint">
          Mirror target: {appleCompat.target_display_name} (/
          {appleCompat.target_address_book_uri})
        </p>
      ) : (
        <p className="mt-2 text-xs text-app-danger">
          No default Contacts address book found for your account.
        </p>
      )}

      <form className="mt-4 space-y-4" onSubmit={onSaveAppleCompat}>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-app-base">
          <input
            type="checkbox"
            checked={appleCompatForm.enabled}
            onChange={(event) =>
              setAppleCompatForm({
                ...appleCompatForm,
                enabled: event.target.checked,
              })
            }
            disabled={!appleCompat.target_address_book_id}
          />
          Enable Apple compatibility mirroring
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-app-strong">
            Source address books to mirror
          </p>
          {appleCompat.source_options.length === 0 ? (
            <p className="text-sm text-app-faint">
              No eligible owned/shared address books available.
            </p>
          ) : (
            appleCompat.source_options.map((option) => {
              const checked = appleCompatForm.source_ids.includes(option.id);

              return (
                <label
                  key={option.id}
                  className={`flex items-start gap-2 rounded-xl border border-app-edge bg-app-surface px-3 py-2 text-sm ${
                    canSelectAppleCompatSources
                      ? ""
                      : "cursor-not-allowed opacity-60"
                  }`}
                  aria-disabled={!canSelectAppleCompatSources}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 self-start"
                    checked={checked}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setAppleCompatForm({
                          ...appleCompatForm,
                          source_ids: [...appleCompatForm.source_ids, option.id],
                        });
                        return;
                      }

                      setAppleCompatForm({
                        ...appleCompatForm,
                        source_ids: appleCompatForm.source_ids.filter(
                          (id) => id !== option.id,
                        ),
                      });
                    }}
                    disabled={!canSelectAppleCompatSources}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-app-strong">
                      {option.display_name}
                    </span>
                    <span className="block text-xs text-app-faint">
                      {option.scope === "owned" ? "Owned" : "Shared"} •{" "}
                      {option.owner_name} ({option.owner_email})
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div>
          <button
            className="btn"
            type="submit"
            disabled={!appleCompat.target_address_book_id}
          >
            Save Apple Compatibility Settings
          </button>
        </div>
      </form>
    </section>
  );
}
