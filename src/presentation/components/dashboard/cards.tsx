import type { ReactNode } from "react";

import { formatDisplayValue, fullDisplayValue } from "./format-display-value";
import type { DisplayState, KpiDisplayModel, SourceIndicatorModel } from "./display-contracts";
import { StateSurface, stateLabel } from "./state-surface";
import { Tooltip } from "./tooltip.client";

interface CardShellProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function CardShell({
  eyebrow,
  title,
  description,
  actions,
  footer,
  children,
  className = "",
}: CardShellProps) {
  return (
    <section className={`dashboard-card ${className}`.trim()}>
      <header className="dashboard-card-header">
        <div>
          {eyebrow ? <p className="card-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </header>
      <div className="dashboard-card-content">{children}</div>
      {footer ? <footer className="dashboard-card-footer">{footer}</footer> : null}
    </section>
  );
}

export function ChartCard(props: CardShellProps) {
  return <CardShell {...props} className={`chart-card ${props.className ?? ""}`.trim()} />;
}

function Sparkline({
  values,
  label,
}: {
  readonly values: readonly number[];
  readonly label: string;
}) {
  const width = 90;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(values.length - 1, 1)) * width},${height - ((value - min) / span) * (height - 4) - 2}`,
    )
    .join(" ");
  return (
    <svg
      className="kpi-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label} trend: ${values.join(", ")}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function KpiCard({ model }: { readonly model: KpiDisplayModel }) {
  const isValueAvailable =
    model.value !== null && ["current", "partial", "stale"].includes(model.state);
  return (
    <article
      className={`kpi-card state-${model.state}`}
      aria-label={`${model.label}: ${isValueAvailable ? fullDisplayValue(model.value) : stateLabel(model.state)}`}
    >
      <div className="kpi-card-label-row">
        <p>{model.label}</p>
        {model.helpText ? (
          <Tooltip
            label={model.helpText}
            className="help-marker"
            accessibleName={`About ${model.label}`}
          >
            <span aria-hidden="true">?</span>
          </Tooltip>
        ) : null}
      </div>
      {isValueAvailable ? (
        <>
          <p className="kpi-card-value" title={fullDisplayValue(model.value)}>
            {formatDisplayValue(model.value)}
          </p>
          <div className="kpi-card-bottom">
            {model.comparison ? (
              <span className={`comparison-pill tone-${model.comparison.tone ?? "neutral"}`}>
                {model.comparison.value ?? "Comparison unavailable"}{" "}
                <span>{model.comparison.label}</span>
              </span>
            ) : (
              <span className="comparison-unavailable">Comparison unavailable</span>
            )}
            {model.sparkline && model.sparkline.length > 0 ? (
              <Sparkline values={model.sparkline} label={model.label} />
            ) : null}
          </div>
          {model.state !== "current" ? (
            <span className="kpi-state-label">{stateLabel(model.state)}</span>
          ) : null}
        </>
      ) : (
        <StateSurface
          state={model.state === "current" ? "unavailable" : model.state}
          description={model.unavailableReason}
          compact
        />
      )}
    </article>
  );
}

interface MessageCardProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly tone?: "insight" | "warning" | "danger";
  readonly metadata?: readonly string[];
}

export function InsightCard({
  title,
  children,
  tone = "insight",
  metadata = [],
}: MessageCardProps) {
  return (
    <article className={`message-card message-${tone}`}>
      <span className="message-icon" aria-hidden="true">
        {tone === "insight" ? "✦" : "!"}
      </span>
      <div>
        <h3>{title}</h3>
        <div className="message-copy">{children}</div>
        {metadata.length ? (
          <ul className="message-metadata" aria-label="Insight metadata">
            {metadata.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export function WarningCard(
  props: Omit<MessageCardProps, "tone"> & { readonly severity?: "warning" | "danger" },
) {
  return <InsightCard {...props} tone={props.severity ?? "warning"} />;
}

export function SourceIndicator({ model }: { readonly model: SourceIndicatorModel }) {
  const date = model.dataAsOf
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/New_York",
      }).format(new Date(model.dataAsOf))
    : "Unavailable";
  return (
    <div
      className={`source-indicator state-${model.state}`}
      aria-label={`${model.label}: ${stateLabel(model.state)}. Data as of ${date}`}
    >
      <span className="state-symbol" aria-hidden="true" />
      <div>
        <strong>{model.label}</strong>
        <span>
          {stateLabel(model.state)} · {date}
        </span>
        {model.detail ? <small>{model.detail}</small> : null}
      </div>
    </div>
  );
}

export function FreshnessIndicator({
  state,
  dataAsOf,
}: {
  readonly state: DisplayState;
  readonly dataAsOf: string | null;
}) {
  return <SourceIndicator model={{ label: "Data freshness", state, dataAsOf }} />;
}

export function ReadinessCard({
  title,
  state,
  message,
}: {
  readonly title: string;
  readonly state: DisplayState;
  readonly message?: string;
}) {
  return (
    <CardShell title={title} className="readiness-card">
      {state === "current" ? (
        <div className="ready-surface">
          <span className="state-symbol" aria-hidden="true" />
          <strong>Ready</strong>
          <p>{message ?? "Validated data is ready to display."}</p>
        </div>
      ) : (
        <StateSurface state={state} description={message} />
      )}
    </CardShell>
  );
}

export function TrendComparison({
  comparison,
}: {
  readonly comparison: NonNullable<KpiDisplayModel["comparison"]>;
}) {
  return (
    <div className={`trend-comparison tone-${comparison.tone ?? "neutral"}`}>
      <strong>{comparison.value ?? "Unavailable"}</strong>
      <span>{comparison.label}</span>
    </div>
  );
}
