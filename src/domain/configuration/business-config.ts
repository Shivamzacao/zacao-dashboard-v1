import { z } from "zod";

/**
 * Versioned business configuration that used to be implicit in spreadsheet
 * conventions or buried in adapter constants. Values live in
 * `config/zacao-business-config.json`; every entry carries the evidence it was
 * derived from, so a reviewer can tell a verified value from a guess.
 *
 * Deliberately absent: channel mappings, pack sizes, stock bands and KPI
 * targets. Those are still owned by the workbook (Channel_Mapping, SKU_Master,
 * Metric_Targets) and must be exported from it — not re-typed here — before
 * they can move. See docs/migration/CONFIGURATION.md.
 */

export const feeLineCategorySchema = z.enum([
  "marketplace_commission",
  "payment_processing_fee",
  "other_fee",
]);
export type FeeLineCategory = z.infer<typeof feeLineCategorySchema>;

const feeSkuSchema = z
  .object({
    sku: z.string().trim().min(1),
    category: feeLineCategorySchema,
    channel: z.string().trim().min(1),
    evidence: z.string().trim().min(1),
  })
  .strict();

const pagingSchema = z
  .object({
    pageSize: z.number().int().min(1).max(250),
    maxPages: z.number().int().min(1).max(2_000),
  })
  .strict();

export const businessConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    lineItemClassification: z
      .object({
        feeSkus: z.array(feeSkuSchema).superRefine((entries, context) => {
          const seen = new Set<string>();
          for (const entry of entries) {
            const key = entry.sku.toUpperCase();
            if (seen.has(key)) {
              context.addIssue({ code: "custom", message: `Duplicate fee SKU ${entry.sku}` });
            }
            seen.add(key);
          }
        }),
      })
      .strict(),
    shopify: z
      .object({
        orders: pagingSchema,
        catalog: pagingSchema,
        analyticsMaxThrottleWaitMs: z.number().int().min(1_000).max(300_000),
      })
      .strict(),
  })
  .strict();

export type BusinessConfiguration = z.infer<typeof businessConfigurationSchema>;

export function parseBusinessConfiguration(input: unknown): BusinessConfiguration {
  return businessConfigurationSchema.parse(input);
}
