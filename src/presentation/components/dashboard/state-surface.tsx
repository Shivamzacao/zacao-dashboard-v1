import type { DisplayState, StateCopy } from "./display-contracts";

const defaultCopy: Record<DisplayState, StateCopy> = {
  loading: { title: "Loading data", description: "The latest validated data is being prepared." },
  current: { title: "Current", description: "The latest validated source data is available." },
  empty: { title: "No records", description: "No records match the selected filters." },
  no_activity: {
    title: "No activity",
    description: "The source is connected but reported no activity.",
  },
  not_configured: { title: "Not configured", description: "This source has not been configured." },
  data_pending: {
    title: "Data pending",
    description: "The required source data has not arrived yet.",
  },
  business_rule_required: {
    title: "Business rule required",
    description: "A definition must be approved before this value can be calculated.",
  },
  source_limited: {
    title: "Source limited",
    description: "The connected source cannot provide the complete requested detail.",
  },
  partial: { title: "Partial data", description: "Some source records or history are incomplete." },
  stale: {
    title: "Data is stale",
    description: "The last valid result is older than its freshness target.",
  },
  invalid: {
    title: "Invalid source data",
    description: "Invalid rows were excluded from this result.",
  },
  unavailable: { title: "Unavailable", description: "This value is not currently available." },
  error: {
    title: "Unable to load",
    description: "The component could not load its validated data.",
  },
};

interface StateSurfaceProps {
  readonly state: Exclude<DisplayState, "current">;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly compact?: boolean;
}

export function StateSurface({ state, title, description, compact = false }: StateSurfaceProps) {
  const copy = defaultCopy[state];
  return (
    <div
      className={`state-surface state-${state}${compact ? " state-surface-compact" : ""}`}
      role={state === "error" || state === "invalid" ? "alert" : "status"}
    >
      <span className="state-symbol" aria-hidden="true" />
      <div>
        <strong>{title ?? copy.title}</strong>
        <p>{description ?? copy.description}</p>
      </div>
    </div>
  );
}

export function stateLabel(state: DisplayState): string {
  return defaultCopy[state].title;
}
