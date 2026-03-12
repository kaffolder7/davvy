import React from "react";

/**
 * Renders the Dashboard Sharing Panel.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
export default function DashboardSharingPanel({
  shareForm,
  setShareForm,
  shareableResourceOptions,
  targets,
  outgoing,
  onSaveShare,
  onDeleteShare,
  PermissionBadge,
}) {
  return (
    <section className="surface mt-6 rounded-3xl p-6">
      <h2 className="text-xl font-semibold text-app-strong">
        Share Your Resources
      </h2>
      <p className="mt-1 text-sm text-app-muted">
        Grant read-only, editor, or admin access for resources you own and
        marked as sharable. Admin access includes collection delete rights.
      </p>
      <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onSaveShare}>
        <select
          className="input"
          value={shareForm.resource_type}
          onChange={(event) =>
            setShareForm({
              ...shareForm,
              resource_type: event.target.value,
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
          onChange={(event) =>
            setShareForm({ ...shareForm, resource_id: event.target.value })
          }
          required
        >
          <option value="">Select sharable resource</option>
          {shareableResourceOptions.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.display_name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={shareForm.shared_with_id}
          onChange={(event) =>
            setShareForm({
              ...shareForm,
              shared_with_id: event.target.value,
            })
          }
          required
        >
          <option value="">Select user</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name} ({target.email})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            className="input"
            value={shareForm.permission}
            onChange={(event) =>
              setShareForm({ ...shareForm, permission: event.target.value })
            }
          >
            <option value="read_only">General (read-only)</option>
            <option value="editor">Full edit (no delete)</option>
            <option value="admin">Admin (full edit + delete)</option>
          </select>
          <button className="btn" type="submit">
            Share
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-2">
        {outgoing.length === 0 ? (
          <p className="text-sm text-app-faint">No outgoing shares yet.</p>
        ) : (
          outgoing.map((share) => (
            <div
              key={share.id}
              className="rounded-xl border border-app-edge bg-app-surface p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-app-strong">
                  {share.resource_type} #{share.resource_id}
                </p>
                <PermissionBadge permission={share.permission} />
              </div>
              <p className="text-app-muted">
                Shared with: {share.shared_with?.name} ({share.shared_with?.email}
                )
              </p>
              <button
                className="mt-2 text-xs font-semibold text-app-danger"
                onClick={() => onDeleteShare(share.id)}
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
