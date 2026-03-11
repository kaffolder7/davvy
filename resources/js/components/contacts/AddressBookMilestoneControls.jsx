import React, { useEffect, useState } from "react";

export default function AddressBookMilestoneControls({
  item,
  onSave,
  ChevronRightIcon,
  ResetIcon,
  PencilIcon,
  CheckIcon,
  TimesIcon,
}) {
  const birthdaySettings = item?.milestone_calendars?.birthdays ?? {};
  const anniversarySettings = item?.milestone_calendars?.anniversaries ?? {};
  const enabledCount =
    (birthdaySettings.enabled ? 1 : 0) + (anniversarySettings.enabled ? 1 : 0);
  const [savingKey, setSavingKey] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  const [nameDrafts, setNameDrafts] = useState({
    birthdays: birthdaySettings.custom_name ?? "",
    anniversaries: anniversarySettings.custom_name ?? "",
  });

  useEffect(() => {
    setNameDrafts({
      birthdays: birthdaySettings.custom_name ?? "",
      anniversaries: anniversarySettings.custom_name ?? "",
    });
  }, [item?.id, birthdaySettings.custom_name, anniversarySettings.custom_name]);

  const saveMilestone = async (type, payload) => {
    if (savingKey) {
      return false;
    }

    setSavingKey(type);

    try {
      await onSave(item.id, payload);
      return true;
    } catch {
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  const toggleEnabled = async (type, enabled) => {
    if (type === "birthdays") {
      await saveMilestone(type, {
        birthdays_enabled: enabled,
      });
      return;
    }

    await saveMilestone(type, {
      anniversaries_enabled: enabled,
    });
  };

  const saveName = async (type) => {
    const settings =
      type === "birthdays" ? birthdaySettings : anniversarySettings;
    const value = (nameDrafts[type] ?? "").trim();
    const existing = (settings.custom_name ?? "").trim();

    if (value === existing) {
      setEditingKey(null);
      return;
    }

    const payload =
      type === "birthdays"
        ? { birthday_calendar_name: value || null }
        : { anniversary_calendar_name: value || null };
    const didSave = await saveMilestone(type, payload);

    if (didSave) {
      setEditingKey(null);
    }
  };

  const resetName = async (type) => {
    const settings =
      type === "birthdays" ? birthdaySettings : anniversarySettings;
    const hasCustomName = (settings.custom_name ?? "").trim().length > 0;

    if (!hasCustomName) {
      return;
    }

    const payload =
      type === "birthdays"
        ? { birthday_calendar_name: null }
        : { anniversary_calendar_name: null };
    const didSave = await saveMilestone(type, payload);

    if (didSave) {
      setNameDrafts((prev) => ({
        ...prev,
        [type]: "",
      }));
      setEditingKey((prev) => (prev === type ? null : prev));
    }
  };

  const renderRow = (type, label, settings, fallbackName) => {
    const isSaving = savingKey === type;
    const saveInProgress = !!savingKey && !isSaving;
    const isEditing = editingKey === type;
    const currentCustom = settings.custom_name ?? "";
    const hasCustomName = currentCustom.trim().length > 0;
    const canSaveName =
      (nameDrafts[type] ?? "").trim() !== currentCustom.trim() && !isSaving;

    return (
      <div className="py-0.5" key={type}>
        <div className="flex items-center gap-2">
          <label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-app-base">
            <input
              type="checkbox"
              checked={!!settings.enabled}
              disabled={isSaving || saveInProgress}
              onChange={(event) => toggleEnabled(type, event.target.checked)}
            />
            {label}
          </label>
          {isEditing ? (
            <div className="min-w-0 flex flex-1 items-center gap-1.5">
              <input
                className="input h-7 min-w-[9rem] flex-1 px-2 py-1 text-sm"
                value={nameDrafts[type] ?? ""}
                onChange={(event) =>
                  setNameDrafts((prev) => ({
                    ...prev,
                    [type]: event.target.value,
                  }))
                }
                placeholder={settings.default_name ?? fallbackName}
                disabled={isSaving}
              />
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded text-app-faint transition hover:text-app-base focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                type="button"
                aria-label={`Cancel editing ${label} calendar name`}
                title={`Cancel editing ${label} calendar name`}
                onClick={() => {
                  setEditingKey(null);
                  setNameDrafts((prev) => ({
                    ...prev,
                    [type]: currentCustom,
                  }));
                }}
                disabled={isSaving}
              >
                <TimesIcon className="h-3.5 w-3.5" />
              </button>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded text-app-accent transition hover:text-app-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                type="button"
                aria-label={`Save ${label} calendar name`}
                title={`Save ${label} calendar name`}
                onClick={() => saveName(type)}
                disabled={!canSaveName}
              >
                <CheckIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="min-w-0 flex items-center gap-0">
              {hasCustomName ? (
                <>
                  <span
                    className="max-w-[14rem] truncate text-xs text-app-faint sm:max-w-[20rem]"
                    title={currentCustom}
                  >
                    {currentCustom}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 -mr-[0.25rem] items-center justify-center rounded text-app-dim transition hover:text-app-base focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                    aria-label={`Reset ${label} calendar name to default`}
                    title={`Reset ${label} calendar name to default`}
                    onClick={() => resetName(type)}
                    disabled={isSaving || saveInProgress}
                  >
                    <ResetIcon className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-app-dim transition hover:text-app-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                aria-label={`Rename ${label} calendar`}
                title={`Rename ${label} calendar`}
                onClick={() => setEditingKey(type)}
                disabled={isSaving || saveInProgress}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {isSaving ? (
            <span className="shrink-0 text-[11px] text-app-faint">
              Saving...
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="px-0.5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-app-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        aria-label={
          collapsed
            ? "Expand milestone calendars"
            : "Collapse milestone calendars"
        }
        title={
          collapsed
            ? "Expand milestone calendars"
            : "Collapse milestone calendars"
        }
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed((prev) => !prev);
          if (!collapsed) {
            setEditingKey(null);
          }
        }}
      >
        <span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] leading-tight text-app-base">
            Milestone Calendars
          </span>
          <span className="block text-[11px] leading-tight text-app-faint">
            {enabledCount === 0 ? "Off" : `${enabledCount}/2 enabled`}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-accent">
          {collapsed ? "Configure" : "Hide"}
          <ChevronRightIcon
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`}
          />
        </span>
      </button>
      {!collapsed ? (
        <div className="mt-1 pl-2 divide-y divide-app-edge">
          {renderRow(
            "birthdays",
            "Birthdays",
            birthdaySettings,
            `${item.display_name} Birthdays`,
          )}
          {renderRow(
            "anniversaries",
            "Anniversaries",
            anniversarySettings,
            `${item.display_name} Anniversaries`,
          )}
        </div>
      ) : null}
    </div>
  );
}
