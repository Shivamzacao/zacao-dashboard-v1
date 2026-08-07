import { describe, expect, it } from "vitest";

import {
  drilldownDefinition,
  parseDashboardFilters,
  parseDrilldownQuery,
} from "@/src/application/api";
import { FixtureApiRuntime } from "./fixtures";

const supported = new FixtureApiRuntime().supportedFilters;

describe("B7 query allowlists", () => {
  it("parses and normalizes the approved filter contract", () => {
    const parsed = parseDashboardFilters(
      new URLSearchParams(
        "start=2026-07-01&end=2026-07-31&comparison=previous_period&skus=SYNTH-2,SYNTH-1,SYNTH-1",
      ),
      supported,
    );
    expect(parsed.productSkus).toEqual(["SYNTH-1", "SYNTH-2"]);
  });

  it.each([
    "start=2025-01-01&end=2026-07-31",
    "start=2026-07-01&end=2026-07-31&providerQuery=unsafe",
    "start=2026-07-01&end=2026-07-31&channels=Unknown",
  ])("rejects oversized or unsupported input: %s", (query) => {
    expect(() => parseDashboardFilters(new URLSearchParams(query), supported)).toThrow();
  });

  it("enforces drill-down sort, field, cursor, and page-size allowlists", () => {
    const definition = drilldownDefinition("product-catalog");
    if (!definition) throw new Error("Expected product-catalog drill-down definition");
    const parse = (tail: string) =>
      parseDrilldownQuery(
        new URLSearchParams(`start=2026-07-01&end=2026-07-31&${tail}`),
        supported,
        definition,
      );
    expect(() => parse("limit=101")).toThrow();
    expect(() => parse("sort=email:asc")).toThrow();
    expect(() => parse("fields=product,email")).toThrow();
    expect(parse("limit=2&sort=product:desc&fields=product,sku")).toMatchObject({
      limit: 2,
      sortField: "product",
      sortDirection: "desc",
      fields: ["product", "sku"],
    });
  });
});
