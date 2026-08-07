import type { SourceStatus } from "@/src/domain/contracts";
import type { DashboardRouteDefinition } from "@/src/presentation/shell/routes";

function formatDataAsOf(source: SourceStatus | undefined): string {
  if (!source?.dataAsOf) return "Data time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(source.dataAsOf));
}

interface PageHeaderProps {
  readonly route: DashboardRouteDefinition;
  readonly source: SourceStatus | undefined;
}

export function PageHeader({ route, source }: PageHeaderProps) {
  return (
    <header className="page-heading">
      <div>
        <p className="page-eyebrow">{route.eyebrow}</p>
        <h1>{route.title}</h1>
        <p className="page-description">{route.description}</p>
      </div>
      <div className="freshness-pill" aria-label="Synthetic TEST data freshness">
        <span className="freshness-dot" />
        <span>TEST fixture · data as of {formatDataAsOf(source)}</span>
      </div>
    </header>
  );
}
