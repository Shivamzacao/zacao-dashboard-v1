# ZACAO Dashboard V1
## Technical Architecture and Sequential Implementation Plan

**Document status:** Proposed for approval  
**Architecture version:** 1.0  
**Product authority:** `ZACAO_Dashboard_V1_Deliverable_Plan.docx`  
**Visual authority:** Approved ZACAO Executive Intelligence demo  
**Audience:** ZACAO, technical reviewers, and the coding agent  
**Execution model:** Phase 1 Backend → Phase 2 Frontend → Phase 3 Integration, UAT, and Release  

> **Authorization boundary:** Approval of this document authorizes phased implementation only when ZACAO separately instructs the coding agent to begin. It does not authorize source-system writes, unapproved packages, a database, application authentication, or work outside the current phase.

# 1. Executive architecture decision

Dashboard V1 will be implemented as a single, modular Next.js application. Its server layer will retrieve read-only data from Shopify, Klaviyo, and allowlisted Google Drive/Google Sheets sources, validate provider responses, calculate approved metrics, cache safe aggregate responses, and expose versioned internal API contracts. The frontend will reproduce the approved demo and consume those contracts through a replaceable data-provider boundary.

The phases are completely sequential:

1. **Phase 1 — Backend:** complete and certify the server, connectors, calculations, caching, APIs, exports, security controls, operational controls, and backend test suite.
2. **Phase 2 — Frontend:** after the Phase 1 gate is approved, build and certify the complete visual application against frozen API contracts and deterministic fixtures. No live source integration occurs in this phase.
3. **Phase 3 — Integration:** after the Phase 2 gate is approved, connect the certified frontend to the certified backend, verify live read-only sources, run full-system testing, perform UAT, and release.

No phase may begin early. A blocked Conditional V1 module must not block unrelated Core V1 work, and it must never be populated with mock production values.

## 1.1 Active V1 architecture

```text
Internal dashboard user
          |
          v
Vercel platform protection
          |
          v
Next.js App Router application
  |-- Server-rendered page shells
  |-- Client-only chart/filter interactions
  |-- Versioned Route Handlers
  |-- Application/use-case services
  |-- Metric registry and calculations
  |-- Readiness and data-quality engine
  |-- Server-side cache boundary
          |
          v
Read-only source adapters
  |-- Shopify Admin GraphQL and ShopifyQL
  |-- Klaviyo Reporting API and metric aggregates
  |-- Google Sheets API and Drive file download
          |
          v
Validated provider data; no source write-back
```

## 1.2 Deliberately excluded from active V1

- Application user accounts, sessions, roles, or an authentication database.
- A primary analytical database, warehouse, durable event store, or durable ingestion pipeline.
- Supabase, Drizzle migrations, RLS, and database-backed audit tables from the previous abandoned approach.
- Source-system writes, editable dashboard tables, approval workflows, or webhook-driven source mutation.
- Redis, a second cache service, Kafka, queues, microservices, or a monorepo.
- AI-generated insights, predictions, or unapproved thresholds.

Supabase, Drizzle, and durable storage remain documented re-entry options only when a database trigger in the approved deliverable is reached and ZACAO approves a revised architecture decision.

# 2. Controlling documents and precedence

The coding agent must apply the following order when information conflicts:

1. The user’s latest explicit instruction for the active phase.
2. This approved architecture plan for technical implementation.
3. The approved V1 Deliverable Plan for scope, metrics, data classes, and source rules.
4. The source-audit reports in `docs/research` for verified feasibility and limitations.
5. The approved demo for visual layout, hierarchy, component intent, and styling.
6. Official provider and framework documentation for technical behavior.
7. Existing repository code and earlier plans as historical, non-authoritative material.

If a conflict changes a metric result, data source, security boundary, phase boundary, or one-way architecture decision, the agent must stop that task, record the conflict, and request a decision. It must not silently merge conflicting instructions.

## 2.1 Approved scope classes

| Class | Implementation obligation | Production behavior |
|---|---|---|
| Core V1 | Implement the complete validated data path, UI, states, and tests. | Show current certified values with source and freshness metadata. |
| Future-Ready Core | Implement contracts, source discovery, UI, states, and tests even when the current source is empty. | Show “No activity yet” until genuine data appears; then populate automatically. |
| Conditional V1 | Implement only the approved readiness contract, schema checks, and source-not-ready behavior unless every activation gate passes. | Hidden, disabled, or visibly not ready; never populated with assumptions. |
| Out of V1 | Do not implement. | Not present as an active feature. |

# 3. Non-negotiable system constraints

- Reporting timezone is `America/New_York`, defined in configuration and changeable later without rewriting metric logic.
- Reporting currency is USD only.
- Default date period is rolling twelve months; shorter approved periods use the same metric definitions.
- Shopify, Klaviyo, Google Sheets, Budget, and S&OP access is read-only.
- Credentials remain server-side and never enter browser bundles, query strings, logs, exports, screenshots, or committed fixtures.
- No production component may display mock values.
- Zero, no activity, partial, stale, invalid, unavailable, and error are distinct states.
- Shopify remains the source of truth for company sales. Klaviyo conversion value is labelled `Klaviyo-attributed revenue`.
- Budget values are labelled Plan, Target, Assumption, or Scenario. They are never presented as actuals.
- S&OP outputs remain unavailable until real inputs and formula validation pass.
- Current detailed Shopify order history is incomplete; affected responses must state historical completeness.
- All calculations use approved definitions from the deliverable. Unknown rules become blockers, not defaults.
- The approved demo is the visual contract, except for truthful unavailable states, removal of unsupported authentication affordances, and the new Operations page.

# 4. Technology stack

The stack retains the previously approved Next.js ecosystem. Exact compatible packages are pinned in `package.json` and the lockfile; no caret or tilde ranges are permitted for production dependencies.

| Layer | Approved choice | Role and constraint |
|---|---|---|
| Runtime | Node.js 24 LTS | Server runtime for Next.js and tooling. |
| Package manager | pnpm 11.9.x | One lockfile and deterministic installs. |
| Web framework | Next.js 16.2.x App Router | Server Components, Route Handlers, caching, bundling, and deployment. |
| UI runtime | React 19.2.x | Component rendering and controlled client interaction. |
| Language | TypeScript 5.9.x, strict mode | Shared types, contracts, and compile-time safety. |
| Runtime validation | Zod 4.4.x | Environment, provider, query, and response validation. |
| Styling | Tailwind CSS 4.x plus CSS custom-property design tokens | Exact visual parity; no unapproved theme values. Existing approved demo CSS is preserved when available. |
| Charts | Recharts 3.x | Approved chart set with accessible wrappers and centralized defaults. |
| Tables | TanStack Table 8.x | Sorting, column models, and scalable drill-down tables. |
| HTTP | Native `fetch` | No Axios layer; all provider policies live in source clients. |
| Google auth | `google-auth-library` 11.x | Read-only service-account access. |
| Workbook parsing | ExcelJS 4.x | Read-only parsing of the S&OP `.xlsx` source when Drive returns a workbook file. |
| Scheduled checks | Trigger.dev 4.x | Optional cache warming and source-health schedules only; no durable analytics store. |
| Unit/component tests | Vitest 4.x and Testing Library | Domain, contracts, services, and UI behavior. |
| Browser tests | Playwright 1.62.x | E2E, responsive, keyboard, and visual-regression testing. |
| Accessibility | axe-core / Playwright Axe | Automated WCAG 2.2 AA checks plus manual review. |
| Load tests | k6 | API and page performance certification. |
| Hosting | Vercel Pro | Preview, staging, production, deployment protection, functions, logs, and cache. |
| CI | GitHub Actions | Deterministic phase gates and stored test evidence. |

## 4.1 Stack controls

