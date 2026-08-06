import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CONTRACT_SCHEMA_VERSION,
  apiFailureSchema,
  apiSuccessSchema,
  dashboardFiltersSchema,
  dateRangeSchema,
  readinessSchema,
  sourceStatusSchema,
  usdMoneySchema,
} from "@/src/domain/contracts";
import { readinessFixtures, sourceStatusFixtures } from "@/src/test-support/contract-fixtures";

describe("public contract schema 1.0", () => {
  it("is frozen to version 1.0", () => {
    expect(CONTRACT_SCHEMA_VERSION).toBe("1.0");
  });

  it("accepts all mandatory readiness and source-state fixtures", () => {
    for (const fixture of Object.values(readinessFixtures)) readinessSchema.parse(fixture);
    for (const fixture of Object.values(sourceStatusFixtures)) sourceStatusSchema.parse(fixture);
  });

  it("rejects an impossible date and reversed range", () => {
    expect(() =>
      dateRangeSchema.parse({ startDate: "2026-02-30", endDate: "2026-03-01" }),
    ).toThrow();
    expect(() =>
      dateRangeSchema.parse({ startDate: "2026-03-02", endDate: "2026-03-01" }),
    ).toThrow();
  });

  it("rejects unknown filter and money fields", () => {
    expect(() =>
      dashboardFiltersSchema.parse({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        comparison: "none",
        channels: [],
        productSkus: [],
        locations: [],
        inventedFilter: true,
      }),
    ).toThrow();
    expect(() => usdMoneySchema.parse({ currency: "USD", minorUnits: 100, dollars: 1 })).toThrow();
  });

  it("accepts strict success and failure envelopes", () => {
    const requestId = "54e2cb44-a23b-4f32-bb1f-1e7dc6f83185";
    apiSuccessSchema(z.object({ total: z.number() })).parse({
      ok: true,
      data: { total: 1 },
      meta: {
        schemaVersion: "1.0",
        requestId,
        cache: {
          state: "miss",
          generatedAt: "2026-08-06T12:00:00.000Z",
          expiresAt: null,
        },
        sources: [sourceStatusFixtures.current],
      },
    });
    apiFailureSchema.parse({
      ok: false,
      requestId,
      error: {
        code: "INVALID_REQUEST",
        message: "The request is invalid.",
        retryable: false,
        details: [{ path: ["startDate"], message: "Required" }],
      },
    });
  });
});
