import { z } from "zod";

import { isoDateSchema, isoInstantSchema } from "@/src/domain/contracts/primitives";

export const shopifyHistorySchema = z
  .object({
    mode: z.enum(["aggregate", "detailed"]),
    completeness: z.enum(["complete", "partial"]),
    requestedStartDate: isoDateSchema,
    requestedEndDate: isoDateSchema,
    earliestDetailedRecordAt: isoInstantSchema.nullable(),
    hasReadAllOrders: z.boolean(),
    warningCodes: z.array(z.string()),
  })
  .strict();

export type ShopifyHistory = z.infer<typeof shopifyHistorySchema>;

export function buildShopifyHistory(input: {
  mode: "aggregate" | "detailed";
  requestedStartDate: string;
  requestedEndDate: string;
  earliestDetailedRecordAt: string | null;
  hasReadAllOrders: boolean;
  detailedRangeVerified: boolean;
}): ShopifyHistory {
  const detailedIsComplete =
    input.mode === "detailed" && input.hasReadAllOrders && input.detailedRangeVerified;
  return shopifyHistorySchema.parse({
    mode: input.mode,
    completeness: input.mode === "aggregate" || detailedIsComplete ? "complete" : "partial",
    requestedStartDate: input.requestedStartDate,
    requestedEndDate: input.requestedEndDate,
    earliestDetailedRecordAt: input.earliestDetailedRecordAt,
    hasReadAllOrders: input.hasReadAllOrders,
    warningCodes:
      input.mode === "detailed" && !detailedIsComplete ? ["SHOPIFY_DETAILED_HISTORY_PARTIAL"] : [],
  });
}