- Do not introduce Redux, Zustand, SWR, React Query, a component framework, an ORM, or a new service unless a documented requirement cannot be satisfied by the approved stack.
- Use URL state for shareable global filters and local React state only for ephemeral UI behavior.
- Use integer minor units for USD money, basis points for percentages where practical, and explicit rounding functions. Never calculate currency with unconstrained binary floating point.
- Use a tested timezone utility boundary. No business-period calculation may depend on the developer machine timezone.
- Package additions require a one-paragraph Architecture Decision Record stating the problem, alternatives, chosen package, bundle/runtime cost, security review, and rollback path.

# 5. Architecture principles and dependency rules

## 5.1 Modular monolith

V1 uses one repository and one deployable Next.js application. The code is divided by domain and boundary, not by arbitrary technical folders. This keeps deployment simple while preventing provider logic, metric logic, and rendering logic from becoming coupled.

## 5.2 Dependency direction

```text
app routes and React pages
          |
          v
application use cases and view-model assemblers
          |
          v
domain contracts, metric policies, money/time utilities
          ^
          |
infrastructure adapters: Shopify, Klaviyo, Google, cache, telemetry
```

Rules:

- Domain code cannot import Next.js, React, provider SDKs, environment variables, or cache implementations.
- Provider adapters implement typed ports owned by the application/domain layer.
- UI components receive view models; they never interpret raw Shopify, Klaviyo, or Sheet payloads.
- Route Handlers validate input, call one use case, and serialize one response. They do not contain business calculations.
- Metric calculations are pure, versioned, and independently tested.
- Source-specific names are normalized at the adapter boundary.

## 5.3 No-database operating model

The server uses cache-aside reads:

1. Validate filters and form the canonical cache key.
2. Return a fresh cached validated aggregate when available.
3. Otherwise call the read-only source adapter with bounded timeouts and retry rules.
4. Validate and normalize the full response.
5. Calculate the approved view model.
6. Cache only successful, non-PII aggregate results and source metadata.
7. Return the value with freshness and completeness information.
8. If refresh fails, serve an allowed stale value only within the approved stale window; otherwise return `Unavailable`.

The cache is an optimization, not the system of record. No metric may depend on cache history existing indefinitely.

# 6. Repository and folder architecture

The repository stays a single application. Existing code from the abandoned architecture is not automatically trusted or reused. Phase 1 Subphase 0 inventories it and creates an explicit keep/replace/retire map before edits.

```text
zacao-dashboard/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── executive/page.tsx
│   │   ├── revenue/page.tsx
│   │   ├── customers/page.tsx
│   │   ├── products/page.tsx
│   │   ├── operations/page.tsx
│   │   ├── marketing/page.tsx
│   │   └── insights/page.tsx
│   ├── api/
│   │   ├── v1/
│   │   │   ├── health/route.ts
│   │   │   ├── dashboards/[dashboard]/route.ts
│   │   │   ├── drilldowns/[dataset]/route.ts
│   │   │   ├── exports/[dataset]/route.ts
│   │   │   └── sources/status/route.ts
│   │   └── internal/refresh/[source]/route.ts
│   ├── error.tsx
│   ├── loading.tsx
│   ├── not-found.tsx
│   └── globals.css
├── src/
│   ├── domain/
│   │   ├── metrics/
│   │   │   ├── definitions/
│   │   │   ├── calculations/
│   │   │   ├── registry.ts
│   │   │   └── types.ts
│   │   ├── money/
│   │   ├── time/
│   │   ├── filters/
│   │   ├── readiness/
│   │   └── errors/
│   ├── application/
│   │   ├── ports/
│   │   ├── use-cases/
│   │   ├── orchestration/
│   │   ├── view-models/
│   │   └── exports/
│   ├── infrastructure/
│   │   ├── shopify/
│   │   ├── klaviyo/
│   │   ├── google/
│   │   ├── cache/
│   │   ├── scheduling/
│   │   ├── telemetry/
│   │   └── security/
│   ├── contracts/
│   │   ├── api/
│   │   ├── providers/
│   │   ├── fixtures/
│   │   └── index.ts
│   ├── features/
│   │   ├── executive/
│   │   ├── revenue/
│   │   ├── customers/
│   │   ├── products/
│   │   ├── operations/
│   │   ├── marketing/
│   │   └── insights/
│   ├── components/
│   │   ├── ui/
│   │   ├── dashboard/
│   │   ├── charts/
│   │   ├── tables/
│   │   ├── states/
│   │   └── layout/
│   ├── design-system/
│   │   ├── tokens.css
│   │   ├── chart-theme.ts
│   │   ├── icons.ts
│   │   └── formats.ts
│   └── shared/
│       ├── config/
│       ├── logging/
│       ├── testing/
│       └── utilities/
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   ├── component/
│   ├── e2e/
│   ├── visual/
│   ├── accessibility/
│   ├── performance/
│   └── fixtures/
├── docs/
│   ├── deliverables/
│   ├── research/
│   ├── architecture/
│   ├── adr/
│   ├── runbooks/
│   └── evidence/
├── public/
├── scripts/
├── .github/workflows/
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── tsconfig.json
└── eslint.config.mjs
```

## 6.1 Naming and file rules

- Directories and non-component modules use kebab-case; React components use PascalCase filenames.
- Export public module surfaces through intentional `index.ts` files only; avoid repository-wide barrel files.
- Keep files focused. Split a module when it mixes provider access, calculation, serialization, and presentation.
- Prefer named exports. Default exports are limited to Next.js route/page conventions.
- Tests live in the central `tests` tree and mirror the source path.
- Never put provider JSON, secrets, or real customer data in committed fixtures.
- No `utils.ts` dumping ground. Utilities belong to a named domain such as `money`, `time`, or `filters`.

# 7. Shared contracts and data model

## 7.1 Canonical filter contract

Every dashboard and export uses one validated filter object:

```text
start: YYYY-MM-DD
end: YYYY-MM-DD
timezone: America/New_York
currency: USD
comparison: none | previous_period | previous_year
channels: zero or more approved channel keys
products: zero or more stable product IDs
skus: zero or more exact SKU strings
locations: zero or more stable location IDs
grain: auto | day | week | month
```

Unknown parameters are rejected. Dates are inclusive reporting dates, converted to provider-safe UTC boundaries by one time service. `grain=auto` resolves through a documented rule and is returned in metadata.

## 7.2 Metric registry contract

Every metric key must declare:

- Stable key and definition version.
- V1 class: Core, Future-Ready Core, Conditional, or Out of V1.
- Business definition and decision supported.
- Source and exact fields/resources.
- Inclusion/exclusion rules.
- Unit, sign, rounding, and null behavior.
- Supported grains, filters, and comparisons.
- Freshness target and stale allowance.
- Historical-completeness requirement.
- Empty, partial, stale, invalid, unavailable, and error behavior.
- Test fixture and reconciliation expectation.

The same registry drives API metadata, exports, readiness checks, and UI source labels. A metric must not have different formulas in two endpoints.

## 7.3 Source status contract

```json
{
  "source": "shopify",
  "state": "current | no_activity | not_configured | partial | stale | invalid | unavailable | error",
  "lastCheckedAt": "ISO-8601 timestamp",
  "lastSuccessfulAt": "ISO-8601 timestamp or null",
  "dataAsOf": "ISO-8601 timestamp or null",
  "freshnessSeconds": 0,
  "history": {
    "mode": "aggregate | detailed | mixed",
    "earliestAvailable": "ISO date or null",
    "completeForRequest": true
  },
  "warnings": ["stable warning code"]
}
```

## 7.4 API response envelope

