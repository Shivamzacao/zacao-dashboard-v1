import { z } from "zod";

export const klaviyoMetricKeySchema = z.enum([
  "received_email",
  "opened_email",
  "clicked_email",
  "bounced_email",
  "dropped_email",
  "email_spam",
  "email_unsubscribe_click",
  "sent_text",
  "received_text",
  "opened_text",
  "clicked_text",
  "failed_text",
  "unsubscribed_text",
  "subscribed_text",
  "checkout_started",
  "placed_order",
  "ordered_product",
  "fulfilled_order",
  "refunded_order",
  "cancelled_order",
  "viewed_product",
  "active_on_site",
]);

export type KlaviyoMetricKey = z.infer<typeof klaviyoMetricKeySchema>;

interface VerifiedMetric {
  readonly key: KlaviyoMetricKey;
  readonly id: string;
  readonly name: string;
  readonly integration: "Klaviyo" | "Shopify" | "API/onsite";
}

export const VERIFIED_KLAVIYO_METRICS: readonly VerifiedMetric[] = [
  { key: "received_email", id: "XKVkHG", name: "Received Email", integration: "Klaviyo" },
  { key: "opened_email", id: "Ub5zGJ", name: "Opened Email", integration: "Klaviyo" },
  { key: "clicked_email", id: "RhS7DM", name: "Clicked Email", integration: "Klaviyo" },
  { key: "bounced_email", id: "VkMVgn", name: "Bounced Email", integration: "Klaviyo" },
  { key: "dropped_email", id: "X9dNLR", name: "Dropped Email", integration: "Klaviyo" },
  { key: "email_spam", id: "Tyn3KT", name: "Marked Email as Spam", integration: "Klaviyo" },
  {
    key: "email_unsubscribe_click",
    id: "RKWafq",
    name: "Clicked email to unsubscribe",
    integration: "Klaviyo",
  },
  { key: "sent_text", id: "Srzt4U", name: "Sent Text Message", integration: "Klaviyo" },
  { key: "received_text", id: "XTumVK", name: "Received Text Message", integration: "Klaviyo" },
  { key: "opened_text", id: "RNyqsh", name: "Opened Text", integration: "Klaviyo" },
  { key: "clicked_text", id: "Vu3rND", name: "Clicked Text Message", integration: "Klaviyo" },
  {
    key: "failed_text",
    id: "Xgtjj8",
    name: "Failed to Deliver Text Message",
    integration: "Klaviyo",
  },
  {
    key: "unsubscribed_text",
    id: "RgaCb4",
    name: "Unsubscribed from Text Messaging Marketing",
    integration: "Klaviyo",
  },
  {
    key: "subscribed_text",
    id: "WDsgGv",
    name: "Subscribed to Text Messaging Marketing",
    integration: "Klaviyo",
  },
  { key: "checkout_started", id: "QQ7zHW", name: "Checkout Started", integration: "Shopify" },
  { key: "placed_order", id: "Rt8Ckz", name: "Placed Order", integration: "Shopify" },
  { key: "ordered_product", id: "UvAB6i", name: "Ordered Product", integration: "Shopify" },
  { key: "fulfilled_order", id: "V3Ypmx", name: "Fulfilled Order", integration: "Shopify" },
  { key: "refunded_order", id: "WQqgS2", name: "Refunded Order", integration: "Shopify" },
  { key: "cancelled_order", id: "TfyvR4", name: "Cancelled Order", integration: "Shopify" },
  { key: "viewed_product", id: "T6hZag", name: "Viewed Product", integration: "API/onsite" },
  { key: "active_on_site", id: "VvJVhn", name: "Active on Site", integration: "API/onsite" },
] as const;

const providerMetricSchema = z.object({
  id: z.string(),
  name: z.string(),
  integration: z.string(),
});

export function reconcileKlaviyoMetricRegistry(providerMetrics: readonly unknown[]) {
  const metrics = providerMetrics.map((metric) => providerMetricSchema.parse(metric));
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  return VERIFIED_KLAVIYO_METRICS.map((verified) => {
    const provider = byId.get(verified.id);
    const status = !provider
      ? "missing"
      : provider.name === verified.name
        ? "verified"
        : "conflict";
    return { ...verified, status } as const;
  });
}

export const KLAVIYO_ATTRIBUTED_REVENUE_LABEL = "Klaviyo-attributed revenue" as const;
