"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { DashboardSidebar } from "./dashboard-sidebar";
import { FilterPendingOverlay } from "./filter-pending-overlay";
import { GlobalFilterBar } from "./global-filter-bar";
import { TopBar } from "./top-bar";
import { useDashboardUrlFilters } from "@/src/presentation/filters/use-dashboard-url-filters.client";
import { dashboardRouteByPath, exportDatasetsForRoute } from "@/src/presentation/shell/routes";

import type { FilterOptions } from "@/src/application/api";
import type { IsoDate } from "@/src/domain/contracts";

interface DashboardShellClientProps {
  readonly children: React.ReactNode;
  readonly supportedFilters: FilterOptions;
  readonly today: IsoDate;
  readonly dataMode?: "fixture" | "live";
}

export function DashboardShellClient({
  children,
  supportedFilters,
  today,
  dataMode = "fixture",
}: DashboardShellClientProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { state, push, selectPreset, pending } = useDashboardUrlFilters(supportedFilters, today);
  const activeRoute = dashboardRouteByPath(pathname);
  const exportDataset = activeRoute ? exportDatasetsForRoute(activeRoute.slug)[0] : undefined;
  const exportHref = exportDataset ? "/api/v1/exports/" + exportDataset + "?" + state.query : null;

  useEffect(() => {
    if (!navigationOpen) return;
    document.querySelector<HTMLButtonElement>(".sidebar-close")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavigationOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen]);

  useEffect(() => {
    if (dataMode !== "live") return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refresh, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dataMode, router]);

  const closeNavigation = () => {
    if (!navigationOpen) return;
    setNavigationOpen(false);
    menuButtonRef.current?.focus();
  };

  return (
    <div className="dashboard-shell">
      <div id="dashboard-sidebar">
        <DashboardSidebar
          open={navigationOpen}
          pathname={pathname}
          query={state.query}
          onClose={closeNavigation}
          dataMode={dataMode}
        />
      </div>
      <div className="dashboard-main">
        <TopBar
          state={state}
          onPresetChange={selectPreset}
          onFilterChange={push}
          onOpenNavigation={() => setNavigationOpen(true)}
          navigationOpen={navigationOpen}
          menuButtonRef={menuButtonRef}
          exportHref={exportHref}
          supportedComparisons={supportedFilters.comparisons}
          pending={pending}
        />
        <GlobalFilterBar
          filters={state.filters}
          supported={supportedFilters}
          onFilterChange={push}
        />
        <div className="dashboard-view" data-pending={pending ? "" : undefined} aria-busy={pending}>
          {children}
          {pending ? <FilterPendingOverlay /> : null}
        </div>
      </div>
    </div>
  );
}
