import { z } from "zod";

import { isoInstantSchema } from "./primitives";
import { readinessStateSchema } from "./readiness";

export const sourceKeySchema = z.enum([
  "shopify",
  "klaviyo",
  "google_drive",
  "google_sheets",
  "manual_workbook",
]);
export const completenessSchema = z.enum(["complete", "partial", "unknown"]);

export const sourceStatusSchema = z
  .object({
    source: sourceKeySchema,
    state: readinessStateSchema.exclude(["loading"]),
    checkedAt: isoInstantSchema,
    lastSuccessfulAt: isoInstantSchema.nullable(),
    dataAsOf: isoInstantSchema.nullable(),
    completeness: completenessSchema,
    warningCodes: z.array(z.string().trim().min(1).max(100)),
  })
  .strict();

export type SourceKey = z.infer<typeof sourceKeySchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
