# Backend Contract Schema 1.0

Status: Implemented in Subphase B1; frozen pending B1 gate approval.

## Public contract boundary

All response and source contracts use `schemaVersion: "1.0"`. A future incompatible change requires a new schema version and traceability impact review.

| Contract family | Canonical implementation | Locked behavior |
|---|---|---|
| Money | `src/domain/contracts/money.ts`, `src/domain/utilities/money.ts` | USD integer minor units; decimal text parsed without binary floating-point calculations |
| Percentage | `src/domain/contracts/percentage.ts`, `src/domain/utilities/money.ts` | Integer basis points; zero denominators return `null` |
| Reporting dates | `src/domain/contracts/date-range.ts`, `src/domain/utilities/time.ts` | ISO calendar dates with explicit IANA timezone boundaries; no machine-timezone dependence |
| Filters | `src/domain/contracts/filters.ts`, `src/domain/utilities/filters.ts` | Strict, canonical, deduplicated, sorted multiselect values |
| Comparison | `src/domain/contracts/date-range.ts` | `none`, `previous_period`, or `previous_year`; metric support is decided later by the approved metric definition |
| Readiness | `src/domain/contracts/readiness.ts` | Loading, current, no activity, not configured, partial, stale, invalid, unavailable, and error remain distinct |
| Source status | `src/domain/contracts/source-status.ts` | Source, timestamps, completeness, and non-sensitive warning codes |
| Errors | `src/domain/contracts/errors.ts` | Stable code, safe message, retryability, and field-path details |
| Pagination | `src/domain/contracts/pagination.ts` | Bounded cursor requests and explicit next-page metadata |
| Cache | `src/domain/contracts/cache.ts`, `src/domain/utilities/cache-key.ts` | Versioned canonical keys and explicit fresh/stale metadata |
| API envelope | `src/domain/contracts/api.ts` | Strict discriminated success/failure envelopes with request ID |
| Metric definitions | `src/domain/contracts/metric.ts`, `src/domain/metrics/registry.ts` | Unique metric key, schema version, definition version, class, value kind, source, and description |

## Ports

The application owns ports for Shopify, Klaviyo, Google files, cache, clock, allowlisted logging, and refresh scheduling. Provider implementation details may point inward through these ports; domain and application code cannot import provider implementations.

The B1 metric registry is deliberately empty. B1 defines and tests the registry mechanism but does not invent metric formulas while the approved revenue policy and other decisions remain open.

## Server-only environment

The base server environment requires `NODE_ENV`, `REPORTING_TIMEZONE`, and `REPORTING_CURRENCY=USD`. It has no secret fallback and exposes no `NEXT_PUBLIC_*` value. Provider credential schemas are added only in their authorized connector subphases.

## Contract fixtures

Sanitized fixtures cover current, no activity, not configured, partial, stale, invalid, unavailable, and error states. They contain no copied business data or PII.
