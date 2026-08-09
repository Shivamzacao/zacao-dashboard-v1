import { z } from "zod";

const resourceSchema = z.object({ id: z.string(), type: z.string(), attributes: z.unknown() });

const accountAttributesSchema = z.object({
  timezone: z.string(),
  preferred_currency: z.string(),
  locale: z.string(),
  test_account: z.boolean(),
});

const metricAttributesSchema = z.object({
  name: z.string(),
  integration: z.union([z.string(), z.object({ name: z.string() })]),
  created: z.string().optional(),
  updated: z.string().optional(),
});

const campaignAttributesSchema = z.object({
  name: z.string(),
  status: z.string(),
  send_time: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const flowAttributesSchema = z.object({
  name: z.string(),
  status: z.string(),
  trigger_type: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});

export function normalizeKlaviyoAccount(value: unknown) {
  const resource = resourceSchema.parse(value);
  const attributes = accountAttributesSchema.parse(resource.attributes);
  return {
    id: resource.id,
    timezone: attributes.timezone,
    preferredCurrency: attributes.preferred_currency,
    locale: attributes.locale,
    testAccount: attributes.test_account,
  } as const;
}

export function normalizeKlaviyoMetric(value: unknown) {
  const resource = resourceSchema.parse(value);
  const attributes = metricAttributesSchema.parse(resource.attributes);
  return {
    id: resource.id,
    name: attributes.name,
    integration:
      typeof attributes.integration === "string"
        ? attributes.integration
        : attributes.integration.name,
    createdAt: attributes.created ?? null,
    updatedAt: attributes.updated ?? null,
  } as const;
}

export function normalizeKlaviyoCampaign(value: unknown) {
  const resource = resourceSchema.parse(value);
  const attributes = campaignAttributesSchema.parse(resource.attributes);
  return {
    id: resource.id,
    name: attributes.name,
    status: attributes.status,
    sendTime: attributes.send_time ?? null,
    createdAt: attributes.created_at ?? null,
    updatedAt: attributes.updated_at ?? null,
  } as const;
}

export function normalizeKlaviyoFlow(value: unknown) {
  const resource = resourceSchema.parse(value);
  const attributes = flowAttributesSchema.parse(resource.attributes);
  return {
    id: resource.id,
    name: attributes.name,
    status: attributes.status,
    triggerType: attributes.trigger_type ?? null,
    createdAt: attributes.created ?? null,
    updatedAt: attributes.updated ?? null,
  } as const;
}

const reportRowSchema = z.object({
  groupings: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  statistics: z.record(z.string(), z.number().nullable()),
});

export function normalizeKlaviyoReportRows(value: unknown) {
  return z.array(reportRowSchema).parse(value);
}

const aggregateAttributesSchema = z.object({
  dates: z.array(z.string()),
  data: z.array(
    z.object({
      dimensions: z.array(z.string()).optional(),
      measurements: z.record(z.string(), z.array(z.number().nullable())),
    }),
  ),
});

export function normalizeKlaviyoAggregate(value: unknown) {
  // The live API returns one shared `dates` axis at the attributes level;
  // attach it to every series entry so consumers stay per-series.
  const attributes = aggregateAttributesSchema.parse(value);
  return attributes.data.map((entry) => ({
    ...(entry.dimensions === undefined ? {} : { dimensions: entry.dimensions }),
    dates: attributes.dates,
    measurements: entry.measurements,
  }));
}

const piiKeys =
  /^(email|phone|phone_number|address|street|postal_code|zip|profile|first_name|last_name)$/i;

export function assertNoKlaviyoPii(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoKlaviyoPii);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (piiKeys.test(key))
        throw new Error(`Klaviyo aggregate output contains forbidden PII field: ${key}`);
      assertNoKlaviyoPii(nested);
    }
  }
}

export function klaviyoActivityState(records: readonly unknown[]): "current" | "no_activity" {
  return records.length === 0 ? "no_activity" : "current";
}
