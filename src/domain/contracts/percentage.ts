import { z } from "zod";

export const basisPointsSchema = z.number().int().safe();
export const rateBasisPointsSchema = basisPointsSchema.min(0).max(10_000);

export type BasisPoints = z.infer<typeof basisPointsSchema>;
export type RateBasisPoints = z.infer<typeof rateBasisPointsSchema>;
