import { z } from "zod";

import type { DateRange } from "@/src/domain/contracts/date-range";

import type { KlaviyoClient } from "./client";
import type { KlaviyoConfiguration } from "./config";
import { KLAVIYO_ATTRIBUTED_REVENUE_LABEL, VERIFIED_KLAVIYO_METRICS } from "./metric-registry";
import {
  assertNoKlaviyoPii,
  klaviyoActivityState,
  normalizeKlaviyoAccount,
  normalizeKlaviyoAggregate,
  normalizeKlaviyoCampaign,
  normalizeKlaviyoFlow,
  normalizeKlaviyoMetric,
  normalizeKlaviyoReportRows,
} from "./normalization";
import { collectKlaviyoPages } from "./pagination";
import {
  buildCampaignReportRequest,
  buildFlowReportRequest,
  buildMetricAggregateRequest,
  type KlaviyoInterval,
} from "./requests";

const collectionSchema = z.object({ data: z.array(z.unknown()) });
const reportSchema = z.object({
  data: z.object({ attributes: z.object({ results: z.array(z.unknown()) }) }),
});
const aggregateSchema = z.object({ data: z.object({ attributes: z.unknown() }) });

export interface KlaviyoDiscoveryResult<T> {
  readonly records: readonly T[];
  readonly activityState: "current" | "no_activity";
  readonly truncated: boolean;
}

export interface KlaviyoReportResult {
  readonly rows: ReturnType<typeof normalizeKlaviyoReportRows>;
  readonly activityState: "current" | "no_activity";
  readonly timeSemantics: "send_date";
  readonly revenueLabel: typeof KLAVIYO_ATTRIBUTED_REVENUE_LABEL;
}

export interface KlaviyoAggregateResult {
  readonly series: ReturnType<typeof normalizeKlaviyoAggregate>;
  readonly activityState: "current" | "no_activity";
  readonly timeSemantics: "event_time";
  readonly displayTimeZone: "America/New_York";
}

export class KlaviyoAdapter {
  constructor(
    private readonly client: KlaviyoClient,
    private readonly configuration: KlaviyoConfiguration,
    private readonly maxPages = 20,
  ) {}

  async readAccount(signal?: AbortSignal) {
    const response = await this.client.get<unknown>("/api/accounts", signal);
    const parsed = collectionSchema.parse(response.body);
    if (parsed.data.length !== 1)
      throw new Error("Klaviyo account response must contain one account");
    return normalizeKlaviyoAccount(parsed.data[0]);
  }

  async readMetricRegistry(signal?: AbortSignal) {
    return this.discover("/api/metrics?page[size]=100", normalizeKlaviyoMetric, signal);
  }

  async readCampaigns(channel: "email" | "sms", signal?: AbortSignal) {
    const parameters = new URLSearchParams({
      filter: `equals(messages.channel,'${channel}')`,
      "page[size]": "100",
    });
    return this.discover(
      `/api/campaigns?${parameters.toString()}`,
      normalizeKlaviyoCampaign,
      signal,
    );
  }

  async readFlows(signal?: AbortSignal) {
    // The flows collection caps page[size] at 50 (campaigns/metrics allow 100).
    return this.discover("/api/flows?page[size]=50", normalizeKlaviyoFlow, signal);
  }

  async readCampaignReport(
    dateRange: DateRange,
    signal?: AbortSignal,
  ): Promise<KlaviyoReportResult> {
    return this.readReport(
      "/api/campaign-values-reports",
      buildCampaignReportRequest({
        dateRange,
        timeZone: this.configuration.reportingTimeZone,
        conversionMetricId: this.placedOrderMetricId(),
      }),
      signal,
    );
  }

  async readFlowReport(dateRange: DateRange, signal?: AbortSignal): Promise<KlaviyoReportResult> {
    return this.readReport(
      "/api/flow-values-reports",
      buildFlowReportRequest({
        dateRange,
        timeZone: this.configuration.reportingTimeZone,
        conversionMetricId: this.placedOrderMetricId(),
      }),
      signal,
    );
  }

  async readMetricAggregate(input: {
    metricId: string;
    dateRange: DateRange;
    interval: KlaviyoInterval;
    signal?: AbortSignal;
  }): Promise<KlaviyoAggregateResult> {
    const response = await this.client.postReport<unknown>(
      "/api/metric-aggregates",
      buildMetricAggregateRequest({
        metricId: input.metricId,
        dateRange: input.dateRange,
        interval: input.interval,
        timeZone: this.configuration.reportingTimeZone,
      }),
      input.signal,
    );
    const parsed = aggregateSchema.parse(response.body);
    const series = normalizeKlaviyoAggregate(parsed.data.attributes);
    assertNoKlaviyoPii(series);
    const values = series.flatMap((item) => Object.values(item.measurements).flat());
    return {
      series,
      activityState: values.some((value) => typeof value === "number" && value !== 0)
        ? "current"
        : "no_activity",
      timeSemantics: "event_time",
      displayTimeZone: this.configuration.reportingTimeZone,
    };
  }

  async readEventPresence(signal?: AbortSignal): Promise<boolean> {
    const response = await this.client.get<unknown>("/api/events?page[size]=1", signal);
    return collectionSchema.parse(response.body).data.length > 0;
  }

  private async discover<T>(
    path: string,
    normalize: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<KlaviyoDiscoveryResult<T>> {
    const pages = await collectKlaviyoPages({
      client: this.client,
      initialPath: path,
      maxPages: this.maxPages,
      ...(signal ? { signal } : {}),
    });
    const records = pages.records.map(normalize);
    assertNoKlaviyoPii(records);
    return {
      records,
      activityState: klaviyoActivityState(records),
      truncated: pages.truncated,
    };
  }

  private async readReport(
    path: string,
    request: unknown,
    signal?: AbortSignal,
  ): Promise<KlaviyoReportResult> {
    const response = await this.client.postReport<unknown>(path, request, signal);
    const parsed = reportSchema.parse(response.body);
    const rows = normalizeKlaviyoReportRows(parsed.data.attributes.results);
    assertNoKlaviyoPii(rows);
    return {
      rows,
      activityState: klaviyoActivityState(rows),
      timeSemantics: "send_date",
      revenueLabel: KLAVIYO_ATTRIBUTED_REVENUE_LABEL,
    };
  }

  private placedOrderMetricId(): string {
    const metric = VERIFIED_KLAVIYO_METRICS.find(({ key }) => key === "placed_order");
    if (!metric) throw new Error("Verified Placed Order metric is missing");
    return metric.id;
  }
}
