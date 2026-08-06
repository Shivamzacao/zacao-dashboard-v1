import { z } from "zod";

export const REQUIRED_KLAVIYO_READ_SCOPES = [
  "accounts:read",
  "campaigns:read",
  "events:read",
  "flows:read",
  "metrics:read",
] as const;

const readScopeSchema = z.string().regex(/^[a-z_]+:read$/);

export const klaviyoConfigurationSchema = z
  .object({
    privateApiKey: z.string().min(8),
    apiRevision: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
    grantedScopes: z.array(readScopeSchema),
    reportingTimeZone: z.literal("America/New_York"),
    timeoutMs: z.number().int().min(1_000).max(30_000),
    maxRetries: z.number().int().min(0).max(2),
  })
  .strict()
  .superRefine(({ grantedScopes }, context) => {
    const missing = REQUIRED_KLAVIYO_READ_SCOPES.filter((scope) => !grantedScopes.includes(scope));
    if (missing.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["grantedScopes"],
        message: `Missing required Klaviyo read scopes: ${missing.join(", ")}`,
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
