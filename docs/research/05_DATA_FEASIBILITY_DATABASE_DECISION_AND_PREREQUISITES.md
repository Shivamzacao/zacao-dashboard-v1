# ZACAO Dashboard V1 — Data Feasibility, Scope Recommendation, Database Decision, and Prerequisites

Status: **Feasibility gate completed; awaiting ZACAO scope decisions**  
Prepared: **2026-08-05**  
This is a research and decision document. It is **not** the technical architecture or implementation plan and does not authorize coding.

## 1. Executive conclusion

A useful Dashboard V1 can be built from the sources currently accessible, using a **no-primary-database architecture**, if V1 is narrowed to the metrics that the audited sources can support truthfully.

The reliable V1 center is Shopify:

- Executive sales KPIs.
- Revenue trends and sales components.
- Product/variant/SKU sales and units.
- New versus returning customers.
- Customer geography at aggregate level.
- Shopify website funnel.
- Native Shopify channel reporting with an `Unclassified` state.
- Fulfillment counts/status.
- Current Shopify inventory for populated Shopify locations.
- Data-quality and source-readiness warnings.

Klaviyo can technically provide the requested email, SMS, campaign, flow, and attributed-revenue metrics, but the connected account currently contains no usable events or reports. The Marketing page can include the Shopify funnel and an honest Klaviyo `No data / integration not verified` state; it cannot currently show populated Klaviyo performance charts.

The Budget workbook can support plan and target comparisons. It cannot support actual expenses, actual margin, actual burn, or runway. The S&OP workbook is not yet populated enough to support certified combined inventory, FEFO, forecast variance, production scheduling, inventory runway, reorder dates, or projected cash flow.

Growth-related spreadsheets exist, but most are prospect lists, schemas, or strategy frameworks rather than complete performance ledgers. They should remain Conditional until ZACAO selects the authoritative source and supplies complete records.

### Go/no-go summary

| Decision | Conclusion |
|---|---|
| Can a useful V1 be built? | **Yes** |
| Can the full approved demo be populated with real current data? | **No** |
| Can Core V1 be built without a primary database? | **Yes, with stated constraints** |
| Does no authentication mean no database is needed? | **No; these are separate concerns.** However, this audit independently finds that a narrow Core V1 does not require a primary database. |
| Can Conditional pages be kept in the visual design? | **Yes**, but only hidden, disabled, or shown with truthful source-not-ready states—never mock production values |
| Is coding authorized now? | **No**; scope and prerequisite decisions below must be approved first |

## 2. Confirmed V1 requirements

| Requirement | Status |
|---|---|
| Internal executive/leadership dashboard | Confirmed |
| Approved demo is the visual contract | Confirmed |
| V1 deliverable document controls business scope | Confirmed |
| Reporting currency is USD | Confirmed |
| Reporting timezone is `America/New_York`, configurable later | Confirmed |
| Default reporting period is rolling last 12 months | Confirmed |
| Audit all genuinely accessible historical data | Confirmed |
| Shopify, Klaviyo, and approved Google Drive files are read-only sources | Confirmed |
| Dashboard does not write back to source systems | Confirmed |
| No application user-login system in V1 | Confirmed |
| No mock or assumed production values | Confirmed |
| Missing/partial/stale data must be visible | Confirmed |
| No architecture or code before feasibility approval | Confirmed |

## 3. Source readiness summary

| Source | Access | History/readiness | Best V1 use | Status |
|---|---|---|---|---|
| Shopify Analytics/ShopifyQL | Read-only connector verified | Rolling 12-month aggregate reporting verified | Revenue, customers, funnel, products, channels, inventory, fulfillment | **Available** |
| Shopify Admin GraphQL detailed orders | Read-only connector verified | Only 10 detailed order nodes observed; no `read_all_orders` scope | Current drill-downs and resource metadata | **Partially available** |
| Shopify products/inventory/locations | Read-only connector verified | Current state available | Product catalog, cost completeness, current Shopify inventory | **Available with data gaps** |
| Klaviyo | Read-only connector verified | Correct-looking account metadata, but 0 events/reports and no campaigns | Data-readiness state until sync/account is confirmed | **Technically available; business data missing** |
| Budget V5 Corrected Model | Read-only native Sheet | Formula-complete plan from Jun 2026 to May 2027 | Plans, targets, scenarios, planned costs | **Available as plan only** |
| S&OP Tool | Read-only Excel file in Drive | Main operational inputs blank/zero/example; formula errors present | Template/readiness status only | **Partially available; not production-ready** |
| Zacao CRM | Read-only native Sheet | Many candidate records; fields vary by tab | Conditional growth pipeline | **Partially available** |
| Investor tracker | Read-only native Sheet | Multi-year free-text outreach data | Conditional investor pipeline | **Partially available; overlaps CRM** |
| Ambassador applications | Read-only native Sheet | Application records exist | Application counts only | **Available for applications, not performance** |
| Social/ad/affiliate performance source | No verified performance ledger/API access | Not proven | None yet | **Missing** |
| Actual accounting/cash source | Not supplied | Not proven | None yet | **Missing** |

