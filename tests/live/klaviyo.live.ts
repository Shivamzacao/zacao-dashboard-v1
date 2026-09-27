/**
 * Live, read-only validation of the Klaviyo adapter.
 *
 *   pnpm parity:live tests/live/klaviyo.live.ts   # with KLAVIYO_PRIVATE_API_KEY and
 *                                                 # KLAVIYO_API_REVISION set in the environment
 *
 * Prints counts and response structure only — never profile data, never
 * campaign content. Uses GET plus the three allowlisted report POSTs.
 */
import { describe, expect, it } from "vitest";

import { KlaviyoAdapter } from "@/src/infrastructure/klaviyo/adapter";
import { KlaviyoClient } from "@/src/infrastructure/klaviyo/client";
import { VERIFIED_KLAVIYO_METRICS } from "@/src/infrastructure/klaviyo/metric-registry";
import { loadKlaviyoConfigurationOrNull } from "@/src/infrastructure/klaviyo/runtime";

const DAY = 86_400_000;
const date = (offsetDays: number) =>
  new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10);

describe("Klaviyo live validation (opt-in)", () => {
  it("reads account, metrics, campaigns, flows, reports and aggregates", async () => {
    if (!process.env["KLAVIYO_PRIVATE_API_KEY"] || !process.env["KLAVIYO_API_REVISION"]) {
      throw new Error("BLOCKED: set KLAVIYO_PRIVATE_API_KEY and KLAVIYO_API_REVISION");
    }
    const configuration = loadKlaviyoConfigurationOrNull();
    if (!configuration) throw new Error("BLOCKED: Klaviyo configuration did not load");
    const adapter = new KlaviyoAdapter(new KlaviyoClient(configuration), configuration);
    const summary: Record<string, unknown> = {};
    const attempt = async (name: string, read: () => Promise<unknown>) => {
      try {
        summary[name] = await read();
      } catch (error) {
        summary[name] = {
          error: error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
          kind: (error as { kind?: string }).kind ?? null,
        };
      }
    };

    await attempt("account", async () => {
      await adapter.readAccount();
      return "ok";
    });
    await attempt("eventPresence", () => adapter.readEventPresence());
    await attempt("metricRegistry", async () => {
      const metrics = await adapter.readMetricRegistry();
      const ids = new Set(metrics.records.map((metric) => metric.id));
      return {
        count: metrics.records.length,
        truncated: metrics.truncated,
        frozenRegistryIdsPresent: VERIFIED_KLAVIYO_METRICS.filter(({ id }) => ids.has(id)).length,
        frozenRegistryIdsTotal: VERIFIED_KLAVIYO_METRICS.length,
      };
    });
    for (const channel of ["email", "sms"] as const) {
      await attempt(`campaigns_${channel}`, async () => {
        const result = await adapter.readCampaigns(channel);
        return { count: result.records.length, truncated: result.truncated };
      });
    }
    await attempt("flows", async () => {
      const result = await adapter.readFlows();
      return { count: result.records.length, truncated: result.truncated };
    });
    for (const [label, days] of [
      ["last_30_days", 29],
      ["last_365_days", 364],
    ] as const) {
      const range = { startDate: date(days), endDate: date(0) };
      await attempt(`campaignReport_${label}`, async () => {
        const report = await adapter.readCampaignReport(range);
        const rows = report.rows as readonly {
          groupings: Record<string, unknown>;
          statistics: Record<string, unknown>;
        }[];
        return {
          rows: rows.length,
          groupingKeys: [...new Set(rows.flatMap((row) => Object.keys(row.groupings)))].sort(),
          statisticKeys: [...new Set(rows.flatMap((row) => Object.keys(row.statistics)))].sort(),
          sendChannels: [...new Set(rows.map((row) => String(row.groupings["send_channel"])))],
        };
      });
      await attempt(`flowReport_${label}`, async () => {
        const report = await adapter.readFlowReport(range);
        const rows = report.rows as readonly { groupings: Record<string, unknown> }[];
        return {
          rows: rows.length,
          groupingKeys: [...new Set(rows.flatMap((row) => Object.keys(row.groupings)))].sort(),
        };
      });
    }
    await attempt("openedEmailAggregate_last_90_days", async () => {
      const opened = VERIFIED_KLAVIYO_METRICS.find(({ key }) => key === "opened_email");
      if (!opened) return "registry has no opened_email";
      const result = await adapter.readMetricAggregate({
        metricId: opened.id,
        dateRange: { startDate: date(89), endDate: date(0) },
        interval: "month",
      });
      return { seriesItems: result.series.length, activityState: result.activityState };
    });

    console.info(JSON.stringify(summary, null, 2));
    expect(summary["account"]).toBe("ok");
  });
});

