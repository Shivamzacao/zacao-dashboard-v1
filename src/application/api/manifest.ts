import { dashboardSlugToSection, drilldownCatalog } from "./catalog";

export const apiContractManifest = Object.freeze({
  schemaVersion: "1.0",
  reportingTimeZone: "America/New_York",
  currency: "USD",
  cacheControl: "private, no-store",
  endpoints: {
    liveness: "/api/v1/health",
    readiness: "/api/v1/health/readiness",
    sourceStatus: "/api/v1/sources/status",
    dashboard: "/api/v1/dashboards/{dashboard}",
    drilldown: "/api/v1/drilldowns/{dataset}",
    export: "/api/v1/exports/{dataset}",
  },
  dashboards: Object.entries(dashboardSlugToSection).map(([slug, section]) => ({ slug, section })),
  drilldowns: drilldownCatalog.map(
    ({ dataset, metricKey, fields, sortFields, exportable, sourceLimited }) => ({
      dataset,
      metricKey,
      fields,
      sortFields,
      exportable,
      sourceLimited: sourceLimited ?? false,
    }),
  ),
});
