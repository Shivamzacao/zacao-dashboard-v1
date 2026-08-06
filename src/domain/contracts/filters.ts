import { z } from "zod";

import { comparisonModeSchema, dateRangeSchema } from "./date-range";
import { nonEmptyIdentifierSchema } from "./primitives";

const filterValuesSchema = z.array(nonEmptyIdentifierSchema).max(100);

export const dashboardFiltersSchema = dateRangeSchema
  .extend({
    comparison: comparisonModeSchema,
    channels: filterValuesSchema,
    productSkus: filterValuesSchema,
    locations: filterValuesSchema,
  })
  .strict();

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