## 4. Recommended Core V1 scope

The following scope can be delivered without inventing data, subject to the policy decisions in section 11.

### 4.1 Executive Health

| Component | Source | Feasibility | Required qualification |
|---|---|---|---|
| Net sales | ShopifyQL `sales` | Available | Approve Shopify canonical sales policy |
| Orders | ShopifyQL `sales.orders` | Available | Approve order definition |
| AOV | ShopifyQL `sales.average_order_value` or approved Shopify formula | Available | Use one definition consistently |
| Returning customer rate | ShopifyQL customer sales dataset | Available | Aggregate Shopify classification only |
| Sales trend | ShopifyQL sales by day/week/month | Available | Normalize periods to New York time |
| Native sales by channel | ShopifyQL sales channel/source | Available | Show `Unclassified`; do not guess channel |
| Fulfillment status summary | Shopify fulfillment analytics/resources | Available with event limits | Delivery data may be incomplete |
| Source freshness/readiness | Source request metadata and validation | Available | Show last successful refresh/data-as-of |

Not currently supported on Executive Health: a composite Business Health score, AI-generated brief, predictive forecast, margin, runway, or inventory-risk summary.

### 4.2 Revenue Intelligence

| Component | Source | Feasibility | Required qualification |
|---|---|---|---|
| Gross sales | ShopifyQL `gross_sales` | Available | Canonical Shopify definition |
| Discounts | ShopifyQL `discounts` | Available | Normalize signs; never subtract twice |
| Returns | ShopifyQL `returns` | Available | Approve event-date recognition |
| Net sales | ShopifyQL `net_sales` | Available | Canonical Shopify definition |
| Shipping charges | ShopifyQL `shipping_charges` | Available | Present separately |
| Taxes | ShopifyQL `taxes` | Available | Present separately |
| Total sales | ShopifyQL `total_sales` | Available | Canonical Shopify definition |
| Orders and AOV | ShopifyQL | Available | Approved policy required |
| Daily/weekly/monthly sales trend | ShopifyQL | Available | Rolling 12-month default |
| Sales and units by product/variant/SKU | ShopifyQL product/variant data | Available with cleaning | Separate adjustments, blanks, and fees |
| Revenue by Shopify-native channel | ShopifyQL | Available | Requested business taxonomy remains partial |
| Purchase day/hour heatmap | ShopifyQL time dimensions | Available | Reporting-timezone conversion required |
| Revenue versus plan | Shopify + corrected Budget | Conditional | Only overlapping plan periods; label actual vs plan |

Detailed order drill-down across the full 12 months, customer-level revenue decomposition, and a complete revenue waterfall remain partial until Shopify history is resolved.

### 4.3 Customer Intelligence

| Component | Source | Feasibility | Required qualification |
|---|---|---|---|
| New customers | ShopifyQL | Available | Use Shopify aggregate classification |
| Returning customers/rate | ShopifyQL | Available | Use Shopify aggregate classification |
| Customer geography | ShopifyQL billing/shipping geography | Available | Aggregate only; do not expose PII |
| Shopify acquisition funnel | ShopifyQL sessions/cart/checkout/conversion | Available | This is Shopify funnel, not GA4 |
| Detailed cohorts | Shopify detailed order history | Partial/missing | Requires `read_all_orders` or controlled export |
| Realized LTV | Detailed customer/order history | Partial/missing | Requires definition and backfill |
| RFM segmentation | Detailed customer/order history | Partial/missing | Requires rules and backfill |
| Customer risk | History plus deterministic lapse rule | Missing | Predictive churn is outside V1 |

The V1 page should focus on aggregate customer acquisition/retention and geography. It must not imply complete customer history.

### 4.4 Product Intelligence

