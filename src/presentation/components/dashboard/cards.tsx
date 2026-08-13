import type { ReactNode } from "react";

import { formatDateTime, formatKpiDisplayValue, fullDisplayValue } from "./format-display-value";
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

export function SourceBadge({ label }: { readonly label: string }) {
  // `title` keeps the full provenance readable when a narrow card ellipsises
  // the pill.
  return (
    <span className="source-badge" title={`Source: ${label}`}>
      Source: {label}
    </span>
  );
}

export function KpiCard({ model }: { readonly model: KpiDisplayModel }) {
  const isValueAvailable =
    model.value !== null && ["current", "partial", "stale"].includes(model.state);
  const displayedValue = formatKpiDisplayValue(model.value, {
    ...(model.valuePresentation ? { presentation: model.valuePresentation } : {}),
    ...(model.unitSuffix ? { unitSuffix: model.unitSuffix } : {}),
  });
  const accessibleValue =
    model.valuePresentation === "ratio"
      ? displayedValue
      : `${fullDisplayValue(model.value)}${model.unitSuffix ? ` ${model.unitSuffix}` : ""}`;
  return (
    <article
      className={`kpi-card state-${model.state}`}
      aria-label={`${model.label}: ${isValueAvailable ? accessibleValue : stateLabel(model.state)}`}
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
        <p className="kpi-card-value" title={accessibleValue}>
          {displayedValue}
        </p>
      ) : (
        <StateSurface
          state={model.state === "current" ? "unavailable" : model.state}
          description={model.unavailableReason}
          compact
        />
      )}
      {/* Provenance and readiness live on their own row at the foot of the
          card. Both used to sit in the label row, where the state label was
          pinned over the source pill and the help marker. */}
      {model.sourceLabel || (isValueAvailable && model.state !== "current") ? (
        <div className="kpi-card-bottom">
          {isValueAvailable && model.state !== "current" ? (
            <span className="kpi-state-label">{stateLabel(model.state)}</span>
          ) : null}
          {model.sourceLabel ? <SourceBadge label={model.sourceLabel} /> : null}
        </div>
      ) : null}
    </article>
  );
}

interface MessageCardProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly tone?: "insight" | "warning" | "danger";
  readonly metadata?: readonly string[];
  readonly headingLevel?: 2 | 3;
  readonly showSeverity?: boolean;
}

export function InsightCard({
  title,
  children,
  tone = "insight",
  metadata = [],
  headingLevel = 3,
  showSeverity = false,
}: MessageCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={`message-card message-${tone}`}>
      <span className="message-icon" aria-hidden="true">
        {tone === "insight" ? "✦" : "!"}
      </span>
      <div>
        <div className="message-heading-row">
          <Heading>{title}</Heading>
          {showSeverity ? (
            <span className={`severity-badge severity-${tone}`}>
              {tone === "danger" ? "High" : tone === "warning" ? "Medium" : "Low"}
            </span>
          ) : null}
        </div>
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
  props: Omit<MessageCardProps, "tone"> & {
    readonly severity?: "insight" | "warning" | "danger";
  },
) {
  return <InsightCard {...props} tone={props.severity ?? "warning"} showSeverity />;
}

export function SourceIndicator({ model }: { readonly model: SourceIndicatorModel }) {
  const date = model.dataAsOf ? formatDateTime(model.dataAsOf) : "Unavailable";
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
