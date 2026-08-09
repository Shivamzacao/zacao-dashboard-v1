import { describe, expect, it } from "vitest";

import {
  BackendApiService,
  dashboardApiResponseSchema,
  dashboardSlugToSection,
  drilldownApiResponseSchema,
  livenessApiResponseSchema,
  readinessApiResponseSchema,
  sourceStatusApiResponseSchema,
} from "@/src/application/api";
import { apiProblemSchema } from "@/src/domain/contracts";
import { createApiHandlers } from "@/src/infrastructure/api";

import { API_QUERY, FIXED_NOW, FixtureApiRuntime } from "./fixtures";

function setup() {
  const now = () => new Date(FIXED_NOW);
  return createApiHandlers(new BackendApiService(new FixtureApiRuntime(), now), now);
}

describe("B7 JSON route contracts", () => {
  it("returns a schema-compatible private response for every dashboard", async () => {
    const handlers = setup();
    for (const slug of Object.keys(dashboardSlugToSection)) {
      const response = await handlers.dashboard(
        new Request(`https://example.test/api/v1/dashboards/${slug}?${API_QUERY}`),
        slug,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      dashboardApiResponseSchema.parse(await response.json());
    }
  });

  it("returns stable problem+json without raw error details", async () => {
    const response = await setup().dashboard(
      new Request(`https://example.test/api/v1/dashboards/products?${API_QUERY}&shopifyql=unsafe`),
      "products",
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const problem = apiProblemSchema.parse(await response.json());
    expect(problem.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(problem)).not.toContain("stack");
    expect(JSON.stringify(problem)).not.toMatch(/token|private.?key|secret/i);
  });

  it("preserves partial and empty-data states without failing their pages", async () => {
    const handlers = setup();
    const customers = dashboardApiResponseSchema.parse(
      await (
        await handlers.dashboard(
          new Request(`https://example.test/api/v1/dashboards/customers?${API_QUERY}`),
          "customers",
        )
      ).json(),
    );
    expect(
      customers.data.page.metrics.find(({ key }) => key === "customers.returning_rate")?.readiness
        .state,
    ).toBe("partial");
    const marketing = dashboardApiResponseSchema.parse(
      await (
        await handlers.dashboard(
          new Request(`https://example.test/api/v1/dashboards/marketing?${API_QUERY}`),
          "marketing",
        )
      ).json(),
    );
    expect(marketing.data.page.metrics.find(({ key }) => key === "marketing.spend")).toMatchObject({
      value: null,
      readiness: { state: "no_activity" },
    });
  });

  it("paginates and field-filters an approved PII-safe drill-down", async () => {
    const handlers = setup();
    const response = await handlers.drilldown(
      new Request(
        `https://example.test/api/v1/drilldowns/product-catalog?${API_QUERY}&limit=2&sort=product:asc&fields=product,sku`,
      ),
      "product-catalog",
    );
    const body = drilldownApiResponseSchema.parse(await response.json());
    expect(body.data.rows).toHaveLength(2);
    expect(body.data.pagination.hasNextPage).toBe(true);
    expect(body.data.rows.every((row) => Object.keys(row).sort().join(",") === "product,sku")).toBe(
      true,
    );
    expect(JSON.stringify(body)).not.toContain("email");
    const next = await handlers.drilldown(
      new Request(
        `https://example.test/api/v1/drilldowns/product-catalog?${API_QUERY}&limit=2&sort=product:asc&fields=product,sku&cursor=${body.data.pagination.nextCursor}`,
      ),
      "product-catalog",
    );
    expect(drilldownApiResponseSchema.parse(await next.json()).data.rows).toHaveLength(1);
  });

  it("returns explicit SOURCE_LIMITED readiness for detailed orders", async () => {
    const response = await setup().drilldown(
      new Request(`https://example.test/api/v1/drilldowns/detailed-orders?${API_QUERY}`),
      "detailed-orders",
    );
    const body = drilldownApiResponseSchema.parse(await response.json());
    expect(body.data.rows).toEqual([]);
    expect(body.data.readiness).toMatchObject({
      state: "partial",
      warningCodes: expect.arrayContaining(["SOURCE_LIMITED"]),
    });
  });

  it("separates liveness, readiness, and deferred source status", async () => {
    const handlers = setup();
    const live = livenessApiResponseSchema.parse(
      await (await handlers.liveness(new Request("https://example.test/api/v1/health"))).json(),
    );
    const ready = readinessApiResponseSchema.parse(
      await (
        await handlers.readiness(new Request("https://example.test/api/v1/health/readiness"))
      ).json(),
    );
    const sources = sourceStatusApiResponseSchema.parse(
      await (
        await handlers.sourceStatus(new Request("https://example.test/api/v1/sources/status"))
      ).json(),
    );
    expect(live.data.status).toBe("live");
    expect(ready.data.frontendDevelopment).toBe("ready");
    expect(ready.data.productionCertification).toBe("deferred");
    expect(sources.data.productionCertification).toBe("deferred");
  });

  it("rejects a client-controlled TEST environment", async () => {
    const response = await setup().dashboard(
      new Request(`https://example.test/api/v1/dashboards/products?${API_QUERY}&environment=test`),
      "products",
    );
    expect(response.status).toBe(400);
  });
});
