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
  HorizontalBarChartView,
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
    // One band per stage, each clipped to a trapezoid.
    const bands = [...document.querySelectorAll<HTMLElement>(".funnel-band-shape")];
    expect(bands).toHaveLength(3);
    const edgesOf = (band: HTMLElement | undefined) => {
      const points = /polygon\(([^)]*)\)/.exec(band?.getAttribute("style") ?? "")?.[1] ?? "";
      const xs = points.split(",").map((pair) => Number.parseFloat(pair.trim()));
      // A trapezoid is two top corners then two bottom corners, so its top and
      // bottom widths are the spans of the first and last pair of x values.
      return [(xs[1] ?? 0) - (xs[0] ?? 0), (xs[2] ?? 0) - (xs[3] ?? 0)];
    };
    const edges = bands.flatMap((band, index) =>
      index === 0 ? edgesOf(band) : edgesOf(band).slice(1),
    );
    // Every edge is narrower than the one above it: the silhouette tapers the
    // whole way down instead of dropping to a floor and drawing straight sides.
    expect(edges[0]).toBeCloseTo(100, 1);
    edges.slice(1).forEach((width, index) => {
      expect(width).toBeLessThan(edges[index] ?? 0);
    });
    expect(edges[edges.length - 1]).toBeGreaterThan(0);
    // jsdom has no layout, so the bands cannot measure themselves and fall back
    // to the share estimate: the closing band prints its count beside the taper
    // instead of clipping it inside.
    expect(document.querySelectorAll(".funnel-band-value-outside")).toHaveLength(1);
    // Neighbouring stages never share a colour.
    const colours = bands.map(
      (band) => /background:\s*([^;]+)/.exec(band.getAttribute("style") ?? "")?.[1] ?? "",
    );
    expect(new Set(colours).size).toBe(bands.length);
  });

  it("keeps the funnel tapering when the stages barely move", () => {
    // Flat stages are the other end of the range: proportional widths alone
    // would draw a straight-sided tube rather than a funnel.
    render(
      <FunnelChartView
        title="Flat funnel"
        valueFormat="count"
        data={[
          { key: "a", label: "A", value: 100 },
          { key: "b", label: "B", value: 100 },
          { key: "c", label: "C", value: 99 },
        ]}
      />,
    );
    const widths = [...document.querySelectorAll<HTMLElement>(".funnel-band-shape")].flatMap(
      (band) => {
        const points = /polygon\(([^)]*)\)/.exec(band.getAttribute("style") ?? "")?.[1] ?? "";
        const xs = points.split(",").map((pair) => Number.parseFloat(pair.trim()));
        return [(xs[1] ?? 0) - (xs[0] ?? 0), (xs[2] ?? 0) - (xs[3] ?? 0)];
      },
    );
    widths.forEach((width, index) => {
      if (index % 2 === 1) expect(width).toBeLessThan(widths[index - 1] ?? 0);
    });
  });

  it("ranks a long-tail breakdown, binds each label to its own value, and discloses the tail", () => {
    const regions = [
      { key: "ny", label: "New York, United States", value: 71 },
      { key: "ca", label: "California, United States", value: 41 },
      { key: "nj", label: "New Jersey, United States", value: 11 },
      { key: "fl", label: "Florida, United States", value: 9 },
      { key: "ct", label: "Connecticut, United States", value: 5 },
      { key: "mo", label: "Missouri, United States", value: 3 },
      { key: "ga", label: "Georgia, United States", value: 3 },
      { key: "nc", label: "North Carolina, United States", value: 3 },
      { key: "tx", label: "Texas, United States", value: 2 },
      { key: "ab", label: "Alberta, Canada", value: 1 },
    ];
    // Deliberately unsorted input: the view ranks, so a label can never be
    // painted beside a bar that belongs to a different category.
    render(
      <HorizontalBarChartView title="Customer geography" valueFormat="count" data={regions} />,
    );

    const rows = [...document.querySelectorAll(".ranked-bar")];
    expect(rows).toHaveLength(9);
    expect(rows[0]?.textContent).toContain("New York, United States");
    expect(rows[0]?.textContent).toContain("71");
    // The two smallest fall past the row limit and are summarised, not dropped.
    expect(rows[8]?.textContent).toContain("2 more");
    expect(rows[8]?.textContent).toContain("3");
    // The widest bar belongs to the largest value.
    const fills = [...document.querySelectorAll<HTMLElement>(".ranked-bar-fill")];
    expect(fills[0]?.style.width).toBe("100%");
    expect(Number.parseFloat(fills[1]?.style.width ?? "0")).toBeCloseTo(57.7, 0);
    // Every category still reaches assistive tech through the data table.
    expect(screen.getAllByText("Alberta, Canada").length).toBeGreaterThan(0);
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
