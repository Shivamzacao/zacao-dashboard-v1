// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";

import DashboardError from "@/app/(dashboard)/error";
import DashboardNotFound from "@/app/(dashboard)/not-found";
import { FixtureReadinessShell } from "@/src/presentation/components/fixture-readiness-shell";
import { LoadingPageShell } from "@/src/presentation/components/loading-page-shell";
import { PageHeader } from "@/src/presentation/components/page-header";
import { SidebarNavigation } from "@/src/presentation/components/sidebar-navigation";
import { phase2FixtureProvider } from "@/src/presentation/providers/fixture-dashboard-provider";
import {
  dashboardRouteBySlug,
  dashboardRoutes,
  isDashboardRouteActive,
  utilityRoutes,
} from "@/src/presentation/shell/routes";

afterEach(cleanup);

describe("F1 shell components", () => {
  it("renders all and only approved V1 destinations with active-route semantics", () => {
    render(
      <SidebarNavigation
        pathname="/products"
        query="start=2025-08-08&end=2026-08-07&comparison=none"
      />,
    );
    // Nine dashboard destinations plus the Data import utility route.
    expect(screen.getAllByRole("link")).toHaveLength(10);
    expect(
      screen.getByRole("link", { name: /Product intelligence/ }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.queryByText(/settings|administrator|profile/i)).toBeNull();
    expect(dashboardRoutes.map((route) => route.href)).toEqual([
      "/executive",
      "/revenue",
      "/customers",
      "/products",
      "/operations",
      "/marketing",
      "/growth",
      "/financial",
      "/insights",
    ]);
    expect(utilityRoutes.map((route) => route.href)).toEqual(["/import"]);
    expect(isDashboardRouteActive("/products/detail", "/products")).toBe(true);
  });

  it("supports arrow, Home, and End navigation without changing routes", () => {
    render(<SidebarNavigation pathname="/executive" query="start=2025-08-08" />);
    const links = screen.getAllByRole("link");
    links[0]?.focus();
    fireEvent.keyDown(links[0] as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(links[1]);
    fireEvent.keyDown(links[1] as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(links[9]);
    fireEvent.keyDown(links[9] as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(links[0]);
  });

  it("renders truthful page, readiness, loading, error, and not-found shells", () => {
    const route = dashboardRouteBySlug("executive");
    if (!route) throw new Error("Executive route must exist");
    const source = phase2FixtureProvider.getShellContext().sources[0];
    const { rerender } = render(<PageHeader route={route} source={source} />);
    expect(screen.getByRole("heading", { name: "Executive health" })).toBeTruthy();
    expect(screen.getByLabelText("Synthetic TEST data freshness").textContent).toContain(
      "TEST fixture",
    );

    rerender(<FixtureReadinessShell route={route} />);
    expect(screen.getByText(/No production source is connected/)).toBeTruthy();

    rerender(<LoadingPageShell />);
    expect(screen.getByLabelText("Loading dashboard section")).toBeTruthy();

    rerender(<DashboardError error={new Error("hidden")} reset={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("No source data was changed");

    rerender(<DashboardNotFound />);
    expect(screen.getByText(/not approved for V1/)).toBeTruthy();
  });

  it("has no automated WCAG violations in the F1 shell primitives", async () => {
    const route = dashboardRouteBySlug("executive");
    if (!route) throw new Error("Executive route must exist");
    const source = phase2FixtureProvider.getShellContext().sources[0];
    const { container } = render(
      <main>
        <SidebarNavigation pathname="/executive" query="start=2025-08-08" />
        <PageHeader route={route} source={source} />
        <FixtureReadinessShell route={route} />
      </main>,
    );
    const results = await axe.run(container, {
      rules: {
        region: { enabled: false },
        "color-contrast": { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });
});
