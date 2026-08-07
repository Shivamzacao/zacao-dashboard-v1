import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FixtureReadinessShell } from "@/src/presentation/components/fixture-readiness-shell";
import { PageHeader } from "@/src/presentation/components/page-header";
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

  return (
    <main className="dashboard-content">
      <PageHeader route={route} source={fixture.sources[0]} />
      <FixtureReadinessShell route={route} />
    </main>
  );
}