```json
{
  "data": {},
  "meta": {
    "schemaVersion": "1.0",
    "requestId": "opaque identifier",
    "generatedAt": "ISO-8601 timestamp",
    "timezone": "America/New_York",
    "currency": "USD",
    "filters": {},
    "sources": [],
    "warnings": [],
    "cache": { "state": "hit | miss | stale", "ageSeconds": 0 }
  }
}
```

Errors use `application/problem+json` with stable `type`, `title`, `status`, `code`, `detail`, `requestId`, and field-level validation errors. Provider error bodies are never passed through to users.

# 8. Backend detailed architecture

## 8.1 Server boundaries

| Boundary | Responsibility | Prohibited behavior |
|---|---|---|
| Route Handler | Validate request, invoke one use case, serialize response. | Provider calls and metric formulas. |
| Use case | Orchestrate ports, calculations, readiness, and cache policy. | Rendering and provider-specific JSON traversal. |
| Domain service | Pure calculation and definition enforcement. | Network, environment, cache, or framework imports. |
| Source adapter | Fetch, paginate, normalize, and return typed source records. | Dashboard layout decisions and cross-source business rules. |
| Cache adapter | Canonical keys, tags, TTL, stale policy, request coalescing. | Becoming a source of truth. |
| View-model assembler | Convert certified domain results into component-ready structures. | Inventing missing values or labels. |

## 8.2 Provider reliability policy

- Set explicit connect/read deadlines for every request; no unbounded request is allowed.
- Retry read-only idempotent requests only for `429`, provider-declared throttling, and transient `5xx` failures.
- Maximum two retries with exponential backoff and jitter; honor `Retry-After`.
- Never retry authentication, permission, validation, or unsupported-resource failures.
- Paginate with provider cursors and hard safety limits. Record truncation as `partial`.
- Coalesce identical concurrent cache misses to prevent a thundering herd.
- Redact tokens, email addresses, phone numbers, addresses, and provider payloads from logs.
- Validate the complete dataset before caching or replacing an earlier valid response.

## 8.3 Shopify adapter

The Shopify adapter is split into `shopifyql`, `admin-graphql`, `pagination`, `normalization`, and `source-status` modules.

Required capabilities:

- ShopifyQL aggregate sales, customer, funnel, product, channel, geography, fulfillment, and inventory datasets listed in the deliverable.
- Admin GraphQL current products, variants, inventory items, inventory levels, locations, recent orders, refunds, and fulfillments.
- Query cost/throttle observation and bounded pagination.
- Exact source-name and channel mapping with `Unclassified` fallback.
- Explicit aggregate-versus-detailed historical status.
- Separation of merchandise lines from blank products, fees, and adjustments.
- Cost-completeness checks without claiming complete realized margin.
- No webhook receiver in the no-database V1; polling and cache refresh are sufficient.

Production credentials must come from a new least-privilege custom app. The current overprivileged connector is audit-only. `read_all_orders` or a controlled export is a separate decision; without it, detailed-history metrics remain partial.

## 8.4 Klaviyo adapter

Klaviyo is Future-Ready Core. The adapter must support empty accounts without failing the page.

Required resources:

- Account settings and timezone.
- Metric registry and verified metric IDs.
- Campaign and flow discovery.
- Campaign-values and flow-values reports.
- Selected metric aggregates for email/SMS engagement trends.
- Event-presence verification without bulk profile/event ingestion.

Behavior:

- A valid connection with zero selected-period events returns `no_activity`.
- Missing permission, account, or metric returns `not_configured` or `invalid` as appropriate.
- New campaigns, flows, and report rows are discovered at the next refresh.
- Report dates and event dates retain their documented semantics and are normalized only for display/grouping.
- Aggregate executive responses contain no profile PII.
- Klaviyo attribution is never reconciled as if it were Shopify total company revenue.

## 8.5 Google Sheets and Drive adapters

Use fixed allowlisted file IDs and tab/range identifiers. Never discover a source by “latest file name.”

Required behavior:

- Fetch file metadata first: ID, MIME type, modified time, size, and revision information when available.
- Use the Sheets API for native Sheets and Drive download/export for workbook files.
- Parse S&OP `.xlsx` read-only with formulas and cached results treated separately.
- Validate exact required tabs and headers before reading rows.
- Normalize dates, money, IDs, SKU, location, channel, and status values.
- Detect duplicates, missing required fields, formula errors, example/draft rows, conflicting keys, and overwritten history risks.
- Exclude invalid rows from calculations and return row/cell references without echoing sensitive values.
- Never correct or write source cells.

## 8.6 Metric calculations

Calculations are pure functions whose inputs and outputs are Zod-validated contracts. Core examples include sales components, order counts, AOV pass-through, product mix, period comparisons, customer classification summaries, funnel rates, sales velocity trends, and deterministic data-quality warnings.

Rules:

- Prefer canonical provider aggregates when the deliverable identifies them as authoritative.
- Preserve provider signs for discounts and returns; normalize only in one documented boundary.
- Convert money into integer cents immediately after validation.
- Return null plus an explanatory readiness code when a denominator is zero or a source is incomplete; do not fabricate zero percent.
- Comparison functions require equal-period semantics and explicit timezone boundaries.
- Conditional formulas remain disabled until all business rules and activation gates are approved.

## 8.7 Cache design

The cache adapter hides the framework implementation and exposes `get`, `set`, `invalidateByTag`, and `withCachedResult` semantics.

Cache key format:

```text
zacao:v1:{schemaVersion}:{endpoint}:{metricDefinitionVersion}:{normalizedFilterHash}
```

Required tags include source, dashboard, metric family, and schema version. Suggested initial freshness windows remain recommendations until approved:

| Source family | Fresh TTL | Maximum stale fallback | Invalidation trigger |
|---|---:|---:|---|
| Shopify sales/funnel | 15 minutes | 60 minutes | Successful refresh or manual protected refresh. |
| Shopify inventory/fulfillment | 15 minutes | 30 minutes | Successful refresh. |
| Klaviyo reports/aggregates | 60 minutes | 6 hours | Successful refresh or newly discovered activity. |
| Budget/S&OP/Drive | 60 minutes | 24 hours | File modified/revision changed and validation passed. |

Only validated aggregate responses are cached. Secrets, raw customer records, unredacted provider errors, and export files are not cached. A failed refresh cannot overwrite a valid cached value.

## 8.8 Versioned endpoints

| Endpoint | Consumer | Main output |
|---|---|---|
| `GET /api/v1/health` | Operations and deployment checks | Build, environment, connector configuration, no secrets. |
| `GET /api/v1/dashboards/executive` | Executive page | Core KPIs, trend, channel mix, fulfillment, readiness. |
| `GET /api/v1/dashboards/revenue` | Revenue page | Sales components, trend, products, channels, heatmap, conditional plan. |
| `GET /api/v1/dashboards/customers` | Customer page | New/returning, geography, funnel, history limitations. |
| `GET /api/v1/dashboards/products` | Product page | Product/SKU sales, units, mix, catalog, inventory, costs readiness. |
| `GET /api/v1/dashboards/operations` | Operations page | Fulfillment, current inventory, conditional-source readiness. |
| `GET /api/v1/dashboards/marketing` | Marketing page | Shopify funnel and future-ready Klaviyo analytics. |
| `GET /api/v1/dashboards/insights` | Insights page | Source status and deterministic data-quality findings. |
| `GET /api/v1/sources/status` | Global freshness UI | Source configuration, last check/success, data-as-of, completeness. |
| `GET /api/v1/drilldowns/{dataset}` | Tables and detail drawers | Paginated, sortable, PII-safe detail records. |
| `GET /api/v1/exports/{dataset}` | Approved CSV export | Filtered, aggregate or approved detail CSV. |
| `POST /api/internal/refresh/{source}` | Trigger.dev/manual operations | Protected cache refresh; never exposed to browser navigation. |

Query conventions:

