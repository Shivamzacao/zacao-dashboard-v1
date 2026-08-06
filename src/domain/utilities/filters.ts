import { dashboardFiltersSchema, type DashboardFilters } from "../contracts";

function normalizedValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function normalizeDashboardFilters(input: DashboardFilters): DashboardFilters {
  return dashboardFiltersSchema.parse({
    ...input,
    channels: normalizedValues(input.channels),
    productSkus: normalizedValues(input.productSkus),
    locations: normalizedValues(input.locations),
  });
}
