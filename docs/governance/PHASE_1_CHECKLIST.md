# Phase 1 Backend Checklist

Status values: `Not started`, `In progress`, `Completed`, `Blocked`, `Requires approval`, `Not applicable`.

Only the currently authorized subphase may move beyond `Not started`.

| Subphase | Objective | Status | Gate dependency |
|---|---|---|---|
| B0 | Repository preflight and scope lock | Completed | Approved by ZACAO through explicit B1 authorization on 2026-08-06 |
| B1 | Backend foundation and contracts | Completed | Approved by ZACAO; canonical repository sanity check passed at `ab255d3` |
| B2 | Shopify source adapter | Completed | Approved by ZACAO before B3 authorization |
| B3 | Klaviyo Future-Ready Core adapter | Completed | Approved by ZACAO before B4 authorization; live credential verification remains deferred |
| B4 | Google Drive, Budget, and S&OP adapters | Completed | B4.5 approved by ZACAO; live credential verification remains deferred until the Backend Stage gate |
| B5 | Metric services and certified view models | Completed | Approved by ZACAO subject to reconciliation; six remaining metrics confirmed `NOT_V1` before B6 |
| B6 | Orchestration and caching | Requires approval | Focused B6 verification passed; no external cache or persistence added |
| B7 | APIs, drill-downs, exports, and source status | Not started | B6 gate approval |
| B8 | Backend security, observability, and operations | Not started | B7 gate approval |
| B9 | Full backend certification | Not started | B8 gate approval |

## B0 checklist

| Item | Status | Evidence |
|---|---|---|
| Read locked baseline, deliverable, architecture, Google Sheets model, and research | Completed | Locked hashes verified; source inventory in B0 repository preflight |
| Check repository instructions | Completed | No `AGENTS.md` exists in the repository or its applicable parent path |
| Inspect branch, worktree, remote, files, configuration, dependencies, and tests | Completed | `docs/evidence/phase-1/b0/REPOSITORY_PREFLIGHT.md` |
| Preserve historical workspace and user work | Completed | No files in `/Users/aziz/zacao-dashboard` changed; B0 uses the clean repository only |
| Produce keep/replace/retire map | Requires approval | `docs/governance/LEGACY_DISPOSITION.md` |
| Initialize traceability matrix | Completed | `docs/architecture/TRACEABILITY.md` |
| Consolidate blockers | Completed | `docs/architecture/BLOCKERS.md` |
| Initialize ADR index | Completed | `docs/adr/README.md` |
| Initialize test-evidence index | Completed | `docs/evidence/TEST_EVIDENCE_INDEX.md` |
| Verify approved toolchain | Completed with B1 action | Node 24 matches; repository has no runtime manifest; available pnpm is newer than the locked 11.9.x line |
| Run deterministic install | Not applicable | No `package.json` or `pnpm-lock.yaml`; B1 owns scaffold and lockfile |
| Run lint, typecheck, unit tests, and build | Not applicable | No application source, scripts, or test configuration exists |
| Run secret and repository PII scans | Completed | No credential values or file-content email addresses found; Git author email exists only in commit metadata |
| Produce B0 gate report | Completed | `docs/evidence/phase-1/b0/B0_GATE_REPORT.md` |

## Stop rule

After the B0 report is produced, stop. Do not scaffold packages, create source files, request connector credentials, create Google workbooks, or begin B1 until ZACAO explicitly approves the B0 gate and authorizes B1.

## B5 checklist

| Item | Status | Evidence |
|---|---|---|
| Classify every locked V1 metric without inferred business rules | Completed | `docs/architecture/B5_METRIC_STATUS.md` |
| Implement deterministic source-independent calculation utilities | Completed | `src/domain/metrics/calculations.ts` |
| Implement stable source-neutral metric, series, breakdown, table, and page view models | Completed | `src/application/view-models` |
| Implement Shopify, Klaviyo, manual-source, conditional, and source-readiness metric services | Completed | `src/application/metrics` |
| Preserve zero versus unavailable, partial source, source failure, and production-empty states | Completed | Focused B5 tests |
| Prevent blocked, source-limited, and out-of-V1 metrics from emitting numeric production values | Completed | `tests/application/metrics/catalog-view-model.test.ts` |
| Verify approved Conditional interfaces without certifying empty PRODUCTION data | Completed | `tests/application/metrics/conditional.test.ts` |
| Run focused B5 verification | Completed | `docs/evidence/phase-1/b5/B5_GATE_REPORT.md` |
| Obtain explicit approval before B6 | Completed | ZACAO approved B5 subject to the completed traceability reconciliation |

## B6 checklist

| Item | Status | Evidence |
|---|---|---|
| Reconcile all 98 B5 metric statuses and sales-velocity boundary | Completed | `docs/architecture/B5_METRIC_STATUS.md` |
| Invoke only explicitly planned datasets and deduplicate repeated requests | Completed | Focused B6 orchestration tests |
| Propagate one normalized environment/date/filter/timezone/currency context | Completed | `src/application/orchestration/types.ts` and orchestrator tests |
| Isolate source and Conditional dataset failures | Completed | Focused timeout, unavailable, partial, invalid, and empty-production tests |
| Implement bounded process-local cache with configurable policies | Completed | `src/application/orchestration/cache-coordinator.ts` and `src/infrastructure/cache` |
| Isolate environment, fixed source identity, dataset, dates, and filters in keys | Completed | Dataset cache-key tests |
| Implement hit, miss, expiry, coalescing, invalidation, bypass, and stale disclosure | Completed | Cache coordinator tests |
| Preserve all B5 business blockers | Completed | Mixed ready/blocked orchestration test and B5 catalog |
| Obtain explicit approval before B7 | Requires approval | This B6 gate |