- Dates are `YYYY-MM-DD`; repeated list filters use comma-separated stable keys.
- Sort uses `sort=field:asc|desc`; only allowlisted fields are accepted.
- Pagination uses opaque cursor plus `limit`, capped at 100.
- Responses include supported filter metadata so the UI can disable unsupported filters.
- Export endpoints enforce row, time, and field limits and exclude PII.

## 8.9 Health and readiness

Health checks are separated:

- **Liveness:** application process can answer; no provider calls.
- **Readiness:** required configuration is present and internal services initialize.
- **Source status:** provider access and validation status, cached and rate-limited.

Deployment health must not fail merely because Klaviyo has no activity or a Conditional workbook is not ready. Core Shopify unavailability is a release-impacting readiness issue; Conditional-source failures are isolated.

# 9. Phase 1 — Complete backend plan

Phase 1 is sequential. Every subphase has its own gate. The agent must finish the current subphase, run its tests, record evidence, and only then continue.

## 9.1 Subphase B0 — Repository preflight and scope lock

**Objective:** Establish a safe starting point and prevent abandoned architecture from controlling the new build.

Tasks:

- Read the approved Deliverable Plan, this architecture plan, all research audits, and applicable repository instructions completely.
- Inspect branch, working tree, dependencies, configurations, tests, and existing files.
- Preserve user changes. Do not delete or overwrite legacy work without approval.
- Produce a keep/replace/retire map for existing Supabase, auth, database, webhook, and source-integration code.
- Create the phase checklist, traceability matrix, blocker register, Architecture Decision Record index, and test-evidence index.
- Verify Node, pnpm, Next.js, TypeScript, and test versions against the approved stack.

Independent tests and checks:

- Clean deterministic dependency install from the lockfile.
- Existing lint, typecheck, tests, and build are run as baseline; failures are recorded, not disguised.
- Secret scan and repository PII scan.

Gate B0:

- Scope/legacy map approved.
- No unreviewed destructive changes.
- Every existing failure classified as pre-existing or introduced.
- Blockers consolidated; no metric or source decision inferred.

## 9.2 Subphase B1 — Backend foundation and contracts

**Objective:** Establish strict boundaries before connecting a source.

Tasks:

- Configure strict TypeScript, ESLint, import boundaries, formatting, and deterministic scripts.
- Implement environment schemas with server-only separation and fail-fast messages.
- Define money, percentage, timezone, date-range, comparison, filter, readiness, error, pagination, cache, and source-status contracts.
- Implement the metric registry structure and definition-version rules.
- Define ports for Shopify, Klaviyo, Google files, cache, clock, logger, and refresh scheduling.
- Create sanitized contract fixtures for current, no-activity, partial, stale, invalid, unavailable, and error states.

Independent tests:

- Unit tests for money conversions, rounding, zero denominators, date boundaries, DST transitions, filter normalization, and cache-key stability.
- Zod contract acceptance/rejection tests.
- Compile-time dependency-boundary checks.
- Environment tests proving client code cannot access server secrets.

Gate B1:

- Public contracts are frozen at schema version 1.0.
- Critical utility branches have 100% coverage.
- No `any`, secret fallback, machine-timezone dependency, or duplicated metric key exists.

## 9.3 Subphase B2 — Shopify source adapter

**Objective:** Implement the complete read-only Shopify access layer without dashboard calculations.

Tasks:

- Create least-privilege scope requirements and configuration validation.
- Implement ShopifyQL query builders only for deliverable-approved datasets.
- Implement Admin GraphQL current resource queries and bounded cursor pagination.
- Normalize provider money, dates, IDs, product/variant/SKU, inventory/location, refund, and fulfillment records.
- Implement throttle handling, retry policy, request IDs, historical-completeness metadata, and channel `Unclassified` behavior.
- Prohibit mutations at both source-code and test levels.

Independent tests:

- Contract tests against sanitized recorded responses.
- Query snapshot tests with variable values redacted.
- Pagination, throttling, timeout, retry, cancellation, malformed response, and partial-history tests.
- Static scan proving no GraphQL mutation operation is present.
- Live read-only smoke test only after credentials are supplied through approved secrets.

Gate B2:

- Every required Shopify dataset maps to an audited field/resource.
- No write scope or mutation is required.
- Aggregate and detailed history are never conflated.
- Connector failures map to stable readiness states.

## 9.4 Subphase B3 — Klaviyo Future-Ready Core adapter

**Objective:** Build an empty-safe adapter that automatically returns metrics when genuine activity appears.

Tasks:

- Implement account, metric, campaign, flow, report, aggregate, and event-presence resources.
- Freeze verified metric IDs through configuration/source registry; support controlled rediscovery without changing metric keys.
- Implement report-time versus event-time semantics and New York display normalization.
- Return `no_activity` for valid empty responses.
- Exclude profiles and raw PII from aggregate dashboard paths.

Independent tests:

- Zero-event account, newly created flows, empty reports, populated campaign, populated flow, missing metric, permission failure, throttling, pagination, and timezone-boundary fixtures.
- Contract tests proving new campaigns/flows appear without UI schema changes.
- Assertion that Klaviyo revenue labels remain attributed and never replace Shopify sales.

Gate B3:

- Empty Klaviyo is a successful state, not an error.
- Populated fixtures pass the same stable contract.
- No profile PII appears in logs or API output.

## 9.5 Subphase B4 — Google Drive, Budget, and S&OP adapters

**Objective:** Read and validate allowlisted planning/operational sources without modifying them.

Tasks:

- Implement native Sheet batch reads and Drive metadata/download paths.
- Implement read-only Excel workbook parsing and formula/error inspection.
- Lock file IDs, tab names, required ranges, column schemas, and source classification.
- Treat Corrected Budget as plan/target only.
- Report S&OP placeholders, blanks, duplicates, and `#REF!` errors.
- Implement manual-table schema definitions from the deliverable without creating Sheets.

Independent tests:

- Missing tab/column, renamed column, mixed dates, numeric text, duplicate IDs, draft/example rows, formula error, changed file ID, permission loss, partial edits, and conflicting source fixtures.
- Read-only static checks: no Sheets update/append/clear methods and no Drive write methods.
- Budget label tests preventing actual/plan confusion.

Gate B4:

- Invalid workbook data cannot enter calculations.
- File version/modified metadata is returned.
- Source conflicts remain explicit and unresolved.

## 9.6 Subphase B5 — Metric services and certified view models

**Objective:** Implement each Core and Future-Ready metric exactly once.

Tasks:

- Implement page-oriented use cases and pure metric calculations.
- Map each deliverable component to metric registry keys and source dependencies.
- Implement global period/comparison behavior and supported-filter rules.
- Implement deterministic data-quality findings.
- Implement Conditional readiness results without activating blocked formulas.
- Create view models for every backend endpoint.

Independent tests:

- Golden-value tests for each metric and comparison.
- Property tests for signs, rounding, empty denominators, monotonic totals, and filter combinations where useful.
- Reconciliation tests against approved provider samples.
- Traceability test: every active metric key appears in the deliverable mapping and has a definition version.
- Negative tests proving blocked metrics never emit numeric production values.

Gate B5:

- Core/Future-Ready metric registry coverage is 100%.
- Critical metric calculation branch coverage is 100%.
- All results carry source, freshness, completeness, and warning metadata.

## 9.7 Subphase B6 — Orchestration and caching

**Objective:** Meet freshness and reliability targets without adding persistence.

Tasks:

- Implement normalized cache keys, tags, TTL, stale windows, and successful-only replacement.
- Add identical-request coalescing, bounded concurrency, and protected manual refresh.
- Add optional Trigger.dev schedules for cache warming/source checks after on-demand behavior is proven.
- Ensure a failed Conditional source does not invalidate Core data.
- Implement cache bypass for diagnostic tests and approved operations.

