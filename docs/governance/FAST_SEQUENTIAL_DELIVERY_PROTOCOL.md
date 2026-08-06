# Fast Sequential Delivery Protocol

Status: Approved by ZACAO

Version: 1.0

Scope: Execution and certification cadence only

## Authority and unchanged baseline

This protocol supplements the locked ZACAO V1 Deliverable Plan and Technical Architecture Plan. It changes how implementation work is verified and documented; it does not change the product, architecture, data contracts, source permissions, visual contract, or sequential stage order.

The three major stages remain strictly sequential:

1. Stage 1 — Backend.
2. Stage 2 — Frontend, only after the Backend Stage gate passes and ZACAO authorizes it.
3. Stage 3 — Integration, UAT, and Release, only after the Frontend Stage gate passes and ZACAO authorizes it.

Subphases remain in their documented dependency order. Work that depends on an unfinished subphase is not parallelized.

## Normal subphase protocol

For each normal subphase:

1. Implement only the documented subphase scope.
2. Format changed implementation files once.
3. Run focused type, contract, unit, boundary, and behavior checks relevant to the change.
4. Confirm architectural and read-only source boundaries remain intact.
5. Record a short status, genuine blockers, and material decisions only.
6. Stop and wait for explicit ZACAO approval.
7. Continue to the next subphase only after that approval.

Do not run the full install, full suite, coverage, security audit, performance suite, or release certification after every normal subphase unless the change or a material risk requires it.

Coverage is diagnostic. No percentage target applies to normal subphases. Tests prioritize business calculations, money, timezone behavior, source normalization, validation, connector behavior, errors, and other critical correctness paths.

## Required subphase completion report

Each meaningful subphase reports only:

- Implemented.
- Verified.
- Tests/checks and results.
- Relevant data decisions used.
- Actual data limitations discovered.
- Architecture changes, normally `None`.
- Genuine blockers, normally `None`.
- Exact next subphase.

Then stop. A subphase approval is a human-control checkpoint, not a production certification gate.

## Backend Stage gate

Run once after the complete Backend Stage:

- Frozen-lockfile install verification.
- Format check, lint, strict typecheck, and dependency-boundary checks.
- Complete backend unit, contract, integration, connector, metric-correctness, validation, API, cache, export, and failure-state tests applicable to V1.
- Source write-prohibition and secret-isolation checks.
- Full dependency/security audit and remediation decision.
- Backend performance and reliability checks required by the architecture.
- Consolidated backend evidence, limitations, blockers, and Stage 1 gate report.

## Frontend Stage gate

Run once after the complete Frontend Stage:

- Frozen-lockfile verification when dependencies changed.
- Format check, lint, strict typecheck, and complete frontend tests.
- Component, page-state, filter, responsive, browser, accessibility, and visual-regression verification against the approved demo.
- Frontend performance and bundle checks required by the architecture.
- Secret/client-boundary checks.
- Consolidated frontend evidence, limitations, blockers, and Stage 2 gate report.

The Frontend Stage uses frozen backend contracts and deterministic fixtures; live-source integration remains in Stage 3.

## Integration, UAT, and Release gate

Run during Stage 3 and before production release:

- Certified frontend/backend wiring and page-by-page end-to-end behavior.
- Live read-only source verification using approved server-side credentials.
- Metric reconciliation, timezone, currency, history, filter, freshness, and conditional-activation verification.
- Complete security, privacy, dependency, access-protection, performance, reliability, degradation, and recovery checks.
- Cross-browser, responsive, accessibility, export, and operational monitoring checks.
- UAT, known-limitations acceptance, deployment evidence, and rollback verification.
- Final release report and explicit production approval.

## Security exception rule

- Critical issues may block immediately.
- High issues are investigated immediately only when they materially affect the implemented production path.
- The full dependency audit runs at the Backend Stage gate and again before production release.
- Routine patch/minor maintenance inside the approved framework major version may proceed when required for security or compatibility, provided it does not change architecture or create a breaking decision. Record the change and run focused regression checks.

## Documentation and tool discipline

- Maintain concise implementation status, blockers, genuine ADRs, and material data/metric decisions during subphases.
- Produce comprehensive evidence at major stage gates rather than every subphase.
- Batch safe independent reads/checks and avoid repeated installs or broad test runs without cause.
- Read only the active plan section unless broader context is required.
- Work directly in the approved repository; use temporary isolation only when technically required.
- Do not add requirements, services, packages, optimizations, research, or V2 work outside the locked plan.

## Blocker rule

Stop only for unavailable required data, a one-way architectural decision, destructive action, required credentials/permissions, material production security, an unresolved business metric, a V1 functionality change, or an unreproducible visual requirement.

Routine reversible implementation choices use the simplest option consistent with the locked architecture.

## Anti-loop rule

Do not repeat the same underlying command, installation, test, configuration change, fix, or investigation after it fails twice.

After two failures:

1. Stop repeating the action.
2. Perform one concise root-cause analysis.
3. If a clearly different corrected solution exists within the approved architecture, make one corrected attempt.
4. If that attempt fails, stop and report the blocker.

Do not relabel the same failure to bypass the limit, try random packages, rewrite working code, or continue speculative investigation.

## Anti-hallucination and data-correctness rule

Never infer a missing Shopify field/capability, Klaviyo metric/endpoint, Google file/tab/column, history capability, metric definition, revenue/refund/AOV rule, customer identity, channel mapping, cost/margin rule, forecast rule, inventory threshold, or attribution rule.

When an approved source does not resolve a required fact, report what is known, what is missing, what was verified, why work cannot continue safely, and the smallest required decision. Do not substitute mock data for production facts.

Correct analytics has priority over code completeness. A working implementation with an unapproved business calculation is a failure.

## Context and scope protection

Before a subphase, read only its locked plan section, relevant architecture and metric/source definitions, the previous completion summary, and the current blocker register. Do not repeatedly reread or reinterpret the whole project.

Work only on the authorized subphase. Do not start the next subphase, V2, unrelated refactors, speculative abstractions, premature optimization, extra dependencies, architecture redesign, metric changes, source-boundary changes, or frontend redesign.

Time and token use are constraints. Batch safe independent checks and stop open-ended investigation that is not required for the active V1 subphase.

## Current B1 handling

- Preserve the completed B1 implementation.
- Make the smallest safe Next.js version adjustment within the existing Next.js architecture.
- Run the focused install, typecheck, lint, contract/unit, boundary, and security checks needed for that version adjustment once.
- Update the existing B1 evidence concisely and close B1 if those checks pass.
- Do not begin B2 until B1 passes and B2 is explicitly authorized.
