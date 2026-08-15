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

import { loadKlaviyoConfigurationOrNull } from "@/src/infrastructure/klaviyo/runtime";
import { loadShopifyRuntimeSettingsOrNull } from "@/src/infrastructure/shopify/runtime";
import { loadSheetsApiConfigurationOrNull } from "@/src/infrastructure/sheets-api/config";

import { createBackendApiRuntime } from "./live-runtime";
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
        // Readiness reflects the live source probes. Production certification
        // stays "deferred" until the B8/B9/I4 certification gates are run.
        const unusable = sources.filter(({ state }) =>
          ["error", "unavailable", "invalid"].includes(state),
        );
        const unconfigured = sources.filter(({ state }) => state === "not_configured");
        const allConfiguredUsable = unusable.length === 0 && unconfigured.length === 0;
        const readiness =
          unusable.length > 0
            ? {
                state: "partial" as const,
                message: `Configured sources are failing: ${unusable
                  .map(({ source }) => source)
                  .join(", ")}.`,
                warningCodes: ["LIVE_SOURCE_FAILURE"],
              }
            : allConfiguredUsable
              ? {
                  state: "current" as const,
                  message: "All sources are configured and answering read-only probes.",
                  warningCodes: [],
                }
              : {
                  state: "partial" as const,
                  message: `Sources awaiting configuration: ${unconfigured
                    .map(({ source }) => source)
                    .join(", ")}.`,
                  warningCodes: ["LIVE_CREDENTIAL_VERIFICATION_DEFERRED"],
                };
        return successResponse({
          data: {
            application: "ready",
            frontendDevelopment: "ready",
            productionCertification: "deferred",
            readiness,
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

export const backendApiService = new BackendApiService(
  createBackendApiRuntime({
    shopify: loadShopifyRuntimeSettingsOrNull,
    klaviyo: loadKlaviyoConfigurationOrNull,
    sheets: () => loadSheetsApiConfigurationOrNull("dashboard"),
    executiveSheets: () => loadSheetsApiConfigurationOrNull("executive"),
  }),
  now,
);
export const apiHandlers = createApiHandlers(backendApiService, now);
