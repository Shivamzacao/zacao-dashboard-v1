import type { SourceStatus } from "@/src/domain/contracts";
import { formatDate } from "@/src/presentation/components/dashboard/format-display-value";
import type { DashboardRouteDefinition } from "@/src/presentation/shell/routes";

function formatDataAsOf(source: SourceStatus | undefined): string {
  if (!source?.dataAsOf) return "Data time unavailable";
  return formatDate(new Date(source.dataAsOf));
}

interface PageHeaderProps {
  readonly route: DashboardRouteDefinition;
  readonly source: SourceStatus | undefined;
  readonly dataMode?: "fixture" | "live";
}

export function PageHeader({ route, source, dataMode = "fixture" }: PageHeaderProps) {
  const label = dataMode === "live" ? "Live data" : "TEST fixture";
  return (
    <header className="page-heading">
      <div>
        <p className="page-eyebrow">{route.eyebrow}</p>
        <h1>{route.title}</h1>
        <p className="page-description">{route.description}</p>
      </div>
      <div
        className="freshness-pill"
        aria-label={dataMode === "live" ? "Live data freshness" : "Synthetic TEST data freshness"}
      >
        <span className="freshness-dot" />
        {/* Keep the label and date as two text nodes exactly like the F3
            baseline; extra node splits shift text shaping by a pixel and
            break the approved visual-regression snapshots. */}
        <span>
          {`${label} · data as of `}
          {formatDataAsOf(source)}
        </span>
      </div>
    </header>
  );
}
