// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ChartCard,
  KpiCard,
  ReadinessCard,
  SourceIndicator,
} from "@/src/presentation/components/dashboard/cards";
import {
  FunnelChartView,
  LineChartView,
} from "@/src/presentation/components/dashboard/charts.client";
import {
  DataTable,
  type DashboardTableColumn,
} from "@/src/presentation/components/dashboard/data-table.client";
import { DetailDrawer } from "@/src/presentation/components/dashboard/detail-drawer.client";
import { ExportStatus } from "@/src/presentation/components/dashboard/export-status.client";
import { formatDisplayValue } from "@/src/presentation/components/dashboard/format-display-value";
import { StateSurface } from "@/src/presentation/components/dashboard/state-surface";
import {
  AccessibleTooltip,
  ChartLegend,
} from "@/src/presentation/components/dashboard/tooltip-legend";

afterEach(cleanup);

describe("F2 reusable dashboard components", () => {
  it("formats provider-neutral values and preserves valid zero, negative, fractional, and large values", () => {
    expect(formatDisplayValue({ kind: "count", value: 0 })).toBe("0");
    expect(formatDisplayValue({ kind: "quantity", value: 12.75 })).toBe("12.75");
    expect(
      formatDisplayValue({ kind: "money", value: { currency: "USD", minorUnits: -125050 } }),
    ).toBe("-$1,250.50");
    expect(
      formatDisplayValue({ kind: "money", value: { currency: "USD", minorUnits: 98765432100 } }),
    ).toBe("$987,654,321.00");
    expect(formatDisplayValue({ kind: "rate_basis_points", value: 264 })).toBe("2.64%");
    expect(formatDisplayValue(null)).toBe("Unavailable");
  });

  it("renders zero as data and null as a truthful readiness state", () => {
    const { rerender } = render(
      <KpiCard model={{ label: "Orders", value: { kind: "count", value: 0 }, state: "current" }} />,
    );
    expect(screen.getByLabelText("Orders: 0")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    rerender(<KpiCard model={{ label: "Margin", value: null, state: "business_rule_required" }} />);
    expect(screen.getByText("Business rule required")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("covers every approved presentation readiness state without provider logic", () => {
    const states = [
      "loading",
      "empty",
      "no_activity",
      "not_configured",
      "data_pending",
      "business_rule_required",
      "source_limited",
      "partial",
      "stale",
      "invalid",
      "unavailable",
      "error",
    ] as const;
    const { container } = render(
      <>
        {states.map((state) => (
          <StateSurface key={state} state={state} compact />
        ))}
      </>,
    );
    expect(container.querySelectorAll(".state-surface")).toHaveLength(states.length);
    expect(screen.getByText("Source limited")).toBeTruthy();
    expect(screen.getByText("Data is stale")).toBeTruthy();
  });

  it("handles unavailable and partial chart data without fabricating points", () => {
    const { rerender } = render(
      <LineChartView
        title="Revenue"
        summary="No approved points."
        data={null}
        state="unavailable"
      />,
    );
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    rerender(
      <LineChartView
        title="Revenue"
        summary="One point is present."
        data={[
          { key: "one", label: "Only point", value: 0 },
          { key: "missing", label: "Missing", value: null },
        ]}
        state="partial"
      />,
    );
    expect(screen.getByText("One point is present.")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Revenue data" })).toBeTruthy();
    expect(screen.getAllByRole("cell", { name: "Unavailable" })).toHaveLength(3);
  });

  it("supports deterministic sorting, bounded pagination, and drill-down triggers", async () => {
    interface Row {
      readonly id: string;
      readonly label: string;
      readonly amount: number;
    }
    const columns: readonly DashboardTableColumn<Row>[] = [
      { key: "label", label: "Label", sortable: true },
      { key: "amount", label: "Amount", sortable: true, numeric: true },
    ];
    const onOpen = vi.fn();
    const onPage = vi.fn();
    render(
      <DataTable
        caption="Fixture rows"
        columns={columns}
        rows={[
          { id: "b", label: "Beta", amount: 2 },
          { id: "a", label: "Alpha", amount: 1 },
        ]}
        rowKey={(row) => row.id}
        page={0}
        pageSize={2}
        totalRows={4}
        onPageChange={onPage}
        onRowOpen={onOpen}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sort by Label" }));
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows[0]?.textContent).toContain("Alpha");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole("button", { name: "View details for a" }));
    expect(onOpen).toHaveBeenCalledWith({ id: "a", label: "Alpha", amount: 1 });
  });

  it("supports drawer Escape/close focus behavior and truthful export states", async () => {
    const onClose = vi.fn();
    const trigger = { current: document.createElement("button") };
    const { rerender } = render(
      <DetailDrawer
        open
        title="Order detail"
        state="source_limited"
        onClose={onClose}
        returnFocusRef={trigger}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Order detail" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBe(document.activeElement);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<ExportStatus state="unsupported" />);
    expect(
      (screen.getByRole("button", { name: "Export unavailable" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    rerender(<ExportStatus state="failure" />);
    expect(screen.getByRole("alert").textContent).toContain("Try again");
  });

  it("provides keyboard tooltip disclosure, legend labels, source context, and readiness semantics", async () => {
    render(
      <>
        <AccessibleTooltip label="Full source definition">
          <span>?</span>
        </AccessibleTooltip>
        <ChartLegend items={[{ key: "actual", label: "Actual", tone: "forest" }]} />
        <SourceIndicator
          model={{ label: "Shopify", state: "stale", dataAsOf: "2026-08-07T14:00:00Z" }}
        />
        <ReadinessCard title="Klaviyo" state="no_activity" />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "?" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("tooltip").textContent).toContain("Full source definition");
    expect(screen.getByLabelText("Chart legend").textContent).toContain("Actual");
    expect(screen.getByLabelText(/Shopify: Data is stale/)).toBeTruthy();
    expect(screen.getByText("No activity")).toBeTruthy();
  });

  it("keeps every funnel stage readable when volumes span two orders of magnitude", () => {
    render(
      <FunnelChartView
        title="Store funnel"
        valueFormat="count"
        data={[
          { key: "sessions", label: "Sessions", value: 6210 },
          { key: "cart", label: "Cart additions", value: 187 },
          { key: "purchase", label: "Completed checkout", value: 67 },
        ]}
      />,
    );
    // Counts must be on screen: a 67-wide stage is invisible as a shape alone.
    expect(screen.getAllByText("6,210").length).toBeGreaterThan(0);
    expect(screen.getAllByText("187").length).toBeGreaterThan(0);
    expect(screen.getAllByText("67").length).toBeGreaterThan(0);
    // Step-over-step conversion carries the drop-off the bar widths cannot.
    expect(screen.getByText("3.0% of previous")).toBeTruthy();
    expect(screen.getByText("35.8% of previous")).toBeTruthy();
    expect(screen.getByText("entry")).toBeTruthy();
    // The silhouette keeps one band per stage, and the closing band stays wide
    // enough to read rather than tapering to a sub-pixel line.
    const bands = document.querySelectorAll<SVGPolygonElement>(".funnel-shape polygon");
    expect(bands).toHaveLength(3);
    const widthOf = (band: SVGPolygonElement | null) => {
      const xs = (band?.getAttribute("points") ?? "")
        .split(" ")
        .map((point) => Number.parseFloat(point.split(",")[0] ?? "0"));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(widthOf(bands[0] ?? null)).toBeCloseTo(100, 1);
    expect(widthOf(bands[2] ?? null)).toBeGreaterThanOrEqual(7);
  });

  it("omits the in-frame summary when the enclosing card already carries the copy", () => {
    const { container, rerender } = render(
      <FunnelChartView title="Store funnel" data={[{ key: "a", label: "A", value: 5 }]} />,
    );
    expect(container.querySelectorAll(".chart-summary")).toHaveLength(0);
    rerender(
      <FunnelChartView
        title="Store funnel"
        summary="Standalone description."
        data={[{ key: "a", label: "A", value: 5 }]}
      />,
    );
    expect(screen.getByText("Standalone description.")).toBeTruthy();
  });

  it("has no automated WCAG violations in representative F2 primitives", async () => {
    const { container } = render(
      <main>
        <KpiCard
          model={{
            label: "Net sales",
            value: { kind: "money", value: { currency: "USD", minorUnits: 120000 } },
            state: "current",
            helpText: "Gross less discounts and returns.",
          }}
        />
        <ChartCard title="Readiness">
          <StateSurface state="partial" />
        </ChartCard>
        <ExportStatus state="idle" />
      </main>,
    );
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
