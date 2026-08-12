import type { BackendApiRuntime, FilterOptions } from "@/src/application/api";
import { composeDashboardPage, createMetricViewModel } from "@/src/application/metrics";
import type { OrchestratedDashboardResult } from "@/src/application/orchestration";
import { metricTableViewModelSchema } from "@/src/application/view-models";
import type { DashboardFilters, SourceStatus } from "@/src/domain/contracts";
import type { DashboardSection } from "@/src/domain/metrics/catalog";

export const FIXED_NOW = new Date("2026-08-07T12:00:00.000Z");
export const API_QUERY = "start=2026-07-01&end=2026-07-31";

export function apiSource(state: SourceStatus["state"] = "current"): SourceStatus {
  const usable = ["current", "partial", "no_activity", "stale"].includes(state);
  return {
    source: "shopify",
    state,
    checkedAt: FIXED_NOW.toISOString(),
    lastSuccessfulAt: usable ? FIXED_NOW.toISOString() : null,
    dataAsOf: usable ? "2026-07-31T23:59:59.000Z" : null,
    completeness: state === "current" ? "complete" : state === "partial" ? "partial" : "unknown",
    warningCodes: state === "current" ? [] : [`SOURCE_${state.toUpperCase()}`],
  };
}

export class FixtureApiRuntime implements BackendApiRuntime {
  readonly environment = "test" as const;
  readonly supportedFilters: FilterOptions = {
    channels: ["Website/DTC"],
    productSkus: ["SYNTH-1", "SYNTH-2", "SYNTH-3"],
    locations: ["SYNTH-WAREHOUSE"],
  };

  async loadDashboard(
    section: DashboardSection,
    filters: DashboardFilters,
  ): Promise<OrchestratedDashboardResult> {
    const source = apiSource(section === "Customer Intelligence" ? "partial" : "current");
    const context = {
      environment: this.environment,
      dataPeriod: { startDate: filters.startDate, endDate: filters.endDate },
      sourceStatuses: [source],
    };
    const metrics = [];
    const tables = [];
    if (section === "Revenue Intelligence") {
      const metric = createMetricViewModel({
        metricKey: "revenue.channel_mix",
        environment: this.environment,
        dataPeriod: context.dataPeriod,
        sources: [source],
        value: { kind: "money", value: { currency: "USD", minorUnits: 59_800 } },
      });
      tables.push(
        metricTableViewModelSchema.parse({
          metric,
          columns: [
            "channel",
            "revenueMinorUnits",
            "orders",
            "averageOrderValueMinorUnits",
            "marginBasisPoints",
          ],
          rows: [
            {
              channel: "DTC — Site",
              revenueMinorUnits: 59_800,
              orders: 54,
              averageOrderValueMinorUnits: 1_107,
              marginBasisPoints: null,
            },
          ],
        }),
      );
    }
    if (section === "Product Intelligence") {
      const metric = createMetricViewModel({
        metricKey: "products.catalog",
        environment: this.environment,
        dataPeriod: context.dataPeriod,
        sources: [source],
        value: { kind: "status", value: "Current catalog" },
      });
      tables.push(
        metricTableViewModelSchema.parse({
          metric,
          columns: [
            "productId",
            "product",
            "status",
            "variantId",
            "variant",
            "sku",
            "priceMinorUnits",
          ],
          rows: [
            {
              productId: "p2",
              product: "+Synthetic Two",
              status: "active",
              variantId: "v2",
              variant: "Single",
              sku: "SYNTH-2",
              priceMinorUnits: 1200,
              email: "must-not-cross@example.com",
              providerRaw: "secret",
            },
            {
              productId: "p1",
              product: "=Synthetic One",
              status: "active",
              variantId: "v1",
              variant: "Single",
              sku: "SYNTH-1",
              priceMinorUnits: 1100,
            },
            {
              productId: "p3",
              product: "@Synthetic Three",
              status: "draft",
              variantId: "v3",
              variant: "Single",
              sku: "SYNTH-3",
              priceMinorUnits: 1300,
            },
          ],
        }),
      );
    }
    if (section === "Customer Intelligence") {
      metrics.push(
        createMetricViewModel({
          metricKey: "customers.returning_rate",
          environment: this.environment,
          dataPeriod: context.dataPeriod,
          sources: [source],
          value: { kind: "rate_basis_points", value: 2500 },
        }),
      );
    }
    if (section === "Marketing Intelligence") {
      const empty = { ...apiSource("no_activity"), source: "google_sheets" as const };
      context.sourceStatuses = [empty];
      metrics.push(
        createMetricViewModel({
          metricKey: "marketing.spend",
          environment: "production",
          dataPeriod: context.dataPeriod,
          sources: [empty],
          value: null,
        }),
      );
    }
    const page = composeDashboardPage({ section, context, metrics, tables });
    return {
      page,
      cache: [
        {
          dataset: `fixture-${section.toLowerCase().replaceAll(" ", "-")}`,
          source: page.sources[0]?.source ?? "shopify",
          cache: { state: "miss", generatedAt: FIXED_NOW.toISOString(), expiresAt: null },
        },
      ],
    };
  }

  async sourceStatuses(): Promise<readonly SourceStatus[]> {
    return [apiSource("partial")];
  }
}
