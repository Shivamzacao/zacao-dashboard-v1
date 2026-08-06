import { z } from "zod";

import { isoDateSchema } from "./primitives";

export const dateRangeSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .strict()
  .superRefine(({ startDate, endDate }, context) => {
    if (startDate > endDate) {
      context.addIssue({
        code: "custom",
        message: "startDate must be on or before endDate",
        path: ["endDate"],
      });
    }
  });

export const comparisonModeSchema = z.enum(["none", "previous_period", "previous_year"]);

export type DateRange = z.infer<typeof dateRangeSchema>;
export type ComparisonMode = z.infer<typeof comparisonModeSchema>;
