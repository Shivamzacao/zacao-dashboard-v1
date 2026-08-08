import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { dashboardSlugToSection } from "@/src/application/api/catalog";
import { parseDashboardFilters } from "@/src/application/api/query";
import type { SourceStatus } from "@/src/domain/contracts";
import { dateInTimeZone } from "@/src/domain/utilities/time";
import { backendApiService } from "@/src/infrastructure/api/handlers";
import { PageHeader } from "@/src/presentation/components/page-header";
import { DashboardPageView } from "@/src/presentation/features/dashboard-pages/dashboard-page.client";
import type { DashboardPageDisplayData } from "@/src/presentation/features/dashboard-pages/display-data";
import { dashboardPageSpec } from "@/src/presentation/features/dashboard-pages/page-specs";
import { mapDashboardPageToDisplayData } from "@/src/presentation/features/dashboard-pages/view-model-mapper";
import { phase2FixtureProvider } from "@/src/presentation/providers/fixture-dashboard-provider";
import { dashboardRouteBySlug, dashboardRoutes } from "@/src/presentation/shell/routes";

interface DashboardPageProps {
  readonly params: Promise<{ dashboard: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";
// Unknown slugs must 404 at the routing layer: a streamed dynamic render has
// already committed a 200 status by the time notFound() throws.
export const dynamicParams = false;

export function generateStaticParams() {
  return dashboardRoutes.map((route) => ({ dashboard: route.slug }));
}

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const { dashboard } = await params;
  const route = dashboardRouteBySlug(dashboard);
  return route ? { title: route.title } : {};
}

/** Rolling last-12-months window ending on today's reporting date. */
function defaultReportingRange(): { start: string; end: string } {
  const end = dateInTimeZone(new Date(), "America/New_York");
  const [year = 0, month = 0, day = 0] = end.split("-").map(Number);
  const startInstant = new Date(Date.UTC(year - 1, month - 1, day + 1));
  return { start: startInstant.toISOString().slice(0, 10), end };
}

async function loadLiveDisplayData(
  slug: keyof typeof dashboardSlugToSection,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<{ display: DashboardPageDisplayData; headerSource: SourceStatus | undefined }> {
  const defaults = defaultReportingRange();
  const query = new URLSearchParams();
  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  query.set("start", single(searchParams["start"]) ?? defaults.start);
  query.set("end", single(searchParams["end"]) ?? defaults.end);
  const comparison = single(searchParams["comparison"]);
  if (comparison) query.set("comparison", comparison);

  const filters = parseDashboardFilters(query, backendApiService.supportedFilters);
  const result = await backendApiService.dashboard(dashboardSlugToSection[slug], filters);
  return {
    display: mapDashboardPageToDisplayData(result.data.page, "production"),
    headerSource: result.data.page.sources[0],
  };
}

export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
  const { dashboard } = await params;
  const route = dashboardRouteBySlug(dashboard);
  if (!route) notFound();

  // Live mode renders certified backend view models; fixture mode preserves
  // the Phase 2 synthetic contract for tests, previews, and visual baselines.
  const liveMode = process.env["ZACAO_DATA_MODE"] === "live";
  if (liveMode) {
    const { display, headerSource } = await loadLiveDisplayData(route.slug, await searchParams);
    return (
      <main className="dashboard-content">
        <PageHeader route={route} source={headerSource} dataMode="live" />
        <DashboardPageView spec={dashboardPageSpec(route.slug)} fixture={display} />
      </main>
    );
  }

  const shell = phase2FixtureProvider.getShellContext();
  const pageFixture = phase2FixtureProvider.getF3PageData();
  return (
    <main className="dashboard-content">
      <PageHeader route={route} source={shell.sources[0]} />
      <DashboardPageView spec={dashboardPageSpec(route.slug)} fixture={pageFixture} />
    </main>
  );
}
