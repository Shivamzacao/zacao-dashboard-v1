import { z } from "zod";

export const usdMoneySchema = z
  .object({
    currency: z.literal("USD"),
    minorUnits: z.number().int().safe(),
  })
  .strict();

export type UsdMoney = z.infer<typeof usdMoneySchema>;