| Component | Source | Feasibility | Required qualification |
|---|---|---|---|
| Sales and units by product/variant/SKU | ShopifyQL | Available | Clean blank/non-product adjustments |
| Product mix | ShopifyQL | Available | Approve sales or units basis |
| Product/variant price and status | Shopify Admin GraphQL | Available | Current state |
| Units-sold velocity trend | ShopifyQL | Available | Historical aggregate, not predictive demand |
| Current inventory by populated Shopify location | Shopify inventory levels | Available with limited locations | Currently useful mainly for SNAPL |
| Missing-cost warning | Shopify product/variant cost fields | Available | One active chocolate pack cost is missing |
| Portfolio matrix | ShopifyQL-derived | Conditional | Requires approved growth/quadrant/bubble definitions |
| Inventory value | Shopify + approved effective cost | Missing | Costs and pack/unit rules unresolved |
| Sell-through | Inventory history + receipts + units | Partial | Definition and opening/received units needed |
| Inventory runway/reorder | Shopify + S&OP | Missing | S&OP operational inputs absent |
| Frequently bought together | Detailed order history | Partial/missing | Full history and thresholds required |

### 4.5 Operations Intelligence

The approved demo has no Operations page, while the deliverable requires one. The architecture phase must add this page without changing the approved visual language.

| Component | Source | Feasibility | Required qualification |
|---|---|---|---|
| Fulfilled/unfulfilled order counts | Shopify | Available | Approved status/time policy |
| Shipped/delivered counts | Shopify fulfillment/carrier events | Partial | Carrier event completeness varies |
| Current Shopify/SNAPL inventory | Shopify | Available with limits | Does not represent complete YBYD inventory |
| Combined SNAPL/YBYD inventory | S&OP/warehouse source | Missing | Real YBYD and complete SNAPL rows absent |
| Lots/best-by/FEFO | S&OP | Missing | Real lot and depletion records absent |
| Forecast versus actual | S&OP + Shopify | Missing | Forecast/actual inputs are empty/zero |
| Incoming production | S&OP PO | Partial | Only PO 2001; authenticity/status must be confirmed |
| Production schedule | S&OP | Missing | Example-only with `#REF!` errors |
| Production costs/payment dates | Budget/S&OP | Missing | Costs conflict; terms/dates incomplete |
| Additional depletions | No ledger found | Missing | New governed source needed |

### 4.6 Marketing Intelligence

| Component | Source | Feasibility | Required qualification |
|---|---|---|---|
| Shopify website funnel | ShopifyQL | Available | Use as Core marketing/commerce funnel |
| Klaviyo email metrics | Klaviyo metrics/reports | Technically supported, no current data | Confirm account/integration and allow data to populate |
| Klaviyo SMS metrics | Klaviyo metrics/reports | Technically supported, no current data | Same limitation |
| Campaign/flow reporting | Klaviyo reporting endpoints | Technically supported, reports empty | Six flows were newly created; no report activity |
| Klaviyo-attributed revenue | Klaviyo reports | Technically supported, no current data | Label as attributed; never total company revenue |
| Paid CAC/ROAS | Ad platforms + attribution | Missing | No verified spend/performance sources |
| Social growth/engagement | Social platform/Metricool exports | Missing | Strategy documents are not performance data |
| Content conversion | GA4/ad/content tagging | Missing | Tracking and access not supplied |

### 4.7 Insights and Data Quality

| Component | Source | Feasibility | Required qualification |
|---|---|---|---|
| Source freshness/status | All sources | Available | Cache/request metadata required |
| Historical-completeness warning | Shopify source status | Available | Must distinguish aggregates from detailed orders |
| Missing SKU cost | Shopify | Available | Deterministic data-quality warning |
| Unclassified channel | Shopify + mapping | Available | Mapping policy required |
| Klaviyo no-data state | Klaviyo | Available | Do not render zeros as healthy performance |
| S&OP not-ready state | Workbook validation | Available | Report missing/error categories |
| Low Shopify inventory | Shopify | Conditional | Threshold required; zero alone is not enough to infer alert policy |
| Conversion/refund/backlog alerts | Shopify | Conditional | Threshold and comparison rules required |
| Ranked recommendations | Multiple | Conditional | Deterministic ranking rules required |
| Assign action | Write system | Out of V1 | Conflicts with read-only scope |
| AI recommendations | Future system | Out of V1 | Explicitly deferred |

## 5. Conditional V1 modules currently blocked

These features may remain represented in the design but must not display assumed production values.

