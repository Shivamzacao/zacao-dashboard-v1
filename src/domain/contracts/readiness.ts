import { z } from "zod";

export const readinessStateSchema = z.enum([
  "loading",
  "current",
  "no_activity",
  "not_configured",
  "partial",
  "stale",
  "invalid",
  "unavailable",
  "error",
]);

export const readinessSchema = z
  .object({
    state: readinessStateSchema,
    message: z.string().trim().min(1).max(500).nullable(),
    warningCodes: z.array(z.string().trim().min(1).max(100)),
  })
  .strict();

export type ReadinessState = z.infer<typeof readinessStateSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
