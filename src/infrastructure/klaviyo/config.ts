import { z } from "zod";

export const REQUIRED_KLAVIYO_READ_SCOPES = [
  "accounts:read",
  "campaigns:read",
  "events:read",
  "flows:read",
  "metrics:read",
] as const;

export const KLAVIYO_PROFILE_READ_SCOPE = "profiles:read" as const;

export const klaviyoDemographicPropertiesSchema = z
  .object({
    ageBand: z.string().trim().min(1).max(100),
    gender: z.string().trim().min(1).max(100),
  })
  .strict();

export type KlaviyoDemographicProperties = z.infer<typeof klaviyoDemographicPropertiesSchema>;

const readScopeSchema = z.string().regex(/^[a-z_]+:read$/);

export const klaviyoConfigurationSchema = z
  .object({
    privateApiKey: z.string().min(8),
    apiRevision: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
    grantedScopes: z.array(readScopeSchema),
    reportingTimeZone: z.literal("America/New_York"),
    timeoutMs: z.number().int().min(1_000).max(30_000),
    maxRetries: z.number().int().min(0).max(2),
    demographicProperties: klaviyoDemographicPropertiesSchema.nullable().optional(),
  })
  .strict()
  .superRefine(({ grantedScopes, demographicProperties }, context) => {
    const missing = REQUIRED_KLAVIYO_READ_SCOPES.filter((scope) => !grantedScopes.includes(scope));
    if (missing.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["grantedScopes"],
        message: `Missing required Klaviyo read scopes: ${missing.join(", ")}`,
      });
    }
    if (
      grantedScopes.length > 0 &&
      demographicProperties &&
      !grantedScopes.includes(KLAVIYO_PROFILE_READ_SCOPE)
    ) {
      context.addIssue({
        code: "custom",
        path: ["grantedScopes"],
        message: `Missing required Klaviyo read scope: ${KLAVIYO_PROFILE_READ_SCOPE}`,
      });
    }
  });

export type KlaviyoConfiguration = z.infer<typeof klaviyoConfigurationSchema>;

export function parseKlaviyoConfiguration(input: unknown): KlaviyoConfiguration {
  return klaviyoConfigurationSchema.parse(input);
}

export function assertKlaviyoReadOnlyScopes(scopes: readonly string[]): void {
  const forbidden = scopes.filter((scope) => !readScopeSchema.safeParse(scope).success);
  if (forbidden.length > 0) {
    throw new Error(`Klaviyo scopes must be read-only: ${forbidden.join(", ")}`);
  }
}
