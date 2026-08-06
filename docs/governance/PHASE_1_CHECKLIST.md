# Phase 1 Backend Checklist

Status values: `Not started`, `In progress`, `Completed`, `Blocked`, `Requires approval`, `Not applicable`.

Only the currently authorized subphase may move beyond `Not started`.

| Subphase | Objective | Status | Gate dependency |
|---|---|---|---|
| B0 | Repository preflight and scope lock | Completed | Approved by ZACAO through explicit B1 authorization on 2026-08-06 |
| B1 | Backend foundation and contracts | Blocked | Resolve `BLK-006`, rerun B1 gates, and obtain explicit approval |
| B2 | Shopify source adapter | Not started | B1 gate approval |
| B3 | Klaviyo Future-Ready Core adapter | Not started | B2 gate approval |
| B4 | Google Drive, Budget, and S&OP adapters | Not started | B3 gate approval |
| B5 | Metric services and certified view models | Not started | B4 gate approval |
| B6 | Orchestration and caching | Not started | B5 gate approval |
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
