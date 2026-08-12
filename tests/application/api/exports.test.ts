import { describe, expect, it } from "vitest";

import { BackendApiService } from "@/src/application/api";
import { createApiHandlers } from "@/src/infrastructure/api";

import { API_QUERY, FIXED_NOW, FixtureApiRuntime } from "./fixtures";

function handlers() {
  const now = () => new Date(FIXED_NOW);
  return createApiHandlers(new BackendApiService(new FixtureApiRuntime(), now), now);
}

describe("B7 bounded CSV exports", () => {
  it("returns deterministic filtered CSV and neutralizes spreadsheet formulas", async () => {
    const response = await handlers().exportCsv(
      new Request(
        `https://example.test/api/v1/exports/product-catalog?${API_QUERY}&limit=100&sort=product:asc&fields=product,sku`,
      ),
      "product-catalog",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "zacao-product-catalog-2026-07-01-to-2026-07-31.csv",
    );
    const csv = await response.text();
    expect(csv).toContain("'=Synthetic One");
    expect(csv).toContain("'+Synthetic Two");
    expect(csv).toContain("'@Synthetic Three");
    expect(csv).not.toContain("email");
    expect(csv).not.toContain("providerRaw");
  });

  it("rejects oversized and unapproved exports", async () => {
    expect(
      (
        await handlers().exportCsv(
          new Request(`https://example.test/api/v1/exports/product-catalog?${API_QUERY}&limit=101`),
          "product-catalog",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handlers().exportCsv(
          new Request(`https://example.test/api/v1/exports/detailed-orders?${API_QUERY}`),
          "detailed-orders",
        )
      ).status,
    ).toBe(400);
  });

  it("exports certified channel performance fields while keeping margin unavailable", async () => {
    const response = await handlers().exportCsv(
      new Request(
        `https://example.test/api/v1/exports/channel-performance?${API_QUERY}&fields=channel,revenueMinorUnits,orders,averageOrderValueMinorUnits,marginBasisPoints`,
      ),
      "channel-performance",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "zacao-channel-performance-2026-07-01-to-2026-07-31.csv",
    );
    expect(await response.text()).toBe(
      "channel,revenueMinorUnits,orders,averageOrderValueMinorUnits,marginBasisPoints\r\nDTC — Site,59800,54,1107,\r\n",
    );
  });

  it("rejects the retired comparison query parameter", async () => {
    const response = await handlers().exportCsv(
      new Request(
        `https://example.test/api/v1/exports/product-catalog?${API_QUERY}&comparison=previous_period`,
      ),
      "product-catalog",
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });
});
