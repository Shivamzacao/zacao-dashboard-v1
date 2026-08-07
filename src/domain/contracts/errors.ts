import { z } from "zod";

export const errorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNSUPPORTED_FILTER",
  "SOURCE_NOT_CONFIGURED",
  "SOURCE_UNAVAILABLE",
  "SOURCE_INVALID",
  "INTERNAL_ERROR",
]);

export const errorDetailSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number().int()])),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    code: errorCodeSchema,
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean(),
    details: z.array(errorDetailSchema),
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiProblemSchema = z
  .object({
    type: z.string().url(),
    title: z.string().trim().min(1).max(120),
    status: z.number().int().min(400).max(599),
    code: errorCodeSchema,
    detail: z.string().trim().min(1).max(500),
    requestId: z.string().uuid(),
    errors: z.array(errorDetailSchema),
  })
  .strict();

export type ApiProblem = z.infer<typeof apiProblemSchema>;
