import { describe, expect, it } from "vitest";

import {
  CacheCoordinator,
  DashboardOrchestrator,
  type DashboardDatasetContributor,
} from "@/src/application/orchestration";
import { createMetricViewModel } from "@/src/application/metrics";
import { InMemoryCache } from "@/src/infrastructure/cache";

import { FILTERS, MutableClock, status } from "./fixtures";

function setup(
  contributors: readonly DashboardDatasetContributor[],
  plan: ConstructorParameters<typeof DashboardOrchestrator>[1],
) {
  const clock = new MutableClock();
  return {
    clock,
    orchestrator: new DashboardOrchestrator(
      contributors,
      plan,
      new CacheCoordinator(new InMemoryCache(clock), clock),
      clock,
      2,
    ),
  };
}

function contributor(input: {
  dataset: string;
  source?: "shopify" | "klaviyo" | "google_sheets" | "google_drive";
  identity?: string;
  calls: { value: number };
  load: DashboardDatasetContributor["load"];
}): DashboardDatasetContributor {
  return {
    dataset: input.dataset,
    source: input.source ?? "shopify",
    sourceIdentity: input.identity ?? `${input.dataset}-source`,
    cachePolicy: { freshForSeconds: 30, staleForSeconds: 30 },
    load: async (context) => {
      input.calls.value += 1;
      return input.load(context);
    },
  };
}

