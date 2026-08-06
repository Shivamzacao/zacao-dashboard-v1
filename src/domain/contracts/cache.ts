import { z } from "zod";

import { isoInstantSchema } from "./primitives";

export const cacheStateSchema = z.enum(["hit", "miss", "stale", "bypass"]);

export const cacheMetadataSchema = z
  .object({
    state: cacheStateSchema,
    generatedAt: isoInstantSchema,
    expiresAt: isoInstantSchema.nullable(),
  })
  .strict();

export const cachePolicySchema = z
  .object({
    freshForSeconds: z.number().int().min(0),
    staleForSeconds: z.number().int().min(0),
  })
  .strict();

export type CacheMetadata = z.infer<typeof cacheMetadataSchema>;
export type CachePolicy = z.infer<typeof cachePolicySchema>;