| Feature | Blocking condition |
|---|---|
| Inventory Runway & Reorder Alert | Complete SNAPL/YBYD inventory, incoming stock, lead time, safety buffer, and velocity rules missing |
| Combined warehouse inventory | YBYD and complete current inventory missing |
| Lot, best-by, and FEFO | Real lot/depletion data missing |
| Forecast vs actual | S&OP forecast and actual data unpopulated |
| Production timeline | Production schedule example-only and broken |
| Actual COGS/gross margin | Incomplete Shopify costs and Budget/S&OP cost conflict |
| Budget vs actual expenses | No actual accounting/expense source |
| Burn and runway | No confirmed cash balance or actual cash ledger |
| Paid CAC and ROAS | No approved ad-spend and attribution sources |
| Social performance | No verified recurring platform export/API source |
| Affiliate/ShopMy performance | No transaction/performance source |
| Ambassador performance | Application/member data exists; outcome/revenue/content data missing |
| Collaboration pipeline | Candidate lists exist; stable stages, values, dates, and IDs incomplete |
| Investor pipeline | Two overlapping sources; authority/deduplication unresolved |
| Grant pipeline | Active CRM tab is header-only in audited sample |
| Fairafric rebate | No signed rule ledger and qualifying transaction table verified |
| Additional depletions | No movement ledger found |

## 6. Features postponed beyond V1

- Advanced demand forecasting and seasonality models.
- Predictive churn and repeat-purchase prediction.
- Predictive or model-generated LTV.
- Automated pipeline-conversion probability.
- Future ROAS, profit, and cash-flow prediction.
- AI-generated recommendations.
- Automated cross-platform social listening.
- Detailed warehouse and fulfillment-cost allocation.
- Variable production-run COGS/cost-layer accounting.
- Detailed BOM, capacity, yield, and wastage models.
- New demographic collection systems.
- Dashboard-based manual data entry and approval workflows.

## 7. Exact source limitations

### Shopify

- Aggregate 12-month ShopifyQL analytics are available.
- Detailed order history is incomplete under current access; `read_all_orders` is absent.
- Native channels do not equal the requested business channel taxonomy.
- Referrer attribution is missing for a large portion of observed rows.
- Non-product sales adjustments and marketplace fee lines require separate treatment.
- The current catalog does not match the five-SKU planning model.
- Cost coverage is too incomplete for company-wide realized margin.
- Only Shopify-represented locations can be shown; YBYD is not represented as a current active populated location.
- The current connector has write scopes; production should use a new least-privilege read-only app.

### Klaviyo

- The API resources and metric definitions exist.
- The connected account has zero events and empty campaign/flow reports.
- Six flows exist but were created on 2026-08-05 and have no reported performance.
- Account timezone is `Europe/Madrid`, requiring conversion.
- Klaviyo attributed revenue uses Klaviyo attribution semantics and is not total company revenue.
- Report resources and metric aggregates use different time semantics.

### Budget

- Plan/assumption source only.
- Formula-complete in audited ranges.
- No current cash or actual expense ledger.
- Forecast horizon does not equal the rolling trailing-12-month dashboard period.
- Planned SKU model differs from Shopify catalog.
- Another V5 exists; only the supplied Corrected Model may be used.

### S&OP

- Excel file stored in Drive, not a native Google Sheet.
- Inventory, lots, forecast, actuals, and cash flows are mostly blank/zero/example data.
- Production Schedule contains three observed `#REF!` cells.
- PO 2001 may be useful but requires operational confirmation.
- Payment/freight terms are incomplete or incorrectly classified.
- Budget/S&OP conflict on two SKU cost labels/values.

### Other Drive sources

- Duplicate and archived files make title-based discovery unsafe.
- CRM and investor tracker overlap.
- Contact lists contain PII and must not be exposed in executive aggregates or logs.
- Many documents define strategies/targets rather than record actual outcomes.
- Stable IDs, controlled statuses, event dates, monetary values, and outcome fields are often missing.

## 8. Database decision

### 8.1 Decision for the current V1 scope

**A primary analytical database is not required for the recommended Core V1.**

The simplest feasible pattern is:

```text
Browser
  -> server-side dashboard endpoint
      -> read-only Shopify / Klaviyo / allowlisted Sheet reads
      -> validation and lightweight calculation
      -> server-managed response cache
  -> rendered dashboard
```

This is a feasibility direction, not the final architecture. Exact hosting/cache choices come later.

### 8.2 Conditions for remaining database-free

