import { z } from "zod";

export const REQUIRED_SHOPIFY_READ_SCOPES = [
  "read_analytics",
  "read_customers",
  "read_inventory",
  "read_locations",
  "read_orders",
  "read_products",
  "read_reports",
] as const;

const shopifyScopeSchema = z.string().regex(/^read_[a-z0-9_]+$/);

export const shopifyConfigurationSchema = z
  .object({
    storeDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
    apiVersion: z.string().regex(/^20\d{2}-(01|04|07|10)$/),
    grantedScopes: z.array(shopifyScopeSchema),
    timeoutMs: z.number().int().min(1_000).max(30_000),
    maxRetries: z.number().int().min(0).max(2),
  })
  .strict()
  .superRefine(({ grantedScopes }, context) => {
    const missingScopes = REQUIRED_SHOPIFY_READ_SCOPES.filter(
      (scope) => !grantedScopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["grantedScopes"],
        message: `Missing required Shopify read scopes: ${missingScopes.join(", ")}`,
      });
    }
  });

export type ShopifyConfiguration = z.infer<typeof shopifyConfigurationSchema>;

export function parseShopifyConfiguration(input: unknown): ShopifyConfiguration {
  return shopifyConfigurationSchema.parse(input);
}

export function assertReadOnlyScopes(scopes: readonly string[]): void {
  const forbidden = scopes.filter((scope) => !shopifyScopeSchema.safeParse(scope).success);
  if (forbidden.length > 0) {
    throw new Error(`Shopify scopes must be read-only: ${forbidden.join(", ")}`);
  }
}
