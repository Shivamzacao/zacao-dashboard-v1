# B7 Frozen Frontend API Contract

Status: Implemented; awaiting ZACAO B7 approval

Schema version: `1.0`

Reporting timezone: `America/New_York`
Currency: `USD`

This is the backend boundary for Phase 2. The machine-readable authority is
`src/application/api/manifest.ts`; Zod response schemas and shared TypeScript types are in
`src/application/api/contracts.ts`. Synthetic, explicitly TEST-only examples are exported by
`src/application/api/fixtures.ts`. Routes consume B5 view models through B6 orchestration and do
not calculate metrics or expose source-provider objects.

## Endpoints

| Method | Path                             | Purpose                                                 |
| ------ | -------------------------------- | ------------------------------------------------------- |
| GET    | `/api/v1/dashboards/{dashboard}` | Complete typed page model plus supported filter options |
| GET    | `/api/v1/drilldowns/{dataset}`   | Bounded PII-safe table rows for an approved dataset     |
| GET    | `/api/v1/exports/{dataset}`      | Bounded CSV for an export-approved dataset              |
| GET    | `/api/v1/health`                 | Process liveness only                                   |
| GET    | `/api/v1/health/readiness`       | Frontend and production-certification readiness         |
| GET    | `/api/v1/sources/status`         | Redacted source freshness/completeness/readiness        |

Dashboard slugs are `executive`, `revenue`, `customers`, `products`, `operations`, `marketing`,
`growth`, `financial`, and `insights`.

## Query contract

Dashboard requests require `start=YYYY-MM-DD` and `end=YYYY-MM-DD`. The inclusive range is capped
at 366 days. Optional parameters are `comparison`, `channels`, `skus`, and `locations`. Comparison
values are `none`, `previous_period`, or `previous_year`; source dimensions must be selected from
the response's `supportedFilters`. Unknown parameters and client-selected environments are rejected.

Drill-down and export requests additionally accept `limit` (1–100), an opaque `cursor`,
`sort=field:asc|desc`, and comma-separated `fields`. Every dataset has fixed field and sort
allowlists in the manifest. The server never accepts provider queries, GraphQL, ShopifyQL, Sheet
ranges, workbook IDs, or arbitrary metric names.

## Response and state model

JSON success responses use `{ ok, data, meta }`. `meta` carries schema version, request ID, cache
metadata, and redacted source states. Dashboard page models carry their environment, reporting
period, metrics, series, breakdowns, tables, insights, alerts, and sources. Every metric contains a
typed value or `null` plus the existing B5 readiness state; blocked metrics never receive invented
numbers.

Expected state equivalents include current/ready, partial, no activity/empty, not configured/data
source not ready, business rule required, source limited, unavailable, and invalid. Request errors
use stable `application/problem+json`; unexpected exceptions return a generic internal error and do
not expose stack traces or provider details. All responses are `private, no-store`.

Representative TEST-only payloads are available as `frontendFixtureBundle`. They are marked
`environment: "test"` and `synthetic: true`. Production runtime configuration is fixed server-side
and never falls back to these values.

## Drill-downs and exports

| Dataset               | Export | Notes                                                               |
| --------------------- | -----: | ------------------------------------------------------------------- |
| `product-catalog`     |    Yes | Approved catalog fields only                                        |
| `product-velocity`    |    Yes | Approved period/product/SKU/unit fields                             |
| `klaviyo-campaigns`   |    Yes | Aggregate campaign performance; no profiles                         |
| `klaviyo-flows`       |    Yes | Aggregate flow performance; no profiles                             |
| `inventory-lots`      |    Yes | Conditional source readiness remains authoritative                  |
| `forecast-variance`   |    Yes | Conditional source/business gates remain authoritative              |
| `incoming-production` |    Yes | Approved operational fields only                                    |
| `partner-performance` |    Yes | Business-safe partner aggregates only                               |
| `growth-next-actions` |    Yes | No investor/partner personal contact information                    |
| `social-performance`  |    Yes | Approved aggregate account metrics                                  |
| `detailed-orders`     |     No | Always explicit `SOURCE_LIMITED` until detailed history is verified |

Rows are sorted deterministically, cursor-paginated, field-filtered through dataset allowlists, and
capped at 100. CSVs use deterministic columns and filenames; values beginning with `=`, `+`, `-`,
or `@` are neutralized to prevent spreadsheet formula injection. No export includes unapproved PII,
raw provider objects, tokens, or secrets.

## Health and deferred live verification

Liveness means the route process can respond; it does not certify data sources. Readiness reports
`frontendDevelopment: ready` and `productionCertification: deferred`. Until approved credentials
are supplied, production source states are `not_configured` with
`LIVE_CREDENTIAL_VERIFICATION_DEFERRED`. This does not block Phase 2 development against frozen
contracts and TEST fixtures, but every live read-only verification remains mandatory before final
production certification.

## Phase 2 consumption rules

- Import shared types/schemas; do not duplicate metric calculations in UI code.
- Render value zero distinctly from `null`/unavailable.
- Render each readiness and partial-source state instead of substituting placeholders.
- Preserve selected date/filter context when opening a drill-down or export.
- Treat cursors as opaque and use only server-advertised filters and dataset fields.
- Never select TEST/PRODUCTION through a browser parameter.
- Do not expose or infer fields absent from the manifest.
