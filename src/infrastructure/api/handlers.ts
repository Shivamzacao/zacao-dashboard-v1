import { randomUUID } from "node:crypto";

import {
  BackendApiService,
  dashboardApiDataSchema,
  dashboardSlugToSection,
  drilldownApiDataSchema,
  drilldownDefinition,
  livenessApiDataSchema,
  parseDashboardFilters,
  parseDrilldownQuery,
  ApiQueryError,
  readinessApiDataSchema,
  sourceStatusApiDataSchema,
} from "@/src/application/api";
import { CONTRACT_SCHEMA_VERSION } from "@/src/domain/contracts";

import { DefaultBackendApiRuntime } from "./default-runtime";
import { PRIVATE_API_HEADERS, problemResponse, successResponse } from "./serialization";

function bypass(now: string) {
  return { state: "bypass" as const, generatedAt: now, expiresAt: null };
}

export function createApiHandlers(service: BackendApiService, now: () => Date) {
  return {
    async dashboard(request: Request, slug: string): Promise<Response> {
      const requestId = randomUUID();
      try {
        const section = dashboardSlugToSection[slug as keyof typeof dashboardSlugToSection];
        if (!section) throw new ApiQueryError("Unsupported dashboard", ["dashboard"]);
        const filters = parseDashboardFilters(
          new URL(request.url).searchParams,
          service.supportedFilters,
        );
        const result = await service.dashboard(section, filters);
        return successResponse({ ...result, dataSchema: dashboardApiDataSchema, requestId });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },

    async drilldown(request: Request, dataset: string): Promise<Response> {
      const requestId = randomUUID();
      try {
        const definition = drilldownDefinition(dataset);
        if (!definition) throw new ApiQueryError("Unsupported drill-down dataset", ["dataset"]);
        const query = parseDrilldownQuery(
          new URL(request.url).searchParams,
          service.supportedFilters,
          definition,
        );
        const result = await service.drilldown(dataset, query);
        return successResponse({ ...result, dataSchema: drilldownApiDataSchema, requestId });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },

    async exportCsv(request: Request, dataset: string): Promise<Response> {
      const requestId = randomUUID();
      try {
        const definition = drilldownDefinition(dataset);
        if (!definition?.exportable)
          throw new ApiQueryError("Unsupported export dataset", ["dataset"]);
        const query = parseDrilldownQuery(
          new URL(request.url).searchParams,
          service.supportedFilters,
          definition,
        );
        const result = await service.exportCsv(dataset, query);
        return new Response(result.body, {
          headers: {
            ...PRIVATE_API_HEADERS,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${result.filename}"`,
            "X-Request-Id": requestId,
          },
        });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },

    async liveness(request: Request): Promise<Response> {
      const requestId = randomUUID();
      try {
        if ([...new URL(request.url).searchParams.keys()].length > 0)
          throw new ApiQueryError("Health endpoint does not accept query parameters");
        const timestamp = now().toISOString();
        return successResponse({
          data: { status: "live", schemaVersion: CONTRACT_SCHEMA_VERSION },
          dataSchema: livenessApiDataSchema,
          cache: bypass(timestamp),
          sources: [],
          requestId,
        });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },

    async readiness(request: Request): Promise<Response> {
      const requestId = randomUUID();
      try {
        if ([...new URL(request.url).searchParams.keys()].length > 0)
          throw new ApiQueryError("Readiness endpoint does not accept query parameters");
        const sources = await service.sourceStatuses();
        const timestamp = now().toISOString();
        return successResponse({
          data: {
            application: "ready",
            frontendDevelopment: "ready",
            productionCertification: "deferred",
            readiness: {
              state: "not_configured",
              message:
                "Live source verification is deferred and does not block frontend development.",
              warningCodes: ["LIVE_SOURCE_VERIFICATION_DEFERRED"],
            },
          },
          dataSchema: readinessApiDataSchema,
          cache: bypass(timestamp),
          sources,
          requestId,
        });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },

    async sourceStatus(request: Request): Promise<Response> {
      const requestId = randomUUID();
      try {
        if ([...new URL(request.url).searchParams.keys()].length > 0)
          throw new ApiQueryError("Source-status endpoint does not accept query parameters");
        const sources = await service.sourceStatuses();
        const timestamp = now().toISOString();
        return successResponse({
          data: { productionCertification: "deferred", sources: [...sources] },
          dataSchema: sourceStatusApiDataSchema,
          cache: bypass(timestamp),
          sources,
          requestId,
        });
      } catch (error) {
        return problemResponse(error, requestId);
      }
    },
  };
}

const now = () => new Date();
export const apiHandlers = createApiHandlers(
  new BackendApiService(new DefaultBackendApiRuntime(), now),
  now,
);