Independent tests:

- Hit, miss, expiry, stale fallback, invalid response, provider outage, concurrency stampede, tag invalidation, schema-version change, and partial-source scenarios.
- Verify no PII or secrets enter cache keys/values.
- Load test repeated date/filter combinations.

Gate B6:

- Cache never changes metric truth or becomes required history.
- Failed refresh never replaces valid cached data.
- Freshness metadata matches actual cache/source behavior.

## 9.8 Subphase B7 — APIs, drill-downs, exports, and source status

**Objective:** Deliver the frozen, versioned backend interface required by Phase 2.

Tasks:

- Implement Route Handlers and shared response/error serialization.
- Enforce date, filter, sort, pagination, export, and field allowlists.
- Implement PII-safe drill-downs and CSV exports only where approved.
- Publish machine-readable Zod schemas, typed fixtures, and endpoint examples for the frontend.
- Add liveness, readiness, and source-status endpoints.

Independent tests:

- Request/response contract tests for every endpoint and state.
- Invalid query, oversized range, unsupported filter, pagination, export formula-injection, content type, caching header, and problem-response tests.
- Snapshot tests of representative schema-compatible payloads.
- API compatibility test preventing accidental breaking changes.

Gate B7:

- Every frontend component has a typed backend field or an explicit readiness state.
- No raw provider object crosses the API boundary.
- Exports exclude PII and neutralize spreadsheet formula injection.

## 9.9 Subphase B8 — Backend security, observability, and operations

**Objective:** Make the backend safe and operable before frontend work begins.

Tasks:

- Configure server-only secrets, redaction, CSP/security headers, allowed origins, request size limits, and internal-route secret verification.
- Configure platform-level deployment protection for non-public environments and select the approved production protection option.
- Add structured logs, correlation IDs, connector metrics, cache metrics, validation counters, and job alerts.
- Create connector outage, expired credential, invalid Sheet, stale data, rollback, and secret-rotation runbooks.
- Configure Vercel environments and GitHub Actions without exposing live secrets to untrusted preview builds.

Independent tests:

- Secret-leak tests, dependency audit, static analysis, malicious query input, CSV injection, log-redaction, internal-refresh authorization, and security-header checks.
- Failure-injection tests for each provider and cache layer.
- Operational drill using a revoked/invalid test credential.

Gate B8:

- No high/critical unresolved dependency or secret finding.
- All failure states are observable and have runbooks.
- Production source credentials are least privilege and server-only.

## 9.10 Subphase B9 — Full backend certification

No new feature work is allowed in B9. Fixes must be limited to certification failures.

Required suite:

- Clean install, lint, format check, strict typecheck, and production build.
- Unit, contract, integration, API, cache, connector, metric-correctness, reconciliation, export, security, reliability, and load tests.
- Live read-only connector smoke tests where credentials are approved.
- Fixture scan for secrets and PII.
- API documentation and traceability audit.

Quality thresholds:

- 100% branch coverage for money, time boundaries, metric formulas, readiness transitions, and access/secret guards.
- At least 90% statements and 85% branches for backend application/domain modules.
- Zero failing or silently skipped mandatory tests.
- Cached API p95 below 500 ms under the agreed internal load profile.
- Uncached provider-backed API p95 target below 4 seconds; slower providers must return progressive page-ready separation or an explicit performance exception.
- All endpoints return bounded payloads and stable error formats.

Phase 1 gate report must list exact pass, fail, blocked, skipped, and not-run counts; files changed; endpoints; sources; metrics; security results; performance results; known limitations; and unresolved decisions. After the report, stop and wait for explicit Phase 2 approval.

# 10. Frontend detailed architecture

## 10.1 Rendering strategy

- Route layouts and initial page shells are Server Components.
- Interactive filters, charts, tooltips, drawers, and tables are narrowly scoped Client Components.
- Phase 2 uses a `DashboardDataProvider` interface with certified fixtures generated from Phase 1 contracts.
- Phase 3 switches the provider implementation to the certified backend; components do not change their data shape.
- Global filters are encoded in URL query parameters so views are refreshable and shareable.
- Unsupported filters are disabled or omitted using endpoint capability metadata.

## 10.2 Component layers

| Layer | Examples | Rule |
|---|---|---|
| Primitive | Button, Select, Tooltip, Skeleton, Badge | No business logic. |
| Dashboard shell | Sidebar, TopBar, DateRange, FilterBar, PageHeader | Shared across routes. |
| State | NoActivity, NotConfigured, Partial, Stale, Invalid, Unavailable, Error | One consistent visual language. |
| Data display | KPI card, chart card, data table, source label, freshness badge | Accept typed display values only. |
| Feature | RevenueTrend, ProductMix, KlaviyoFlowTable | Owns page-specific composition, not provider access. |
| Page | Executive, Revenue, Customers, Products, Operations, Marketing, Insights | Composes features and route metadata. |

## 10.3 Design system

Phase 2 begins with a full visual audit of the approved demo. Extract exact colors, typography, spacing, radii, shadows, icons, chart defaults, breakpoints, and component dimensions into tokens. Do not redesign the product.

Required token groups:

- Brand and semantic colors, including status colors with accessible contrast.
- Type families, weights, sizes, line heights, and numeric alignment.
- Spacing scale, grid, card padding, and page gutters.
- Border, radius, shadow, focus-ring, and overlay tokens.
- Chart series, grid, axis, tooltip, target, comparison, and unavailable-state tokens.
- Desktop and tablet breakpoints; mobile receives a safe read-only fallback even if not a primary target.

All numeric values use tabular figures. Large values are abbreviated only in visual labels; full accessible values remain available in tooltip or screen-reader text.

## 10.4 Charts and tables

- One chart wrapper owns axes, typography, grid, tooltip, legend, responsive sizing, loading, empty, and error behavior.
- Recharts components are lazy-loaded where they materially reduce initial bundle size.
- Never encode meaning by color alone; use labels, patterns, markers, or text.
- Every chart includes a textual summary and accessible data table or equivalent screen-reader representation where appropriate.
- Tables use TanStack only when sorting/pagination/column behavior is needed. Small static comparisons remain semantic HTML tables.
- Virtualization is added only when measured row volume requires it; server pagination is the default for large detail sets.

# 11. Phase 2 — Complete frontend plan

Phase 2 starts only after Phase 1 is approved. It uses frozen contracts and fixtures; it does not connect to live providers or alter backend behavior.

## 11.1 Subphase F0 — Visual contract audit and frontend scope lock

**Objective:** Convert the approved demo into a testable visual specification.

Tasks:

- Inventory every route, navigation item, KPI card, chart, table, filter, drawer, tooltip, export action, and state.
- Capture reference screenshots at approved desktop and tablet viewports.
- Extract design tokens and exact component geometry.
- Map unsupported demo content to the deliverable’s truthful state.
- Define the new Operations page by reusing existing demo patterns only.
- Replace unsupported user-profile/admin affordances with the approved internal-dashboard treatment.

Independent tests/checks:

- Visual inventory reviewed against every demo page.
- Component and route traceability to the deliverable.
- Contrast and typography baseline audit.

Gate F0:

- No unresolved visual element lacks a keep/rebuild/remove decision.
- Screenshot baselines and token file are approved.

## 11.2 Subphase F1 — Frontend foundation and application shell

**Objective:** Build navigation, layout, global filters, and shared state handling.

Tasks:

- Implement dashboard layout, sidebar, top navigation, page header, date range, comparison, filter bar, export trigger, and source freshness surface.
- Implement URL parsing/serialization and canonical filter behavior.
- Implement error boundary, not-found, loading shell, and responsive navigation.
- Add fixture data provider and contract validation at its boundary.

Independent tests:

- Component tests for every shell control and state.
- URL round-trip, invalid URL recovery, keyboard navigation, focus management, and responsive viewport tests.
- Visual regression for shell at approved viewports.

Gate F1:

- Global controls behave consistently without a live backend.
- No authentication UI or write control remains.
- Shell meets WCAG 2.2 AA automated checks.

## 11.3 Subphase F2 — Reusable dashboard component library

**Objective:** Build and certify reusable visual primitives before pages.

Components:

- KPI, trend, comparison, chart, table, insight, warning, source, freshness, and readiness cards.
- Line, area, vertical/horizontal bar, stacked bar, heatmap, donut only where approved, funnel, and compact sparkline wrappers.
- Empty/no-activity/not-configured/partial/stale/invalid/unavailable/error states.
- Pagination, sort controls, detail drawer, export progress, and tooltip/legend components.

Independent tests:

- Story/fixture matrix for every component state and extreme value.
- Long labels, large/negative/zero/null values, narrow widths, missing series, and dense series tests.
- Keyboard, screen reader naming, contrast, reduced motion, and zoom-to-200% checks.
- Visual-regression baselines.

Gate F2:

- Every component has typed props, state coverage, accessibility checks, and a visual baseline.
- No feature page contains duplicated chart or state logic.

## 11.4 Subphase F3 — Page implementation sequence

Pages are implemented and gated one at a time in this order:

1. Executive Health.
2. Revenue Intelligence.
3. Customer Intelligence.
4. Product Intelligence.
5. Operations Intelligence.
6. Marketing Intelligence, including Future-Ready Klaviyo states.
7. Insights and Data Quality.
8. Conditional Growth/Financial navigation treatment only if approved.

For each page:

- Map every component to a Phase 1 contract field.
- Implement current, no-activity, partial, stale, unavailable, and error fixtures.
- Implement filter support exactly as declared by the backend.
- Add drill-down/export UI only for approved endpoints.
- Run page component tests, keyboard tests, axe checks, responsive tests, and visual regression before starting the next page.

Page gate:

- Every deliverable component is present, explicitly conditional, or explicitly out of V1.
- No demo number or sample value is presented as production truth.
- Screenshot differences are reviewed and explained.

## 11.5 Subphase F4 — Frontend performance, responsiveness, and resilience

**Objective:** Optimize the whole frontend without changing its visual contract.

Tasks:

- Route-level code splitting and chart lazy loading.
- Stable skeleton dimensions to prevent layout shift.
- Memoize only measured expensive transformations; keep domain calculation on the backend.
- Verify desktop-first, tablet, and safe mobile behavior.
- Add print/export-safe styles only if the approved export requires them.

Independent tests:

- Lighthouse/Web Vitals checks, slow-network tests, JavaScript-disabled server-shell check where useful, 200% zoom, reduced motion, high contrast, and orientation changes.
- Interaction tests during loading, stale refresh, and endpoint error fixtures.

Gate F4:

- LCP ≤2.5 s, INP ≤200 ms, and CLS ≤0.1 at the agreed p75 test profile for cached data.
- No horizontal clipping at approved viewports.
- No accessibility-critical finding remains.

## 11.6 Subphase F5 — Full frontend certification

No new components or visual redesigns are permitted here.

Required suite:

- Clean install, lint, strict typecheck, production build.
- Unit, component, route-render, contract-fixture, accessibility, responsive, keyboard, and visual-regression tests.
- Every API state across every page.
- Cross-browser Chromium, WebKit, and Firefox coverage for critical journeys.
- Bundle and Web Vitals budgets.

Quality thresholds:

- At least 85% statements and 80% branches for feature and shared component logic.
- 100% tests for state mapping, filter serialization, formatting, and accessibility labels used by critical KPIs.
- Zero unexplained visual-regression differences.
- Zero failing or silently skipped mandatory tests.

Phase 2 gate report uses the same evidence standard as Phase 1. After the report, stop and wait for explicit Phase 3 approval.

# 12. Phase 3 — Backend/frontend integration, UAT, and release

## 12.1 Subphase I0 — Integration readiness

**Objective:** Prove both certified artifacts and environments are ready before wiring them together.

Tasks:

- Verify Phase 1 and Phase 2 gate approvals and matching schema versions.
- Confirm source credentials, allowlisted file IDs/ranges, platform protection, environment variables, and production domains.
- Run backend contract tests and frontend fixture tests unchanged.
- Create rollback point and release checklist.

Gate I0: no contract drift, no missing Core secret, and no unresolved critical decision.

## 12.2 Subphase I1 — Production data-provider wiring

**Objective:** Replace fixture provider with the certified production provider without changing feature components.

Tasks:

- Connect Server Components/use cases and browser drill-down calls to versioned endpoints.
- Preserve request IDs, freshness, warnings, supported filters, and readiness states.
- Verify credentials remain server-side in built artifacts.
- Keep a controlled fixture mode for tests and preview environments.

Tests:

- Schema compatibility, hydration, request cancellation, retry UI, cache metadata, and secret-bundle scans.
- Live read-only smoke tests with bounded ranges.

Gate I1: one complete vertical slice—Executive Health—passes live end to end before another page is connected.

## 12.3 Subphase I2 — Page-by-page live integration

Connect pages in the Phase 2 implementation order. Each page must pass:

- Source reconciliation.
- Filter/date/comparison agreement between UI, API, and provider.
- Current and all failure/readiness states.
- Drill-down/export checks where approved.
- Visual regression with realistic live shapes and sanitized screenshots.
- Accessibility and responsive checks.

Do not batch-connect all pages and postpone validation.

## 12.4 Subphase I3 — Cross-source and conditional behavior

**Objective:** Verify the system remains truthful when sources differ or fail.

Scenarios:

- Shopify current while Klaviyo has no activity.
- Shopify current while Budget/S&OP is stale or invalid.
- Klaviyo begins returning activity after an empty period.
- One source times out while another remains current.
- A Sheet changes schema or permission.
- Detailed order history is incomplete while aggregate history is complete.
- Conditional data becomes valid or becomes invalid again.

Gate I3: each module isolates failure, displays the correct state, and never substitutes zero or stale data without disclosure.

## 12.5 Subphase I4 — Full-system certification

Required testing:

- End-to-end user journeys for every route and global filter.
- Contract, integration, source, reconciliation, cache, export, security, accessibility, responsive, browser, visual, performance, reliability, and recovery suites.
- Production build and preview deployment smoke tests.
- Cache cold/warm behavior and provider-throttling tests.
- Secret rotation and provider permission-loss rehearsal.
- Rollback rehearsal to the prior deployment.

Release thresholds:

- No Sev-1 or Sev-2 defect.
- No unresolved high/critical security finding.
- All Core metrics reconcile within approved tolerance.
- All Conditional metrics are either activated with evidence or visibly not ready.
- Klaviyo empty and populated fixtures both pass.
- Performance and accessibility budgets pass.

## 12.6 Subphase I5 — UAT and production release

UAT scenarios are written from the Deliverable Plan, not from implementation details. ZACAO reviews page content, metric definitions, source labels, filters, states, exports, and visual parity.

Release sequence:

1. Freeze scope and code.
2. Confirm environment/secrets and platform protection.
3. Run final CI and source smoke tests.
4. Deploy production with cache cold-start plan.
5. Perform read-only production smoke tests.
6. Monitor source errors, latency, validation, cache, and Web Vitals.
7. Approve release or execute rollback.

The Phase 3 report records production version, commit, tests, source status, activated modules, known limitations, monitoring links, rollback result, and final approval.

# 13. Page-to-backend traceability