describe("Klaviyo through the real dashboard runtime (opt-in)", () => {
  it("renders Klaviyo metrics on Marketing Intelligence with Klaviyo as the only source", async () => {
    const configuration = loadKlaviyoConfigurationOrNull();
    if (!configuration)
      throw new Error("BLOCKED: set KLAVIYO_PRIVATE_API_KEY and KLAVIYO_API_REVISION");
    const { createBackendApiRuntime } = await import("@/src/infrastructure/api/live-runtime");
    const runtime = createBackendApiRuntime({ shopify: () => null, klaviyo: () => configuration });
    const end = date(0);
    const filters = {
      startDate: date(29),
      endDate: end,
      channels: [],
      productSkus: [],
      locations: [],
    };
    const marketing = await runtime.loadDashboard("Marketing Intelligence", filters);
    const customers = await runtime.loadDashboard("Customer Intelligence", filters);
    const insights = await runtime.loadDashboard("Insights and Data Quality", filters);
    const pages = [marketing.page, customers.page, insights.page];
    const result = { page: marketing.page };
    const klaviyoSource = result.page.sources.find(({ source }) => source === "klaviyo");
    const view = (key: string) => {
      const metric =
        pages
          .flatMap((page) => [
            ...page.metrics,
            ...page.tables.map((item) => item.metric),
            ...page.series.map((item) => item.metric),
            ...page.breakdowns.map((item) => item.metric),
          ])
          .find((item) => item.key === key && item.value !== null) ??
        pages.flatMap((page) => page.metrics).find((item) => item.key === key);
      return metric
        ? {
            status: metric.implementationStatus,
            readiness: metric.readiness.state,
            hasValue: metric.value !== null,
            unavailableReason: metric.unavailableReason,
          }
        : "absent";
    };
    const keys = [
      "klaviyo.email_overview",
      "klaviyo.email_recipients",
      "klaviyo.email_delivery_rate",
      "klaviyo.email_open_rate",
      "klaviyo.email_click_rate",
      "klaviyo.email_unsubscribe_rate",
      "klaviyo.attributed_revenue",
      "klaviyo.campaign_performance",
      "klaviyo.flow_performance",
      "klaviyo.engagement_trend",
      "klaviyo.email_funnel",
      "klaviyo.email_click_to_open_rate",
      "klaviyo.email_bounce_rate",
      "klaviyo.email_spam_complaints",
      "klaviyo.sms_overview",
      "klaviyo.sms_sent",
      "klaviyo.sms_delivered",
      "klaviyo.sms_clicked",
      "klaviyo.sms_failed",
      "klaviyo.sms_unsubscribed",
      "customers.age_mix",
      "customers.sex_mix",
      "quality.klaviyo_no_activity",
    ];
    console.info(
      JSON.stringify(
        {
          klaviyoSource: klaviyoSource
            ? { state: klaviyoSource.state, warnings: klaviyoSource.warningCodes }
            : "absent",
          metrics: Object.fromEntries(keys.map((key) => [key, view(key)])),
        },
        null,
        2,
      ),
    );
    expect(klaviyoSource?.state).not.toBe("error");
  });
});
