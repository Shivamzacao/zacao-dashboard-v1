"use client";

import { ShellIcon } from "./shell-icon";

import type {
  DateRangePreset,
  FrontendFilterState,
} from "@/src/presentation/filters/url-filter-state";

const dateLabels: Readonly<Record<DateRangePreset, string>> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  year_to_date: "Year to date",
  last_12_months: "Last 12 months",
};

interface TopBarProps {
  readonly state: FrontendFilterState;
  readonly onPresetChange: (preset: DateRangePreset) => void;
  readonly onOpenNavigation: () => void;
  readonly navigationOpen: boolean;
  readonly menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  readonly exportHref: string | null;
  /** A filter change is still waiting on the server render. */
  readonly pending?: boolean;
}

export function TopBar({
  state,
  onPresetChange,
  onOpenNavigation,
  navigationOpen,
  menuButtonRef,
  exportHref,
  pending = false,
}: TopBarProps) {
  return (
    <header className="dashboard-topbar">
      <button
        ref={menuButtonRef}
        className="mobile-menu-button"
        type="button"
        aria-label="Open navigation"
        aria-controls="dashboard-sidebar"
        aria-expanded={navigationOpen}
        onClick={onOpenNavigation}
      >
        <ShellIcon name="menu" />
      </button>
      <div className="topbar-spacer" />
      <div className="topbar-controls" data-pending={pending ? "" : undefined}>
        <label className="control-field date-control">
          <span className="sr-only">Reporting period</span>
          <ShellIcon name="calendar" size={16} />
          <select
            aria-label="Reporting period"
            value={state.preset === "custom" ? "custom" : state.preset}
            onChange={(event) => {
              if (event.target.value !== "custom") {
                onPresetChange(event.target.value as DateRangePreset);
              }
            }}
          >
            {Object.entries(dateLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            {state.preset === "custom" ? <option value="custom">Custom period</option> : null}
          </select>
        </label>
        {exportHref ? (
          <a className="export-trigger" href={exportHref} aria-label="Export approved CSV">
            <ShellIcon name="download" size={16} />
            <span>Export</span>
          </a>
        ) : (
          <button
            className="export-trigger"
            type="button"
            disabled
            title="No approved export dataset for this section"
          >
            <ShellIcon name="download" size={16} />
            <span>Export</span>
          </button>
        )}
      </div>
    </header>
  );
}
