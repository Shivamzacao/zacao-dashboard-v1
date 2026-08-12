import { z } from "zod";

import { dateRangeSchema } from "./date-range";
import { nonEmptyIdentifierSchema } from "./primitives";

const filterValuesSchema = z.array(nonEmptyIdentifierSchema).max(100);

export const dashboardFiltersSchema = dateRangeSchema
  .extend({
    channels: filterValuesSchema,
    productSkus: filterValuesSchema,
    locations: filterValuesSchema,
  })
  .strict();

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
