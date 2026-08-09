import { z } from "zod";

import { dashboardPageViewModelSchema } from "@/src/application/view-models";
import {
  apiSuccessSchema,
  cacheMetadataSchema,
  paginationMetaSchema,
  readinessSchema,
  sourceStatusSchema,
} from "@/src/domain/contracts";

const filterOptionsSchema = z
  .object({
    comparisons: z.array(z.enum(["none", "previous_period", "previous_year"])),
    channels: z.array(z.string().min(1)),
    productSkus: z.array(z.string().min(1)),
    locations: z.array(z.string().min(1)),
  })
  .strict();

export const dashboardApiDataSchema = z
  .object({
    page: dashboardPageViewModelSchema,
    supportedFilters: filterOptionsSchema,
  })
  .strict();
export const dashboardApiResponseSchema = apiSuccessSchema(dashboardApiDataSchema);

export const safeApiCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const drilldownApiDataSchema = z
  .object({
    dataset: z.string().min(1),
    columns: z.array(z.string().min(1)),
    rows: z.array(z.record(z.string(), safeApiCellSchema)).max(100),
    pagination: paginationMetaSchema,
    readiness: readinessSchema,
    sources: z.array(sourceStatusSchema),
  })
  .strict();
export const drilldownApiResponseSchema = apiSuccessSchema(drilldownApiDataSchema);

export const livenessApiDataSchema = z
  .object({
    status: z.literal("live"),
    schemaVersion: z.literal("1.0"),
  })
  .strict();
export const livenessApiResponseSchema = apiSuccessSchema(livenessApiDataSchema);

export const readinessApiDataSchema = z
  .object({
    application: z.literal("ready"),
    frontendDevelopment: z.literal("ready"),
    productionCertification: z.literal("deferred"),
    readiness: readinessSchema,
  })
  .strict();
export const readinessApiResponseSchema = apiSuccessSchema(readinessApiDataSchema);

export const sourceStatusApiDataSchema = z
  .object({
    productionCertification: z.literal("deferred"),
    sources: z.array(sourceStatusSchema),
  })
  .strict();
export const sourceStatusApiResponseSchema = apiSuccessSchema(sourceStatusApiDataSchema);

export const endpointCacheMetadataSchema = cacheMetadataSchema;

export type DashboardApiResponse = z.infer<typeof dashboardApiResponseSchema>;
export type DrilldownApiResponse = z.infer<typeof drilldownApiResponseSchema>;
export type LivenessApiResponse = z.infer<typeof livenessApiResponseSchema>;
export type ReadinessApiResponse = z.infer<typeof readinessApiResponseSchema>;
export type SourceStatusApiResponse = z.infer<typeof sourceStatusApiResponseSchema>;
export type FilterOptions = z.infer<typeof filterOptionsSchema>;
