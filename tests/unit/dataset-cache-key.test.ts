import { describe, expect, it } from "vitest";

import { createDatasetCacheKey } from "@/src/domain/utilities/cache-key";

import { FILTERS } from "../application/orchestration/fixtures";

describe("B6 dataset cache keys", () => {
  it("isolates environment, identity, dataset, dates, and normalized filters", () => {
    const key = (overrides: Partial<Parameters<typeof createDatasetCacheKey>[0]> = {}) =>
      createDatasetCacheKey({
        environment: "test",
        source: "google_sheets",
        sourceIdentity: "test-workbook-id",
        dataset: "manual_finance",
        filters: FILTERS,
        ...overrides,
      });
    expect(key()).not.toBe(key({ environment: "production" }));
    expect(key()).not.toBe(key({ sourceIdentity: "production-workbook-id" }));
    expect(key()).not.toBe(key({ dataset: "manual_marketing" }));
    expect(key()).not.toBe(key({ filters: { ...FILTERS, endDate: "2026-08-01" } }));
    expect(key({ filters: { ...FILTERS, productSkus: ["B", "A", "A"] } })).toBe(
      key({ filters: { ...FILTERS, productSkus: ["A", "B"] } }),
    );
  });

  it("rejects unsafe source identities rather than placing them in a cache key", () => {
    expect(() =>
      createDatasetCacheKey({
        environment: "production",
        source: "shopify",
        sourceIdentity: "secret token value",
        dataset: "sales",
        filters: FILTERS,
      }),
    ).toThrow("non-secret stable identifier");
  });

  it("accepts a real fixed Google workbook ID but never exposes it in the key", () => {
    const workbookId = "1wj7RNZ0VNhaYDyWTU_MkJNYLdMPHe17u6ZYsmP-HwbM";
    const key = createDatasetCacheKey({
      environment: "production",
      source: "google_sheets",
      sourceIdentity: workbookId,
      dataset: "manual_finance",
      filters: FILTERS,
    });
    expect(key).not.toContain(workbookId);
    expect(key).toContain("production:google_sheets:id-");
  });
});