| Page | Primary backend contract | Core data | Conditional/readiness data |
|---|---|---|---|
| Executive | `/api/v1/dashboards/executive` | Shopify sales, orders, AOV, returning rate, trend, channels, fulfillment | Plan comparison, business score, recommendations. |
| Revenue | `/api/v1/dashboards/revenue` | Shopify sales components, trends, products, channels, heatmap | Budget plan, detailed-history waterfall. |
| Customers | `/api/v1/dashboards/customers` | New/returning, geography, Shopify funnel | Cohorts, LTV, RFM, at-risk. |
| Products | `/api/v1/dashboards/products` | Product/SKU performance, current catalog/inventory, cost completeness | Value, sell-through, runway, reorder, baskets. |
| Operations | `/api/v1/dashboards/operations` | Fulfillment and current represented inventory | YBYD, lots, FEFO, forecast, production, costs. |
| Marketing | `/api/v1/dashboards/marketing` | Shopify funnel; Klaviyo Future-Ready contracts | Paid media, social, content attribution. |
| Insights | `/api/v1/dashboards/insights` | Source freshness, history, cost, channel, Klaviyo, S&OP findings | Threshold alerts and ranked deterministic recommendations. |

# 14. Testing strategy and quality measures

## 14.1 Test pyramid

| Layer | Purpose | Tools | Runs |
|---|---|---|---|
| Static | Types, lint, boundaries, secret patterns | TypeScript, ESLint, scripts | Every change. |
| Unit | Pure metric, money, time, filters, state mapping | Vitest | Every subphase. |
| Contract | Provider and API schemas | Vitest + Zod fixtures | Every connector/API change. |
| Integration | Adapter/use-case/cache behavior | Vitest with fake servers | Every backend subphase. |
| Component | UI behavior and accessibility | Testing Library + Vitest | Every component/page. |
| Visual | Demo parity and regressions | Playwright screenshots | Every frontend page and release candidate. |
| E2E | User journeys through deployed app | Playwright | Phase 3 and release. |
| Accessibility | WCAG behavior | axe + manual keyboard/screen-reader checks | Each page and full certification. |
| Performance | API/load/Web Vitals | k6, browser traces | Backend gate and release. |
| Security | Secrets, headers, inputs, dependency risks | CI scanners and targeted tests | Every gate. |

## 14.2 Mandatory fixture set

Every relevant contract has fixtures for:

- Normal current data.
- Zero genuine data.
- No activity.
- Missing connector.
- Partial history.
- Stale result.
- Invalid schema/value.
- Provider unavailable.
- Provider error.
- Very large, negative, null, and long-label values.
- DST boundary and month/year rollover.
- Unsupported filter and empty comparison period.

## 14.3 Definition of a passing test gate

- Command, environment, commit, start/end time, and result are recorded.
- Skipped tests are not counted as passed.
- Flaky tests are defects; rerunning until green without cause analysis is prohibited.
- Live connector checks never modify a source and never print PII or secrets.
- A gate fails if mandatory evidence cannot be produced.

# 15. Security and privacy architecture

- Application login remains out of V1.
- Production must use the approved Vercel deployment-protection mechanism or a separately approved network restriction. A public URL requires explicit risk acceptance.
- Separate read-only credentials per environment where providers support it.
- Use least-privilege Shopify scopes, scoped Klaviyo private-key permissions, and a Google service account shared only as Viewer on allowlisted files.
- Validate all query parameters, route names, sort fields, export fields, and internal refresh requests.
- Apply CSP, HSTS, frame, content-type, referrer, and permissions policies appropriate to the app.
- Aggregate or remove customer and pipeline PII before response serialization.
- Logs use allowlisted fields and redaction; raw provider payload logging is prohibited.
- Preview deployments use fixtures unless explicitly permitted to access read-only staging sources.
- Secret rotation is documented and tested without code changes.

# 16. Observability and operational controls

Structured events:

- `request.completed`, `request.failed`.
- `source.fetch.started|succeeded|failed|throttled`.
- `source.validation.failed`.
- `cache.hit|miss|stale|write|invalidation`.
- `metric.calculation.failed`.
- `export.completed|rejected`.
- `refresh.completed|failed`.

Each event includes request ID, environment, source, endpoint, duration, cache state, status code, definition/schema version, and non-sensitive warning codes.

Alerts:

- Core Shopify source unavailable for two consecutive scheduled checks.
- Validation failure for a previously valid Core schema.
- Core data older than its approved maximum stale window.
- Sustained provider throttling or error-rate increase.
- Backend p95/API error rate outside approved threshold.
- Trigger.dev scheduled refresh failure when schedules are enabled.

Data-quality warnings are product states, not operational alerts. Klaviyo no activity and blocked Conditional modules must not page an engineer.

# 17. CI/CD and environments

## 17.1 Environments

| Environment | Data policy | Purpose |
|---|---|---|
| Local | Sanitized fixtures by default; optional approved read-only dev credentials | Development and deterministic tests. |
| Preview | Fixtures only by default | Pull-request visual and contract review. |
| Staging | Approved read-only sources or sanitized replay fixtures | Live integration, performance, and UAT rehearsal. |
| Production | Least-privilege read-only credentials and platform protection | Internal business use. |

## 17.2 CI workflow

Pull requests run install-lockfile verification, lint, typecheck, unit/contract/component tests, coverage, production build, secret scan, dependency review, and relevant Playwright suites. Main-branch release candidates additionally run integration, visual, accessibility, and performance gates.

Deployment rules:

- No automatic production deployment from an unapproved phase.
- Environment variables are configured in Vercel/Trigger.dev, never committed.
- Preview deployments cannot receive production secrets from forked/untrusted contexts.
- Every release is tied to a commit and immutable test report.
- Rollback uses the previously verified Vercel deployment; no database rollback exists in V1.

# 18. Performance and scaling plan

Initial target profile is a low-volume internal dashboard, but the architecture avoids per-component provider calls.

- One page use case batches source requirements and returns one page view model.
- Reuse a single source fetch within a request.
- Use provider aggregation instead of downloading all events when possible.
- Cache by normalized page filters and source freshness.
- Apply server pagination to large drill-downs and exports.
- Lazy-load non-critical charts and avoid shipping raw datasets to the browser.

Expected first bottlenecks and response:

| Trigger | First response | Architecture change requiring approval |
|---|---|---|
| Provider rate limits/slow uncached pages | Increase batching, cache reuse, and refresh scheduling. | Durable rollup store if cache cannot meet targets. |
| Need to preserve Sheet history | Require append-only source tabs first. | Add database snapshot tables if overwrites continue. |
| Complete customer cohorts/LTV required | Obtain detailed Shopify history/export. | Add durable normalized order store. |
| Many users/filter combinations | Measure cache miss rate and provider load. | Add durable aggregates or dedicated cache only with evidence. |
| Operational decisions require auditability | Add source versioning process. | Add database with certified snapshots and lineage. |

# 19. Failure and degradation matrix

| Condition | Backend behavior | Frontend behavior |
|---|---|---|
| Shopify timeout, valid stale cache | Return stale data with age/warning inside approved window. | Show values with Stale badge and source detail. |
| Shopify timeout, no acceptable cache | Return source unavailable for affected Core components. | Preserve layout and show Unavailable; never show zero. |
| Klaviyo valid but empty | Return `no_activity`. | Show configured future-ready empty state. |
| Klaviyo permission/account failure | Return `not_configured` or `invalid`. | Show integration issue, not zero performance. |
| Sheet schema changed | Reject current source response; do not calculate. | Show Invalid with tab/field guidance. |
| S&OP still placeholders | Return blocked readiness and issue counts. | Show Data source not ready. |
| Detailed Shopify history incomplete | Return available aggregates plus partial-history metadata. | Show aggregate views and limit/hide affected drill-down/cohort. |
| Unknown channel | Include in company total; classify as Unclassified. | Show Unclassified and data-quality warning. |
| Missing SKU cost | Preserve sales; block affected margin. | Show missing-cost warning and no fabricated margin. |

