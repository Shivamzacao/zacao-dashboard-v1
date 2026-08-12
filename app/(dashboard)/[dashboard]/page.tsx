import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { dashboardSlugToSection } from "@/src/application/api/catalog";
import type { DashboardFilters, IsoDate, SourceStatus } from "@/src/domain/contracts";
import { dateInTimeZone } from "@/src/domain/utilities/time";
import { parseFrontendFilterState } from "@/src/presentation/filters/url-filter-state";
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

function toSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) query.set(key, single);
  }
  return query;
}

async function loadLiveDisplayData(
  slug: keyof typeof dashboardSlugToSection,
  filters: DashboardFilters,
): Promise<{ display: DashboardPageDisplayData; headerSource: SourceStatus | undefined }> {
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

  // Canonicalise the filter query here rather than letting the client hook
  // rewrite it after mount: that rewrite re-ran the whole dynamic render, so
  // every navigation paid for its upstream reads twice. Both sides derive the
  // reporting date from the same layout clock and share this parser, so the
  // redirect settles in one hop.
  const requested = toSearchParams(await searchParams);
  const today = dateInTimeZone(new Date(), "America/New_York") as IsoDate;
  const filterState = parseFrontendFilterState(
    requested,
    backendApiService.supportedFilters,
    today,
  );
  if (requested.toString() !== filterState.query) {
    redirect(`/${route.slug}?${filterState.query}`);
  }

  // Live mode renders certified backend view models; fixture mode preserves
  // the Phase 2 synthetic contract for tests, previews, and visual baselines.
  const liveMode = process.env["ZACAO_DATA_MODE"] === "live";
  if (liveMode) {
    const { display, headerSource } = await loadLiveDisplayData(route.slug, filterState.filters);
    return (
      <main className="dashboard-content">
        <PageHeader route={route} source={headerSource} dataMode="live" />
        <DashboardPageView spec={dashboardPageSpec(route.slug)} fixture={display} />
      </main>
    );
  }

  const shell = phase2FixtureProvider.getShellContext();
  const pageFixture = phase2FixtureProvider.getF3PageData(route.slug);
  return (
    <main className="dashboard-content">
      <PageHeader route={route} source={shell.sources[0]} />
      <DashboardPageView spec={dashboardPageSpec(route.slug)} fixture={pageFixture} />
    </main>
  );
}