describe("B6 dashboard orchestration", () => {
  it("fetches only planned datasets and deduplicates a repeated dataset within a request", async () => {
    const catalogCalls = { value: 0 };
    const klaviyoCalls = { value: 0 };
    const catalog = contributor({
      dataset: "shopify_catalog",
      calls: catalogCalls,
      load: async (context) => ({
        sourceStatuses: [status("shopify")],
        metrics: [
          createMetricViewModel({
            metricKey: "products.catalog",
            environment: context.environment,
            dataPeriod: context.dataPeriod,
            sources: [status("shopify")],
            value: { kind: "status", value: "Current catalog" },
          }),
        ],
      }),
    });
    const klaviyo = contributor({
      dataset: "klaviyo_reports",
      source: "klaviyo",
      calls: klaviyoCalls,
      load: async () => ({ sourceStatuses: [status("klaviyo")] }),
    });
    const { orchestrator } = setup([catalog, klaviyo], {
      "Product Intelligence": ["shopify_catalog", "shopify_catalog"],
    });

    const result = await orchestrator.loadPage({
      section: "Product Intelligence",
      environment: "test",
      filters: FILTERS,
    });
    expect(catalogCalls.value).toBe(1);
    expect(klaviyoCalls.value).toBe(0);
    expect(result.page.metrics.find(({ key }) => key === "products.catalog")?.value).toEqual({
      kind: "status",
      value: "Current catalog",
    });
  });

  it("isolates environment, period, and normalized filters in cache keys", async () => {
    const calls = { value: 0 };
    const source = contributor({
      dataset: "shopify_customers",
      calls,
      load: async () => ({ sourceStatuses: [status("shopify")] }),
    });
    const { orchestrator } = setup([source], {
      "Customer Intelligence": ["shopify_customers"],
    });
    const request = {
      section: "Customer Intelligence" as const,
      environment: "test" as const,
      filters: { ...FILTERS, productSkus: ["SKU-B", "SKU-A", "SKU-A"] },
    };
    await orchestrator.loadPage(request);
    await orchestrator.loadPage({
      ...request,
      filters: { ...FILTERS, productSkus: ["SKU-A", "SKU-B"] },
    });
    await orchestrator.loadPage({ ...request, environment: "production" });
    await orchestrator.loadPage({
      ...request,
      filters: { ...request.filters, endDate: "2026-08-01" },
    });
    expect(calls.value).toBe(3);
  });

  it("keeps a Shopify metric usable when Klaviyo times out and preserves blocked metrics", async () => {
    const shopifyCalls = { value: 0 };
    const klaviyoCalls = { value: 0 };
    const shopify = contributor({
      dataset: "shopify_funnel",
      calls: shopifyCalls,
      load: async (context) => ({
        sourceStatuses: [status("shopify")],
        metrics: [
          createMetricViewModel({
            metricKey: "commerce.web_funnel",
            environment: context.environment,
            dataPeriod: context.dataPeriod,
            sources: [status("shopify")],
            value: { kind: "rate_basis_points", value: 250 },
          }),
        ],
      }),
    });
    const klaviyo = contributor({
      dataset: "klaviyo_reports",
      source: "klaviyo",
      calls: klaviyoCalls,
      load: async () => {
        throw new Error("timeout");
      },
    });
    const { orchestrator } = setup([shopify, klaviyo], {
      "Marketing Intelligence": ["shopify_funnel", "klaviyo_reports"],
    });
    const result = await orchestrator.loadPage({
      section: "Marketing Intelligence",
      environment: "production",
      filters: FILTERS,
    });
    const funnel = result.page.metrics.find(({ key }) => key === "commerce.web_funnel");
    const cac = result.page.metrics.find(({ key }) => key === "marketing.cac");
    expect(funnel).toMatchObject({ value: { kind: "rate_basis_points", value: 250 } });
    expect(cac).toMatchObject({
      implementationStatus: "BUSINESS_RULE_REQUIRED",
      value: null,
    });
    expect(result.page.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "shopify", state: "current" }),
        expect.objectContaining({ source: "klaviyo", state: "unavailable" }),
      ]),
    );
  });

  it("treats empty production manual data as data pending, not orchestration failure", async () => {
    const calls = { value: 0 };
    const sheets = contributor({
      dataset: "manual_marketing",
      source: "google_sheets",
      identity: "production-workbook-id",
      calls,
      load: async (context) => ({
        sourceStatuses: [status("google_sheets", "no_activity")],
        metrics: [
          createMetricViewModel({
            metricKey: "marketing.spend",
            environment: context.environment,
            dataPeriod: context.dataPeriod,
            sources: [status("google_sheets", "no_activity")],
            value: null,
          }),
        ],
      }),
    });
    const { orchestrator } = setup([sheets], {
      "Marketing Intelligence": ["manual_marketing"],
    });
    const result = await orchestrator.loadPage({
      section: "Marketing Intelligence",
      environment: "production",
      filters: FILTERS,
    });
    expect(result.page.metrics.find(({ key }) => key === "marketing.spend")).toMatchObject({
      implementationStatus: "DATA_PENDING",
      value: null,
      readiness: { state: "no_activity" },
    });
    expect(result.cache[0]?.cache.state).toBe("miss");
  });

  it("isolates an invalid conditional dataset while preserving a valid sibling dataset", async () => {
    const financeCalls = { value: 0 };
    const cashCalls = { value: 0 };
    const finance = contributor({
      dataset: "manual_finance",
      source: "google_sheets",
      identity: "production-workbook-id",
      calls: financeCalls,
      load: async (context) => ({
        sourceStatuses: [status("google_sheets")],
        metrics: [
          createMetricViewModel({
            metricKey: "finance.actual_expenses",
            environment: context.environment,
            dataPeriod: context.dataPeriod,
            sources: [status("google_sheets")],
            value: { kind: "money", value: { currency: "USD", minorUnits: 10000 } },
          }),
        ],
      }),
    });
    const cash = contributor({
      dataset: "manual_cash",
      source: "google_sheets",
      identity: "production-workbook-id",
      calls: cashCalls,
      load: async (context) => ({
        sourceStatuses: [status("google_sheets", "invalid")],
        metrics: [
          createMetricViewModel({
            metricKey: "finance.cash_position",
            environment: context.environment,
            dataPeriod: context.dataPeriod,
            sources: [status("google_sheets", "invalid")],
            value: null,
          }),
        ],
      }),
    });
    const { orchestrator } = setup([finance, cash], {
      "Financial Intelligence": ["manual_finance", "manual_cash"],
    });
    const result = await orchestrator.loadPage({
      section: "Financial Intelligence",
      environment: "test",
      filters: FILTERS,
    });
    expect(result.page.metrics.find(({ key }) => key === "finance.actual_expenses")).toMatchObject({
      value: { kind: "money", value: { currency: "USD", minorUnits: 10000 } },
      readiness: { state: "current" },
    });
    expect(result.page.metrics.find(({ key }) => key === "finance.cash_position")).toMatchObject({
      value: null,
      readiness: { state: "invalid" },
    });
    expect(result.page.sources).toContainEqual(
      expect.objectContaining({ source: "google_sheets", state: "partial" }),
    );
  });

  it("preserves a provider-declared partial result and its nonzero value", async () => {
    const calls = { value: 0 };
    const products = contributor({
      dataset: "shopify_products",
      calls,
      load: async (context) => ({
        sourceStatuses: [status("shopify", "partial")],
        metrics: [
          createMetricViewModel({
            metricKey: "products.units_sold",
            environment: context.environment,
            dataPeriod: context.dataPeriod,
            sources: [status("shopify", "partial")],
            value: { kind: "count", value: 12 },
          }),
        ],
      }),
    });
    const { orchestrator } = setup([products], {
      "Product Intelligence": ["shopify_products"],
    });
    const result = await orchestrator.loadPage({
      section: "Product Intelligence",
      environment: "production",
      filters: FILTERS,
    });
    expect(result.page.metrics.find(({ key }) => key === "products.units_sold")).toMatchObject({
      value: { kind: "count", value: 12 },
      readiness: { state: "partial" },
    });
  });

  it("labels last-known-good fallback as stale without converting zero to unavailable", async () => {
    const calls = { value: 0 };
    let failing = false;
    const inventory = contributor({
      dataset: "shopify_inventory",
      calls,
      load: async (context) => {
        if (failing) throw new Error("temporary outage");
        return {
          sourceStatuses: [status("shopify")],
          metrics: [
            createMetricViewModel({
              metricKey: "inventory.shopify_current",
              environment: context.environment,
              dataPeriod: context.dataPeriod,
              sources: [status("shopify")],
              value: { kind: "count", value: 0 },
            }),
          ],
        };
      },
    });
    const { orchestrator, clock } = setup([inventory], {
      "Product Intelligence": ["shopify_inventory"],
    });
    const request = {
      section: "Product Intelligence" as const,
      environment: "production" as const,
      filters: FILTERS,
    };
    await orchestrator.loadPage(request);
    clock.advance(31_000);
    failing = true;
    const result = await orchestrator.loadPage(request);
    expect(result.cache[0]?.cache.state).toBe("stale");
    expect(
      result.page.metrics.find(({ key }) => key === "inventory.shopify_current"),
    ).toMatchObject({
      value: { kind: "count", value: 0 },
      readiness: { state: "stale" },
    });
    expect(result.page.warnings).toContain("CACHE_STALE_FALLBACK");
  });

  it("fetches the shifted comparison period and attaches it to the matching metric", async () => {
    const calls = { value: 0 };
    const revenue = contributor({
      dataset: "shopify_revenue",
      calls,
      load: async (context) => ({
        sourceStatuses: [status("shopify")],
        metrics: [
          createMetricViewModel({
            metricKey: "products.units_sold",
            environment: context.environment,
            dataPeriod: context.dataPeriod,
            sources: [status("shopify")],
            value: {
              kind: "count",
              value: context.dataPeriod.startDate === FILTERS.startDate ? 20 : 10,
            },
          }),
        ],
      }),
    });
    const { orchestrator } = setup([revenue], {
      "Product Intelligence": ["shopify_revenue"],
    });
    const result = await orchestrator.loadPage({
      section: "Product Intelligence",
      environment: "production",
      filters: { ...FILTERS, comparison: "previous_period" },
    });

    expect(calls.value).toBe(2);
    const metric = result.page.metrics.find(({ key }) => key === "products.units_sold");
    expect(metric).toMatchObject({
      value: { kind: "count", value: 20 },
      comparison: { mode: "previous_period", value: { kind: "count", value: 10 } },
    });
    expect((metric?.comparison?.dataPeriod.endDate ?? "") < FILTERS.startDate).toBe(true);
    // Only the primary fetch's cache metadata is reported.
    expect(result.cache).toHaveLength(1);
  });

  it("omits comparison data when the request asks for none", async () => {
    const calls = { value: 0 };
    const revenue = contributor({
      dataset: "shopify_revenue",
      calls,
      load: async (context) => ({
        sourceStatuses: [status("shopify")],
        metrics: [
          createMetricViewModel({
            metricKey: "products.units_sold",
            environment: context.environment,
            dataPeriod: context.dataPeriod,
            sources: [status("shopify")],
            value: { kind: "count", value: 20 },
          }),
        ],
      }),
    });
    const { orchestrator } = setup([revenue], {
      "Product Intelligence": ["shopify_revenue"],
    });
    const result = await orchestrator.loadPage({
      section: "Product Intelligence",
      environment: "production",
      filters: FILTERS,
    });

    expect(calls.value).toBe(1);
    const metric = result.page.metrics.find(({ key }) => key === "products.units_sold");
    expect(metric?.comparison).toBeUndefined();
  });

  it("discloses and logs why a dataset failed instead of silently blanking it", async () => {
    const logged: { event: string; context?: Record<string, unknown> }[] = [];
    const logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: (event: string, context?: Record<string, unknown>) => {
        logged.push({ event, ...(context ? { context } : {}) });
      },
    };
    const timingOut: DashboardDatasetContributor = {
      dataset: "shopify_units",
      source: "shopify",
      sourceIdentity: "shopify-units-source",
      cachePolicy: { freshForSeconds: 30, staleForSeconds: 30 },
      load: async () => {
        throw Object.assign(new Error("Shopify request timed out"), { kind: "timeout" });
      },
    };
    const clock = new MutableClock();
    const orchestrator = new DashboardOrchestrator(
      [timingOut],
      { "Product Intelligence": ["shopify_units"] },
      new CacheCoordinator(new InMemoryCache(clock), clock),
      clock,
      2,
      logger,
    );

    const result = await orchestrator.loadPage({
      section: "Product Intelligence",
      environment: "production",
      filters: FILTERS,
    });

    // The cause must survive into the response, not vanish into an empty panel.
    expect(result.page.warnings).toContain("DATASET_UNAVAILABLE:shopify_units:timeout");
    expect(result.page.sources[0]?.warningCodes).toContain("DATASET_FAILURE_KIND:timeout");
    expect(logged[0]?.event).toBe("dashboard.dataset_failed");
    expect(logged[0]?.context).toMatchObject({ dataset: "shopify_units", kind: "timeout" });
  });
});
