import { z } from "zod";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO calendar date (YYYY-MM-DD)")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === (month ?? 1) - 1 &&
      date.getUTCDate() === day
    );
  }, "Expected a real calendar date");

export const isoInstantSchema = z.string().datetime({ offset: true });
export const nonEmptyIdentifierSchema = z.string().trim().min(1).max(200);

export type IsoDate = z.infer<typeof isoDateSchema>;
export type IsoInstant = z.infer<typeof isoInstantSchema>;
