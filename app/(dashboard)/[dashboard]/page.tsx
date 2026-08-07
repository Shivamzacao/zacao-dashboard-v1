import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/src/presentation/components/page-header";
import { DashboardPageView } from "@/src/presentation/features/dashboard-pages/dashboard-page.client";
import { dashboardPageSpec } from "@/src/presentation/features/dashboard-pages/page-specs";
import { phase2FixtureProvider } from "@/src/presentation/providers/fixture-dashboard-provider";
import { dashboardRouteBySlug, dashboardRoutes } from "@/src/presentation/shell/routes";

interface DashboardPageProps {
  readonly params: Promise<{ dashboard: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return dashboardRoutes.map((route) => ({ dashboard: route.slug }));
}

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const { dashboard } = await params;
  const route = dashboardRouteBySlug(dashboard);
  return route ? { title: route.title } : {};
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { dashboard } = await params;
  const route = dashboardRouteBySlug(dashboard);
  if (!route) notFound();

  const fixture = phase2FixtureProvider.getShellContext();
  const pageFixture = phase2FixtureProvider.getF3PageData();

  return (
    <main className="dashboard-content">
      <PageHeader route={route} source={fixture.sources[0]} />
      <DashboardPageView spec={dashboardPageSpec(route.slug)} fixture={pageFixture} />
    </main>
  );
}
