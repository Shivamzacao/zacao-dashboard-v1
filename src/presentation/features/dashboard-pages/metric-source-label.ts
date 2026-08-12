import type { SourceKey } from "@/src/domain/contracts";
import type { MetricCatalogEntry } from "@/src/domain/metrics/catalog";

const SOURCE_LABELS: Readonly<Record<SourceKey, string>> = Object.freeze({
  shopify: "Shopify",
  klaviyo: "Klaviyo",
  google_sheets: "Google Sheets",
  google_drive: "Google Drive",
});

export function metricSourceLabel(
  metric: Pick<MetricCatalogEntry, "sourceKeys">,
  override?: string,
): string {
  return override ?? metric.sourceKeys.map((source) => SOURCE_LABELS[source]).join(" + ");
}
