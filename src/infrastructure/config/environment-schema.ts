import { z } from "zod";

import { assertValidTimeZone } from "@/src/domain/utilities/time";

const reportingTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((timeZone, context) => {
    try {
      assertValidTimeZone(timeZone);
    } catch {
      context.addIssue({
        code: "custom",
        message: "REPORTING_TIMEZONE must be a valid IANA timezone",
      });
    }
  });

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    REPORTING_TIMEZONE: reportingTimeZoneSchema,
    REPORTING_CURRENCY: z.literal("USD"),
  })
  .strict();

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(input: unknown): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}
