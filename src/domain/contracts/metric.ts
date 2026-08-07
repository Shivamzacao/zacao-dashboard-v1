import { z } from "zod";

import { contractSchemaVersionSchema } from "./schema-version";
import { sourceKeySchema } from "./source-status";

export const metricKeySchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/);
export const metricDefinitionVersionSchema = z.string().regex(/^\d+\.\d+$/);
export const metricClassSchema = z.enum(["core", "future_ready_core", "conditional"]);
export const metricValueKindSchema = z.enum([
  "money",
  "count",
  "quantity",
  "rate_basis_points",
  "duration_seconds",
  "date",
  "status",
]);

export const metricDefinitionSchema = z
  .object({
    key: metricKeySchema,
    schemaVersion: contractSchemaVersionSchema,
    definitionVersion: metricDefinitionVersionSchema,
    classification: metricClassSchema,
    valueKind: metricValueKindSchema,
    sourceKeys: z.array(sourceKeySchema).min(1),
    description: z.string().trim().min(1).max(500),
  })
  .strict();

export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;
export type MetricValueKind = z.infer<typeof metricValueKindSchema>;
