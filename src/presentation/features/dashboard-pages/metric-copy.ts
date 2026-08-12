import type { MetricCatalogEntry } from "@/src/domain/metrics/catalog";

/**
 * Presentation-only refinements for catalog labels that also appear in API
 * payloads. Keeping the overrides here improves dashboard readability without
 * changing the approved domain catalog or response values.
 */
const metricLabelOverrides: Readonly<Record<string, string>> = Object.freeze({
  "executive.business_health_score": "Business health score",
  "products.sales": "Product and SKU sales",
  "products.units_velocity": "Unit sales velocity trend",
  "inventory.runway_reorder": "Inventory runway and reorder alert",
  "inventory.combined": "Combined SNAPL and YBYD inventory",
  "marketing.ltv_cac": "LTV-to-CAC ratio",
  "social.performance": "Social audience growth",
  "finance.actual_margin": "Actual gross margin",
  "finance.monthly_burn": "Monthly net burn",
});

export function metricDisplayLabel(metric: Pick<MetricCatalogEntry, "key" | "label">): string {
  return metricLabelOverrides[metric.key] ?? metric.label;
}
