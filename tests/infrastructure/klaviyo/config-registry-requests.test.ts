import { describe, expect, it } from "vitest";

import {
  assertKlaviyoReadOnlyScopes,
  buildCampaignReportRequest,
  buildMetricAggregateRequest,
  KLAVIYO_ATTRIBUTED_REVENUE_LABEL,
  KLAVIYO_PROFILE_READ_SCOPE,
  parseKlaviyoConfiguration,
  reconcileKlaviyoMetricRegistry,
  REQUIRED_KLAVIYO_READ_SCOPES,
  VERIFIED_KLAVIYO_METRICS,
} from "@/src/infrastructure/klaviyo";

const configuration = {
  privateApiKey: "sanitized-test-key",
  apiRevision: "2026-07-15",
  grantedScopes: [...REQUIRED_KLAVIYO_READ_SCOPES],
  reportingTimeZone: "America/New_York" as const,
  timeoutMs: 5_000,
  maxRetries: 2,
};

describe("Klaviyo read-only configuration", () => {
  it("accepts the audited read capabilities", () => {
    expect(parseKlaviyoConfiguration(configuration)).toEqual(configuration);
  });

  it("rejects missing/write scopes, invalid revisions, and excess retries", () => {
    expect(() =>
      parseKlaviyoConfiguration({ ...configuration, grantedScopes: ["metrics:read"] }),
    ).toThrow(/Missing required/);
    expect(() => assertKlaviyoReadOnlyScopes(["metrics:read", "campaigns:write"])).toThrow(
      /read-only/,
    );
    expect(() => parseKlaviyoConfiguration({ ...configuration, apiRevision: "latest" })).toThrow();
    expect(() => parseKlaviyoConfiguration({ ...configuration, maxRetries: 3 })).toThrow();
    expect(() =>
      parseKlaviyoConfiguration({
        ...configuration,
        demographicProperties: { ageBand: "Age band", gender: "Gender" },
      }),
    ).toThrow(/profiles:read/);
    expect(
      parseKlaviyoConfiguration({
        ...configuration,
        grantedScopes: [...configuration.grantedScopes, KLAVIYO_PROFILE_READ_SCOPE],
        demographicProperties: { ageBand: "Age band", gender: "Gender" },
      }).demographicProperties,
    ).toEqual({ ageBand: "Age band", gender: "Gender" });
  });
});

describe("verified Klaviyo metric registry", () => {
  it("freezes the audited metric keys and IDs", () => {
    expect(VERIFIED_KLAVIYO_METRICS).toHaveLength(22);
    expect(VERIFIED_KLAVIYO_METRICS.find(({ key }) => key === "placed_order")).toMatchObject({
      id: "Rt8Ckz",
      integration: "Shopify",
    });
    expect(KLAVIYO_ATTRIBUTED_REVENUE_LABEL).toBe("Klaviyo-attributed revenue");
  });

  it("reports verified, missing, and conflicting provider definitions without changing keys", () => {
    const received = VERIFIED_KLAVIYO_METRICS.find(({ key }) => key === "received_email");
    const opened = VERIFIED_KLAVIYO_METRICS.find(({ key }) => key === "opened_email");
    expect(received).toBeDefined();
    expect(opened).toBeDefined();
    const result = reconcileKlaviyoMetricRegistry([
      { id: received?.id, name: received?.name, integration: "Klaviyo" },
      { id: opened?.id, name: "Changed provider name", integration: "Klaviyo" },
    ]);
    expect(result.find(({ key }) => key === "received_email")?.status).toBe("verified");
    expect(result.find(({ key }) => key === "opened_email")?.status).toBe("conflict");
    expect(result.find(({ key }) => key === "placed_order")?.status).toBe("missing");
  });
});

describe("Klaviyo report/event request contracts", () => {
  it("uses New York day boundaries and keeps send-date and event-time requests distinct", () => {
    const dateRange = { startDate: "2026-08-01", endDate: "2026-08-01" };
    const report = buildCampaignReportRequest({
      dateRange,
      timeZone: "America/New_York",
      conversionMetricId: "Rt8Ckz",
    });
    expect(report.data.attributes.timeframe).toEqual({
      start: "2026-08-01T04:00:00.000Z",
      end: "2026-08-02T04:00:00.000Z",
    });
    const aggregate = buildMetricAggregateRequest({
      dateRange,
      timeZone: "America/New_York",
      metricId: "Ub5zGJ",
      interval: "day",
    });
    expect(aggregate.data.attributes).toMatchObject({
      metric_id: "Ub5zGJ",
      timezone: "America/New_York",
      measurements: ["count", "unique", "sum_value"],
    });
  });

  it("rejects ranges longer than the audited one-year API maximum", () => {
    expect(() =>
      buildMetricAggregateRequest({
        dateRange: { startDate: "2024-01-01", endDate: "2026-01-01" },
        timeZone: "America/New_York",
        metricId: "Ub5zGJ",
        interval: "month",
      }),
    ).toThrow(/one year/);
  });
});
