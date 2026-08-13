import { dashboardSlugToSection, drilldownCatalog } from "@/src/application/api";

import type { DashboardSlug } from "@/src/application/api";

export type ShellIconName =
  | "executive"
  | "revenue"
  | "customers"
  | "products"
  | "operations"
  | "marketing"
  | "growth"
  | "financial"
  | "insights"
  | "import";

export interface DashboardRouteDefinition {
  readonly slug: DashboardSlug;
  readonly href: string;
  readonly section: (typeof dashboardSlugToSection)[DashboardSlug];
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly icon: ShellIconName;
  readonly availability: "core" | "conditional";
}

const route = (
  slug: DashboardSlug,
  eyebrow: string,
  title: string,
  description: string,
  availability: "core" | "conditional" = "core",
): DashboardRouteDefinition =>
  Object.freeze({
    slug,
    href: "/" + slug,
    section: dashboardSlugToSection[slug],
    eyebrow,
    title,
    description,
    icon: slug,
    availability,
  });

export const dashboardRoutes = Object.freeze([
  route(
    "executive",
    "ZACAO Executive Intelligence",
    "Executive health",
    "A clear view of the signals that need leadership attention.",
  ),
  route(
    "revenue",
    "Commercial performance",
    "Revenue Intelligence",
    "Sales performance, order economics, channels, and momentum.",
  ),
  route(
    "customers",
    "Customer health",
    "Customer Intelligence",
    "Acquisition, retention, value, and customer behavior.",
  ),
  route(
    "products",
    "Portfolio performance",
    "Product Intelligence",
    "Product demand, velocity, mix, and inventory readiness.",
  ),
  route(
    "operations",
    "Operational readiness",
    "Operations Intelligence",
    "Fulfillment, inventory, forecast, and production readiness.",
    "conditional",
  ),
  route(
    "marketing",
    "Growth efficiency",
    "Marketing Intelligence",
    "Store funnel and approved channel performance signals.",
  ),
  route(
    "growth",
    "Opportunity pipeline",
    "Growth Intelligence",
    "Partnership, ambassador, and opportunity readiness.",
    "conditional",
  ),
  route(
    "financial",
    "Financial health",
    "Financial Intelligence",
    "Approved actual, plan, cost, and cash-readiness signals.",
    "conditional",
  ),
  route(
    "insights",
    "Decision support",
    "Insights and data quality",
    "Deterministic alerts, source readiness, and data-quality evidence.",
  ),
] satisfies readonly DashboardRouteDefinition[]);

export interface UtilityRouteDefinition {
  readonly href: string;
  readonly title: string;
  readonly icon: ShellIconName;
}

/**
 * Non-dashboard shell destinations. Kept separate from `dashboardRoutes`
 * because those are typed to approved dashboard slugs and drive the metric
 * catalog; utility pages carry no metrics or sections.
 */
export const utilityRoutes: readonly UtilityRouteDefinition[] = Object.freeze([
  // Temporarily hidden from the sidebar.
  // Object.freeze({ href: "/import", title: "Data import", icon: "import" as const }),
]);

export function dashboardRouteBySlug(slug: string): DashboardRouteDefinition | undefined {
  return dashboardRoutes.find((item) => item.slug === slug);
}

export function dashboardRouteByPath(pathname: string): DashboardRouteDefinition | undefined {
  return dashboardRoutes.find((item) => item.href === pathname);
}

export function isDashboardRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function exportDatasetsForRoute(slug: DashboardSlug): readonly string[] {
  const section = dashboardSlugToSection[slug];
  return drilldownCatalog
    .filter((item) => item.section === section && item.exportable)
    .map((item) => item.dataset);
}