# 20. Anti-hallucination and execution-control protocol

This protocol is mandatory for every coding-agent turn.

## 20.1 Before starting a subphase

1. Read the active phase/subphase section and its dependencies.
2. Check repository status and preserve user changes.
3. Verify the task exists in the approved plan and traceability matrix.
4. Check the blocker and decision registers.
5. Identify files expected to change and tests expected to run.
6. Confirm no requested action writes to Shopify, Klaviyo, or Google sources.
7. State the current subphase and stop condition concisely.

## 20.2 Allowed judgment

The agent may choose reversible implementation details such as internal function names, test organization, small refactors inside the active subphase, and exact private helper shapes when they follow the approved boundaries and standards.

## 20.3 Decisions the agent may not make

- Add/remove a dashboard metric, page, filter, source, or V1 class.
- Invent metric definitions, thresholds, mappings, owners, refresh SLAs, or reconciliation tolerances.
- Enable a Conditional metric because sample data exists.
- Change timezone, currency, history, attribution, or financial semantics.
- Introduce a database, authentication, Redis, queue, microservice, second repository, or new hosting service.
- Add a package or service without the required ADR and approval when material.
- Modify external source data or permissions.
- Move to the next phase before the current gate and explicit approval.
- Rewrite unrelated code or “clean up” beyond the current subphase.
- Spawn subagents or delegate the implementation unless ZACAO explicitly authorizes it.

## 20.4 Blocker behavior

- Record the exact missing fact, dependent component, evidence checked, and owner/decision needed.
- Mark only the affected work blocked.
- Implement truthful readiness behavior when the plan authorizes it.
- Continue safe independent work without breaking dependency order.
- Ask one consolidated set of questions at a natural gate; do not repeatedly interrupt for non-blocking items.
- Never use a plausible default to make a blocked test pass.

## 20.5 Scope-drift check

Before every meaningful edit, answer:

- Is this in the active phase and subphase?
- Is it traceable to the Deliverable Plan or this architecture?
- Does it depend on an unresolved rule?
- Does it alter an external system, security boundary, or one-way decision?
- Does it introduce an unapproved dependency?
- Does it belong to Conditional or Out-of-V1 work?
- Can it damage existing user work?

If uncertain, stop that edit and ask.

## 20.6 Evidence-first progress report

Each progress update states only:

- Current subphase.
- Completed artifacts and files.
- Tests run and exact results.
- New blockers or decisions.
- Next authorized action.

Do not repeatedly rewrite the plan, speculate about later phases, or claim completion without evidence.

# 21. Decision and change control

Maintain:

- `docs/architecture/TRACEABILITY.md` — deliverable component → metric → source → endpoint → frontend component → tests.
- `docs/architecture/BLOCKERS.md` — unresolved facts and affected scope.
- `docs/adr/` — material technical decisions.
- `docs/evidence/phase-1/`, `phase-2/`, and `phase-3/` — immutable gate reports.

Any requested scope change is evaluated for source feasibility, contract change, visual change, test impact, security, performance, and phase impact. It is not implemented until the Deliverable Plan and this architecture are versioned consistently.

# 22. Required human decisions before coding

The architecture is implementable, but the following must be approved or explicitly left blocked:

1. Approve this three-phase sequential execution model and stop gates.
2. Approve the active stack and confirm Supabase/Auth/Drizzle are excluded from active V1.
3. Approve the keep/replace/retire treatment for existing abandoned implementation files after B0 audit.
4. Choose production platform protection: Vercel deployment protection, approved network restriction, or explicit public-URL risk acceptance.
5. Approve the Shopify revenue/order/AOV/refund policy listed in the Deliverable Plan.
6. Approve product-mix basis and Unclassified channel behavior.
7. Choose detailed Shopify history: aggregate-only V1, `read_all_orders`, controlled export, or prioritized combination.
8. Confirm the Klaviyo account/Shopify integration and attributed-revenue label.
9. Lock the Corrected Budget file ID and approve it as plan-only.
10. Confirm whether PO 2001 is real and resolve the SKU/cost mapping conflict before related Conditional activation.
11. Choose blocked-page behavior: hidden, disabled, or visible as not ready.
12. Approve recommended refresh/freshness windows or provide replacements.
13. Approve export formats and allowed datasets; otherwise exports remain disabled.
14. Approve PII exclusion from UI, API, logs, fixtures, and exports.
15. Provide server-side read-only credentials through the approved secret path when live verification begins.

Unanswered Conditional decisions do not prevent Core backend implementation; they keep only the affected modules blocked.

# 23. Phase gate deliverables

| Gate | Required deliverables |
|---|---|
| Phase 1 Backend | Source adapters, contracts, metric registry, calculations, page view models, cache, APIs, exports, security, operations docs, test evidence, blockers, and gate report. |
| Phase 2 Frontend | Demo audit, design tokens, component library, all pages/states, fixture provider, responsive/accessibility/visual/performance evidence, and gate report. |
| Phase 3 Integration | Live wiring, reconciliation, end-to-end/system/security/accessibility/performance results, UAT record, release/rollback evidence, final limitations, and release report. |

# 24. Overall definition of done

Dashboard V1 is complete only when:

- Every Core and Future-Ready component in the Deliverable Plan is traceable through source, definition, backend contract, frontend component, and automated tests.
- All Core data reconciles to approved source results within approved tolerance.
- Klaviyo components behave correctly with both empty and populated data and require no redesign when activity begins.
- Every Conditional module is either activated with complete evidence or visibly not ready without a fabricated value.
- The approved demo’s visual system is reproduced, including the new Operations page in the same language.
- Global filters, comparison behavior, source labels, freshness, completeness, exports, and all required states work consistently.
- No application login or primary database has been introduced without a separately approved architecture revision.
- No source-system write exists.
- Security, accessibility, performance, browser, visual, reliability, and recovery gates pass.
- Production is protected by the approved access control, monitored, documented, and rollback-ready.
- ZACAO accepts the UAT results and known limitations.

# Appendix A — Initial route map

```text
/dashboard/executive
/dashboard/revenue
/dashboard/customers
/dashboard/products
/dashboard/operations
/dashboard/marketing
/dashboard/insights

/api/v1/health
/api/v1/dashboards/{executive|revenue|customers|products|operations|marketing|insights}
/api/v1/sources/status
/api/v1/drilldowns/{approved-dataset}
/api/v1/exports/{approved-dataset}
/api/internal/refresh/{approved-source}
```

# Appendix B — Recommended command surface

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:component
pnpm test:e2e
pnpm test:visual
pnpm test:a11y
pnpm test:performance
pnpm test:coverage
pnpm ci:phase-1
pnpm ci:phase-2
pnpm ci:phase-3
```

Scripts must fail on test failure, threshold failure, missing required environment, or skipped mandatory suite.

# Appendix C — Required source references

- `docs/deliverables/ZACAO_Dashboard_V1_Deliverable_Plan.docx`
- `docs/research/01_V1_REQUIREMENTS_AND_METRIC_REGISTER.md`
- `docs/research/02_SHOPIFY_DATA_AUDIT.md`
- `docs/research/03_KLAVIYO_DATA_AUDIT.md`
- `docs/research/04_BUDGET_SOP_AND_DRIVE_AUDIT.md`
- `docs/research/05_DATA_FEASIBILITY_DATABASE_DECISION_AND_PREREQUISITES.md`
- Approved ZACAO Executive Intelligence demo.
- Official Next.js, Vercel, Shopify, Klaviyo, and Google API documentation applicable to the pinned versions.

> **Final stop condition:** After this architecture is approved, the coding agent must still wait for a separate instruction naming the phase it is authorized to start. Authorization for Phase 1 does not authorize Phase 2 or Phase 3.
