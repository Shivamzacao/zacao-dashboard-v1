# B6 Orchestration and Cache Contract

Status: Implemented for the B6 approval gate.

## Boundary

B6 composes approved normalized B5 contributions. It does not expose HTTP routes, fetch raw provider records directly, change metric definitions, or introduce persistence. B7 will map these application results to versioned APIs.

## Request orchestration

- Every dashboard section receives an explicit dataset plan.
- Only contributors in that plan are invoked; duplicate dataset keys are collapsed within the request.
- Independent contributors run with configurable bounded concurrency.
- Contributors receive one normalized context: environment, date range, existing V1 filters, `America/New_York`, and `USD`.
- Contributors return normalized metric/view-model contributions, never credentials or raw provider records.
- A failed contributor becomes a sanitized unavailable dataset result. Other contributors continue.
- Mixed success and failure from one provider produces page-level `partial`; individual supplied metrics retain their precise source state.
- Empty PRODUCTION workbook results remain valid `DATA_PENDING`/`no_activity` results, not failures.

## Cache

- Implementation: process-local memory behind the existing `CachePort` and `CacheCoordinator`.
- Purpose: request/rate-limit optimization only. The cache is not durable and is not business truth.
- No Redis, database, external cache, queue, background job, or new package was added.
- Policies are supplied per contributor; B6 does not lock an assumed business update cadence.
- Process memory is bounded by a configurable entry limit with oldest-entry eviction.
- Keys isolate schema version, metric definition version, environment, source, hashed fixed source identity, dataset, date range, channels, SKUs, and locations.
- TEST and PRODUCTION cannot collide. A real Google workbook ID is hashed and is not exposed in the key.
- Only contributions whose source states are usable are cached. Invalid, unavailable, not-configured, and error results cannot replace a valid entry.
- Identical concurrent misses are coalesced.
- Tag invalidation is available to a future protected B7/B8 operation; B6 adds no route.
- Cache bypass is available for diagnostic/approved operations.

## Freshness and stale behavior

- Source `dataAsOf` and `lastSuccessfulAt` remain business/source metadata.
- Cache `generatedAt` and `expiresAt` remain cache metadata. They are not presented as business freshness.
- After fresh expiry, a refresh is attempted.
- A last-known-good value may be returned only within its configured stale window when refresh throws or returns an unusable source state.
- Every stale metric and source is relabelled `stale` and receives `CACHE_STALE_FALLBACK`.
- Stale cache entries never cross environment, source identity, dataset, date, or filter boundaries.
- After the stale window expires, source failure becomes unavailable; no stale value is invented.

## Preserved blockers

B6 never calculates or activates blocked revenue/order/AOV/refund, detailed-history, attribution, COGS/margin, burn/runway, inventory-planning velocity, days-on-hand, stockout, reorder, FEFO, rebate, or alert-threshold metrics.
