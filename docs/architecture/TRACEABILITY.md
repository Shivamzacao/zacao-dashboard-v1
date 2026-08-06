# Traceability Register

Status: Initialized at page/source-capability level in B0. Metric-level rows are expanded only in the authorized backend subphases, using the locked Deliverable Plan as authority.

| Deliverable component | Class | Metric/source contract | Planned backend contract | Frontend consumer | Planned evidence | Status |
|---|---|---|---|---|---|---|
| Shared schema 1.0 foundation | Cross-cutting | Money, rates, dates, filters, readiness, errors, pagination, cache, source status, metric registry | Domain contracts and application ports | All future consumers | 41 unit/contract/environment tests; 100% critical utility coverage | Implemented and approved in B1 |
| Shopify read-only source adapter | Core source | Audited ShopifyQL datasets; current Admin GraphQL resources; explicit aggregate/detailed history | `src/infrastructure/shopify` | B5 metric services | 15 focused query, client, pagination, normalization, history, and failure-state tests | Implemented in B2; live smoke awaits approved credential path |
| Klaviyo Future-Ready Core adapter | Future-Ready Core source | Audited account, metric, campaign, flow, report, aggregate, and event-presence capabilities | `src/infrastructure/klaviyo` | B5 marketing metric services | 21 focused empty/populated, discovery, report/event-time, timezone, PII, pagination, and failure-state tests | Implemented in B3; live production-credential verification deferred |
| Executive Health | Core/Conditional mix | Shopify aggregates; plan comparison only after gate | `GET /api/v1/dashboards/executive` | Phase 2 executive page | Metric, contract, API, state tests | Not started |
| Revenue Intelligence | Core/Conditional mix | ShopifyQL sales; corrected Budget plan only after gate | `GET /api/v1/dashboards/revenue` | Phase 2 revenue page | Revenue reconciliation and filter tests | Not started |
| Customer Intelligence | Core/Conditional mix | Shopify aggregate customer classifications; detailed history disclosed | `GET /api/v1/dashboards/customers` | Phase 2 customer page | History/completeness and privacy tests | Not started |
| Product Intelligence | Core/Conditional mix | Shopify product/SKU aggregates and current inventory | `GET /api/v1/dashboards/products` | Phase 2 product page | SKU normalization and missing-cost tests | Not started |
| Operations Intelligence | Core/Conditional mix | Shopify fulfillment/current inventory; S&OP readiness | `GET /api/v1/dashboards/operations` | Phase 2 operations page | Fulfillment, source-state, workbook-readiness tests | Not started |
| Marketing Intelligence | Core/Future-Ready Core | Shopify funnel; Klaviyo reports/aggregates | `GET /api/v1/dashboards/marketing` | Phase 2 marketing page | Populated/no-activity Klaviyo contract tests | Not started |
| Insights and Data Quality | Core readiness | All source-status and deterministic warning contracts | `GET /api/v1/dashboards/insights` and `/api/v1/sources/status` | Phase 2 insights page | State, freshness, validation, redaction tests | Not started |
| Growth Intelligence | Conditional | Governed Sheets/Drive sources after activation | Readiness-only until gate passes | Conditional Phase 2 state | Schema and not-ready tests | Not started |
| Financial Intelligence | Conditional | Corrected Budget plan; genuine finance sources after activation | Readiness-only until gate passes | Conditional Phase 2 state | Plan-label and not-ready tests | Not started |
| Drill-down datasets | Core where approved | Source-specific normalized records; history and PII limits | `GET /api/v1/drilldowns/[dataset]` | Phase 2 tables | Pagination, sort allowlist, PII tests | Not started |
| Filtered exports | Disabled until approved | Approved aggregate datasets only | `GET /api/v1/exports/[dataset]` | Phase 2 export controls | Field allowlist, limits, PII tests | Blocked by approval |
| Source health/readiness | Core | Shopify, Klaviyo, Google, cache metadata | `GET /api/v1/health` and `/api/v1/sources/status` | All pages | Source-state and failure-policy tests | Not started |

Every implemented metric must ultimately add a complete traceability row from deliverable definition through source, calculation, endpoint, frontend component, and automated evidence. No row authorizes implementation outside the active subphase.