The no-database approach is acceptable only if ZACAO accepts all of these constraints:

1. The Core dashboard uses provider aggregate history rather than a complete internal event warehouse.
2. Detailed Shopify customer/order analytics remain partial until API permission or export history is available.
3. Google Sheets that overwrite values do not automatically provide reliable historical snapshots.
4. The dashboard may show the current validated Sheet state, not a reconstructed prior state.
5. A provider outage may make uncached data temporarily unavailable.
6. Cross-source calculations are limited to joins with stable approved keys.
7. The small internal user count and refresh frequency remain within provider limits.
8. Server-side caching is allowed even though a primary database is not used.

### 8.3 Problems a database would solve—but which Core V1 can postpone

- Persisting historical Sheet snapshots.
- Retaining certified last-known-good results across cache eviction.
- Recording reconciliation/audit history.
- Joining detailed Shopify, Klaviyo, and manual records at scale.
- Serving complex cohort/RFM/CLV calculations quickly.
- Deduplicating and versioning multiple operational sources.
- Recomputing metrics consistently after source corrections.

### 8.4 Revisit triggers

Add a small persistent snapshot/analytical store later if any of these becomes mandatory:

- Historical values must survive Sheet overwrites.
- Full cohorts, RFM, realized LTV, or customer-level drill-downs are required.
- Inventory snapshots and stockout calculations must be historically auditable.
- Last-known-good data must survive provider/API outages for long periods.
- Direct source response times or rate limits miss agreed targets.
- Multiple editors/files require record-level deduplication and reconciliation.
- Actual finance and operational ledgers need certified cross-source reporting.

Authentication is not one of these triggers. User identity and analytical persistence are separate concerns.

## 9. Authentication and access protection

No application login, user table, roles, or authentication database is required for V1.

However, an internal dashboard containing revenue, costs, pipelines, or financial plans should not be published as an unrestricted public URL. Before architecture approval, ZACAO must choose one of:

1. Platform-level shared password/deployment protection.
2. Company-network/IP restriction.
3. Public URL with no protection—**not recommended** and requires explicit risk acceptance.

This protection can be external to the application and does not require a user database.

## 10. Google Sheet operating model without a database

The internal team can update approved Sheets at any frequency. The dashboard can read the latest valid state at its next refresh. A fixed human schedule is not technically required.

For this to be reliable:

- Each production source must use a fixed Drive file ID and fixed tab name.
- Required columns cannot be renamed or removed without a coordinated change.
- Rows must use stable IDs or a documented composite key.
- Dates and amounts must follow one format.
- Example/draft rows must be explicitly identified.
- Invalid rows must be excluded and surfaced.
- The UI must show `last checked`, `source modified`, and `data as of` where available.
- If history is required, the Sheet must be append-only or retain dated snapshots.

Without persistent storage, a temporarily unavailable source can only be covered by the hosting/cache retention that is selected later. The dashboard must never replace a valid previous view with silently incomplete values.

## 11. Decisions required before architecture planning

### 11.1 Scope decisions

1. Approve the reliable Core V1 scope in section 4.
2. Confirm that blocked Conditional modules may appear only as disabled/not-ready states, or remove them from V1 navigation entirely.
3. Approve adding an Operations page because the deliverable requires it and the demo lacks it.
4. Confirm that Klaviyo panels show a truthful no-data/integration-not-verified state until events/reports populate.
5. Confirm that Financial and Growth analytics remain Conditional rather than showing targets as actuals.

### 11.2 Metric decisions

6. Approve a canonical Shopify revenue/order/AOV/refund policy.
7. Approve product mix basis: net sales, gross sales, or units.
8. Approve refund recognition by Shopify reporting event date or original order date.
9. Approve `Unclassified` handling for native channels/referrers that cannot be mapped.
10. Approve the source and formula for new/returning customer metrics.
11. Approve alert thresholds before any red/amber/green status is shown.

### 11.3 History and source decisions

12. Choose Shopify detailed-history path: `read_all_orders`, controlled export, or accept aggregate-only history for Core V1.
13. Verify that the connected Klaviyo account is the intended production account and confirm Shopify integration/sync status in Klaviyo.
14. Confirm the supplied Corrected Model file ID as the only Budget source.
15. Confirm whether PO 2001 is real/current or an example.
16. Resolve the 42%/70% cost conflict and approve effective-dated costs.
17. Approve a mapping between Shopify variants/packs and the five planned bar SKUs.
18. Select the authoritative CRM/pipeline source for each future Growth module.
19. Confirm whether Sheets preserve historical rows or overwrite current values.

