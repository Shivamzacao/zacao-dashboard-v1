import { z } from "zod";

import { cacheMetadataSchema } from "./cache";
import { apiErrorSchema } from "./errors";
import { contractSchemaVersionSchema } from "./schema-version";
import { sourceStatusSchema } from "./source-status";

export const apiMetadataSchema = z
  .object({
    schemaVersion: contractSchemaVersionSchema,
    requestId: z.string().uuid(),
    cache: cacheMetadataSchema,
    sources: z.array(sourceStatusSchema),
  })
  .strict();

export function apiSuccessSchema<T extends z.ZodType>(dataSchema: T) {
  return z
    .object({
      ok: z.literal(true),
      data: dataSchema,
      meta: apiMetadataSchema,
    })
    .strict();
}

export const apiFailureSchema = z
  .object({
    ok: z.literal(false),
    error: apiErrorSchema,
    requestId: z.string().uuid(),
  })
  .strict();
