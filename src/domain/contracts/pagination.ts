import { z } from "zod";

export const paginationRequestSchema = z
  .object({
    cursor: z.string().trim().min(1).max(500).nullable(),
    limit: z.number().int().min(1).max(100),
  })
  .strict();

export const paginationMetaSchema = z
  .object({
    nextCursor: z.string().min(1).nullable(),
    hasNextPage: z.boolean(),
  })
  .strict();

export type PaginationRequest = z.infer<typeof paginationRequestSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
