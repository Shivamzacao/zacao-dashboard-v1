import { describe, expect, it, vi } from "vitest";

import {
  assertNoKlaviyoPii,
  KlaviyoAdapter,
  KlaviyoClient,
  KlaviyoClientError,
  klaviyoSourceStatus,
  REQUIRED_KLAVIYO_READ_SCOPES,
} from "@/src/infrastructure/klaviyo";

const configuration = {
  privateApiKey: "sanitized-test-key",
  apiRevision: "2026-07-15",
  grantedScopes: [...REQUIRED_KLAVIYO_READ_SCOPES],
  reportingTimeZone: "America/New_York" as const,
  timeoutMs: 5_000,
  maxRetries: 0,
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

function adapterFor(body: unknown) {
  const client = new KlaviyoClient(configuration, {
    fetch: vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(json(body))),
  });
  return new KlaviyoAdapter(client, configuration);
}

describe("Klaviyo Future-Ready Core adapter", () => {
  it("normalizes the audited account metadata without contact PII", async () => {
    const adapter = adapterFor({
      data: [
        {
          id: "RcDBg3",
          type: "account",
          attributes: {
            timezone: "Europe/Madrid",
            preferred_currency: "USD",
            locale: "en-US",
            test_account: false,
          },
        },
      ],
    });
    await expect(adapter.readAccount()).resolves.toEqual({
      id: "RcDBg3",
      timezone: "Europe/Madrid",
      preferredCurrency: "USD",
      locale: "en-US",
      testAccount: false,
    });
  });

  it("treats empty campaign/flow discovery as successful no_activity", async () => {
    const adapter = adapterFor({ data: [], links: { next: null } });
    await expect(adapter.readCampaigns("email")).resolves.toEqual({
      records: [],
      activityState: "no_activity",
      truncated: false,
    });
    await expect(adapter.readFlows()).resolves.toMatchObject({ activityState: "no_activity" });
  });

  it("discovers newly created campaigns and flows without changing output schemas", async () => {
    const adapter = adapterFor({
      data: [
        {
          id: "flow-1",
          type: "flow",
          attributes: {
            name: "Welcome series",
            status: "live",
            trigger_type: "Added to List",
            created: "2026-08-05T12:00:00Z",
            updated: "2026-08-05T12:00:00Z",
          },
        },
      ],
      links: { next: null },
    });
    await expect(adapter.readFlows()).resolves.toMatchObject({
      activityState: "current",
      records: [{ id: "flow-1", name: "Welcome series", status: "live" }],
    });

    const campaignAdapter = adapterFor({
      data: [
        {
          id: "campaign-1",
          type: "campaign",
          attributes: {
            name: "Launch",
            status: "sent",
            send_time: "2026-08-06T12:00:00Z",
            created_at: "2026-08-05T12:00:00Z",
            updated_at: "2026-08-06T12:00:00Z",
          },
        },
      ],
      links: { next: null },
    });
    await expect(campaignAdapter.readCampaigns("email")).resolves.toMatchObject({
      activityState: "current",
      records: [{ id: "campaign-1", name: "Launch", status: "sent" }],
    });
  });

  it("returns empty reports as no_activity with send-date and attributed-revenue semantics", async () => {
    const adapter = adapterFor({
      data: { type: "campaign-values-report", attributes: { results: [] } },
    });
    await expect(
      adapter.readCampaignReport({ startDate: "2026-08-01", endDate: "2026-08-05" }),
    ).resolves.toEqual({
      rows: [],
      activityState: "no_activity",
      timeSemantics: "send_date",
      revenueLabel: "Klaviyo-attributed revenue",
    });
  });

  it("accepts populated campaign/flow report rows through the same contract", async () => {
    const adapter = adapterFor({
      data: {
        type: "flow-values-report",
        attributes: {
          results: [
            {
              groupings: { flow_id: "flow-1", channel: "email" },
              statistics: { recipients: 100, clicks_unique: 10, conversion_value: 250 },
            },
          ],
        },
      },
    });
    await expect(
      adapter.readFlowReport({ startDate: "2026-08-01", endDate: "2026-08-05" }),
    ).resolves.toMatchObject({
      activityState: "current",
      timeSemantics: "send_date",
      revenueLabel: "Klaviyo-attributed revenue",
      rows: [{ groupings: { flow_id: "flow-1" } }],
    });
  });

  it("keeps zero and populated metric aggregates empty-safe with event-time semantics", async () => {
    const empty = adapterFor({
      data: {
        type: "metric-aggregate",
        attributes: {
          dates: ["2026-08-01T04:00:00Z"],
          data: [{ measurements: { count: [0], unique: [0], sum_value: [0] } }],
        },
      },
    });
    await expect(
      empty.readMetricAggregate({
        metricId: "Ub5zGJ",
        dateRange: { startDate: "2026-08-01", endDate: "2026-08-01" },
        interval: "day",
      }),
    ).resolves.toMatchObject({
      activityState: "no_activity",
      timeSemantics: "event_time",
      displayTimeZone: "America/New_York",
    });

    const populated = adapterFor({
      data: {
        type: "metric-aggregate",
        attributes: {
          dates: ["2026-08-01T04:00:00Z"],
          data: [{ measurements: { count: [4], unique: [3], sum_value: [0] } }],
        },
      },
    });
    await expect(
      populated.readMetricAggregate({
        metricId: "Ub5zGJ",
        dateRange: { startDate: "2026-08-01", endDate: "2026-08-01" },
        interval: "day",
      }),
    ).resolves.toMatchObject({ activityState: "current" });
  });

  it("returns only event presence and rejects PII in aggregate output", async () => {
    const adapter = adapterFor({
      data: [{ id: "event-1", type: "event", attributes: { email: "not-returned@example.test" } }],
    });
    await expect(adapter.readEventPresence()).resolves.toBe(true);
    expect(() => assertNoKlaviyoPii({ email: "forbidden@example.test" })).toThrow(/PII/);
    expect(() => assertNoKlaviyoPii({ statistics: { clicks: 10 } })).not.toThrow();
  });
});

describe("Klaviyo source readiness", () => {
  it("maps valid empty activity to no_activity and populated activity to current", () => {
    expect(
      klaviyoSourceStatus({ checkedAt: "2026-08-06T12:00:00Z", recordCount: 0 }),
    ).toMatchObject({ state: "no_activity", warningCodes: ["KLAVIYO_NO_ACTIVITY"] });
    expect(
      klaviyoSourceStatus({ checkedAt: "2026-08-06T12:00:00Z", recordCount: 1 }),
    ).toMatchObject({ state: "current", warningCodes: [] });
  });

  it("maps permission and throttle failures to stable states", () => {
    expect(
      klaviyoSourceStatus({
        checkedAt: "2026-08-06T12:00:00Z",
        error: new KlaviyoClientError("permission", "denied", false, "request-1"),
      }),
    ).toMatchObject({ state: "invalid", warningCodes: ["KLAVIYO_PERMISSION"] });
    expect(
      klaviyoSourceStatus({
        checkedAt: "2026-08-06T12:00:00Z",
        error: new KlaviyoClientError("throttled", "slow", true, "request-1"),
      }),
    ).toMatchObject({ state: "unavailable", warningCodes: ["KLAVIYO_THROTTLED"] });
  });
});