### 11.4 Security and operational decisions

20. Choose basic access protection or explicitly accept a public internal dashboard URL.
21. Approve the maximum acceptable data staleness for Shopify, Klaviyo, Budget, and S&OP.
22. Confirm that the team will keep production file IDs/tab names/required columns stable.
23. Confirm that no customer contact details or other PII should appear in dashboard APIs, exports, logs, or charts.

## 12. Access and files still required

| Item | Why needed | Current urgency |
|---|---|---|
| Final standalone demo URL/source export if earlier hosted demo is unavailable | Precise visual/component audit | Before frontend architecture |
| Confirmation of Shopify detailed-history choice | Cohorts, LTV, drill-down completeness | Before final V1 scope |
| Klaviyo integration/sync confirmation | Determine whether marketing data will populate | Before Marketing scope approval |
| Approved revenue/order policy | Prevent contradictory KPIs | Before architecture |
| Channel mapping input | Requested business channels | Before channel reporting |
| SKU/pack mapping | Plan-versus-actual and inventory | Before Budget/S&OP integration |
| Effective cost decision | Margin and inventory value | Before those modules activate |
| Real S&OP inputs | Inventory/FEFO/forecast/reorder/production | Only if Conditional modules must activate |
| Actual finance source | Expense, burn, runway | Only if Financial Intelligence must activate |
| Social/ad/affiliate exports or access | CAC, ROAS, social, affiliate analytics | Only if those metrics must activate |

Secrets and tokens are not required until architecture is approved and connector implementation is about to begin. They must never be pasted into documentation or committed files.

## 13. Prerequisites before coding

### Scope and design

- [ ] Core V1 page/component list approved.
- [ ] Conditional modules accepted as disabled/not-ready or removed.
- [ ] Operations page design treatment approved.
- [ ] Approved demo is still accessible for exact visual audit.
- [ ] No unsupported demo number remains labelled as live production data.

### Metrics

- [ ] Revenue/order/AOV/refund policy approved.
- [ ] Customer metric definitions approved.
- [ ] Product mix basis approved.
- [ ] Channel mapping and `Unclassified` behavior approved.
- [ ] Alert thresholds and comparison periods approved.
- [ ] Plan, forecast, actual, and attributed values have distinct labels.

### Sources

- [ ] Least-privilege read-only Shopify app path approved.
- [ ] Shopify detailed-history path decided.
- [ ] Klaviyo production account and sync verified.
- [ ] Corrected Budget file ID locked as the source.
- [ ] S&OP example/broken/blank data treatment approved.
- [ ] SKU mapping and cost conflicts resolved for any cost/plan feature.
- [ ] Growth source authority decided for any activated Growth module.
- [ ] Source schemas/file IDs/tab names documented and frozen for implementation.

### Data quality and operation

- [ ] Refresh/staleness targets approved by source.
- [ ] Sheet required columns, types, keys, and invalid-row behavior approved.
- [ ] Historical preservation policy approved for mutable Sheets.
- [ ] Source-unavailable and stale-data behavior approved.
- [ ] PII exclusion policy approved.

### Technical decisions deferred until architecture

- [ ] Hosting selected.
- [ ] Platform-level access protection selected or public-risk acceptance recorded.
- [ ] Server-side cache selected and provider quotas verified.
- [ ] No-database proof criteria approved.
- [ ] Database revisit triggers accepted.
- [ ] Secret-management method selected.
- [ ] Monitoring/error-reporting approach selected.

## 14. Recommended approval statement

ZACAO can approve the next planning gate with language equivalent to:

> We approve the Shopify-centered Core V1 scope documented in this feasibility report. Unsupported Conditional modules must remain disabled, hidden, or explicitly marked not ready and may not display mock production values. We approve a no-primary-database V1 direction subject to the documented constraints and revisit triggers. We will resolve the listed metric, history, source, and security decisions before the final architecture and implementation plan is approved. This approval authorizes architecture planning only, not coding.

## 15. Next sequential step

After ZACAO answers and approves the decisions in section 11:

1. Freeze the final Core/Conditional V1 scope.
2. Freeze metric definitions and source mappings.
3. Perform the exact visual/component audit against the approved demo.
4. Create the new technical architecture and implementation plan, using the approved no-database constraint unless a documented revisit trigger is proven.
5. Submit that plan for review.
6. Begin coding only after a separate explicit approval.

