# ZACAO Dashboard V1 Requirements and Metric Register

Status: Requirements research — approval required before source audits are certified  
Implementation status: No coding or architecture is authorized by this document

## 1. Source hierarchy for this restart

The following precedence prevents older decisions from silently controlling the restarted project:

1. The user's current confirmed decisions in the restarted planning conversation.
2. `ZACAO_V1_Deliverable_and_Data_Plan.docx` for the proposed V1 business scope.
3. The approved live dashboard demo for visual hierarchy and component intent.
4. The two supplied Budget and S&OP workbooks as candidate data sources.
5. Earlier plans and existing repository code are historical only and are not approved architecture.

The deliverables document's architecture, authentication, database, owner-sign-off, deadline, and implementation-sequence statements are not automatically approved. They must be reassessed under the restart instructions.

## 2. Confirmed product requirements

| Requirement | Status | Confirmed decision |
|---|---|---|
| Product | Confirmed | ZACAO Executive Intelligence Dashboard |
| Purpose | Confirmed | Give ZACAO's internal team a reliable view of business performance and data readiness for executive decisions. |
| Users | Confirmed | ZACAO internal team |
| Access model | Confirmed | No user login authentication in V1 |
| Source-system behavior | Confirmed | Dashboard is read-only with respect to Shopify, Klaviyo, Google Drive, Google Sheets, Budget, and S&OP. |
| Reporting timezone | Confirmed | `America/New_York`; implementation must permit a later configuration change. |
| Reporting currency | Confirmed | USD only |
| Default reporting period | Confirmed | Rolling last 12 months |
| Historical audit | Confirmed | Inspect all history genuinely accessible from each source. |
| Visual contract | Confirmed | Follow the approved live dashboard's visual design. Mock values in the demo are not requirements or production facts. |
| Brand source | Confirmed | The approved demo already reflects the Brand Book; the demo is the immediate frontend styling reference. |
| Manual sources | Confirmed | ZACAO's internal team maintains the supplied sheets/workbooks. The dashboard shows newly available valid data after refresh. |
| Data rule | Confirmed | No metric may be presented as real unless its source, required fields, completeness, and calculation have been verified. |
| Current phase | Confirmed | Requirements and data feasibility only; no architecture plan and no code. |

## 3. Decisions that are not yet confirmed

| Decision | Status | Why it matters |
|---|---|---|
| Exact definition of every revenue metric and AOV | Requires clarification | Shopify offers several sales definitions; inconsistent choices produce different totals. |
| Qualifying order statuses, test orders, cancellations, and refund date treatment | Requires clarification | These rules affect revenue, orders, customer metrics, and reconciliation. |
| Channel-classification rules | Requires clarification | Shopify does not currently expose every requested business channel as a clean source value. |
| Customer identity and guest-order rules | Requires clarification | Required for repeat rate, cohorts, RFM, and LTV. |
| Required detailed-history start date beyond the default rolling 12 months | Requires clarification | Determines whether `read_all_orders` or a controlled export is needed. |
| Metric comparison behavior | Requires clarification | Previous period, prior year, target, forecast, and budget are not interchangeable. |
| Alert thresholds | Requires clarification | Low inventory, stockout, conversion decline, refunds, and fulfillment alerts cannot use invented thresholds. |
| Sheet freshness expectations | Requires clarification | Sheets may update ad hoc, but the UI still needs a transparent stale/data-as-of policy. |
| Export format | Requires clarification | The demo has Export actions, but CSV, XLSX, PDF, and image outputs have different data requirements. |
| Separate Operations page | Requires clarification | The deliverables document requires it; the approved demo has no Operations navigation item. |
| Revenue forecast in Core V1 | Requires clarification | The demo shows a month-end forecast while the deliverables document postpones advanced forecasting and treats forecast inputs as conditional. |
| Basic access protection | Requires clarification | User authentication is excluded, but an internal financial dashboard may still require a shared-password or network restriction. |
| Data persistence/database | Requires verification | Authentication does not require a database, but history, cross-source joins, caching, resilience, and sheet snapshots may. This will be decided after the audits. |

## 4. V1 scope classification

### 4.1 Core V1 candidate pages

These pages are required by the deliverables document, subject to the fresh source audit:

| Page | Requirement status | Intended V1 outcome | Current conflict or limitation |
|---|---|---|---|
| Executive Health | Confirmed candidate | Executive summary of certified Core metrics and data status | Demo brief and priority cards currently mix Core and Conditional signals. |
| Revenue Intelligence | Confirmed candidate | Shopify sales, orders, products, discounts, refunds, and verified channel reporting | Revenue target, forecast, and some channel rows need manual or additional sources. |
| Customer Intelligence | Confirmed candidate with history limits | New/returning customers, geography, and basic repeat behavior | Demo funnel uses GA4; cohorts, LTV, RFM, and risk require history and definitions. |
| Product Intelligence | Confirmed candidate | Product/SKU sales, units, mix, Shopify inventory, price/status, and cost completeness | Demo inventory runway, value, and sell-through need inventory/cost definitions and full locations. |
| Marketing Intelligence | Confirmed candidate for Shopify + Klaviyo | Shopify web funnel where available and Klaviyo email/SMS/campaign/flow analytics | Most demo cards use GA4, Meta Ads, Google Ads, and content attribution not yet supplied. |
| Operations Intelligence | Confirmed candidate in deliverables document | Fulfillment and current Shopify inventory; expanded operations only when source-ready | Missing from approved demo navigation; placement requires confirmation. |
| Insights and Data Quality | Confirmed candidate | Deterministic alerts, source freshness, completeness, limitations, and validation status | Assign-action workflow conflicts with a read-only display dashboard. |

### 4.2 Conditional V1 candidate pages/modules

These may be delivered only if the corresponding source audit passes. Until then, they must show an honest unavailable/partial state or remain hidden.

| Page/module | Required sources |
|---|---|
| Expanded Operations | S&OP, SNAPL/YBYD inventory, lots, forecast, production, incoming units, lead times, additional depletions |
| Inventory Runway & Reorder Alert | Complete inventory, Shopify SKU velocity, incoming production, lead times, and approved safety rules |
| Growth Intelligence | Affiliate/ambassador, collaboration, retail, partnership, investor, grant, and sponsorship trackers |
| Financial Intelligence | Approved Budget version, actual finance, cash position, COGS, payroll/expense data, and reconciliation rules |
| Paid marketing efficiency | Meta Ads, Google Ads, other paid spend, GA4, and attribution policy |
| Social performance | Platform exports/connectors or a maintained Social Metrics table |

### 4.3 Explicitly outside V1

- AI-generated recommendations.
- Predictive churn or repeat-purchase models.
- Advanced demand forecasting and seasonality models.
- Model-generated pipeline probability.
- Future ROAS, profit, and cash-flow prediction.
- Automated cross-platform social listening.
- Detailed BOM, capacity, yield, wastage, warehouse-cost, and fulfillment-cost models.
- Variable production-run cost-layer accounting.
- New demographic collection systems.
- Full automation of every manual tracker.
- A dashboard data-entry or record-management application.
- User-account authentication and role management.

## 5. Global interface requirements

| Component or behavior | Demo evidence | Requirement status | Clarification/control |
|---|---|---|---|
| Sidebar section navigation | Present | Confirmed visual contract | Operations destination is unresolved. |
| Dashboard search | Present | Requires clarification | Define searchable objects; do not include merely decorative search. |
| Date selector | 30 days, 90 days, YTD, 12 months | Confirmed component | Default must change from demo's 90 days to rolling 12 months. |
| Comparison period | Required by deliverables document | Confirmed candidate | Exact prior-period/prior-year logic needs approval. |
| Channel filter | Required by deliverables document; absent in demo | Confirmed candidate | Show only where source supports classification. |
| Product/SKU filter | Required by deliverables document; absent in demo | Confirmed candidate | Must use stable Shopify IDs/SKUs. |
| Location filter | Required by deliverables document; absent in demo | Confirmed candidate | Must not imply YBYD exists in Shopify unless verified. |
| Export | Present | Confirmed candidate | Output format and scope require clarification. |
| Notifications | Present | Requires clarification | Read-only notification display is possible; delivery channel is unconfirmed. |
| User profile/Administrator control | Present | Conflicts with no-auth V1 | Remove, make non-interactive, or replace with an internal-workspace label. |
| Metric source label | Present on analytical cards | Confirmed | Must reflect audited source, not demo wording. |
| Last refreshed/freshness | Required by deliverables document | Confirmed | Show per source/component. |
| Loading, empty, partial, stale, unavailable, error | Required by deliverables document | Confirmed | Must be defined before implementation. |
| Drill-down | Required by deliverables document | Confirmed candidate | Exact destinations and fields require metric-level definition. |
| Assign action | Present in Insights | Out of current read-only V1 | Requires a write workflow and is not currently authorized. |

## 6. Metric and component register

Statuses in this register describe requirement/source readiness before the fresh audits:

- **Confirmed**: required by the current decisions or V1 document.
- **Requires verification**: expected source exists, but the restarted audit has not yet proven fields, access, history, and completeness.
- **Conditional**: only activated when additional data and rules pass validation.
- **Conflict**: the demo, deliverables document, or current decisions disagree.
- **Out of V1**: explicitly postponed or incompatible with the read-only scope.

### 6.1 Executive Health

| Component | Required data | Candidate source | V1 classification | Current status |
|---|---|---|---|---|
| Net revenue KPI | Gross sales, discounts, returns/refunds, approved policy | Shopify | Core | Requires verification |
| Orders KPI | Qualifying orders and approved status policy | Shopify | Core | Requires verification |
| AOV KPI | Approved numerator and qualifying orders | Shopify | Core | Requires definition and verification |
| Repeat customer rate KPI | Shopify customer classification or approved identity policy | Shopify | Core with history limits | Requires verification |
| Executive brief | Certified metric/alert outputs | Multiple certified sources | Conditional composition | Requires rules; cannot use freeform invented text |
| Revenue momentum vs target | Net revenue plus approved targets | Shopify + Budget/Targets | Conditional | Requires verification |
| Business health score | Six signals, weights, normalization, thresholds | Multiple sources | Conditional | Requires definition; absent from Core metric matrix |
| Sales by channel | Net sales and verified channel mapping | Shopify + mapping table | Core only for verified channels | Requires verification |
| Decision priorities | Certified deterministic alerts | Multiple sources | Mixed Core/Conditional | Requires alert rules |

### 6.2 Revenue Intelligence

| Component | Required data | Candidate source | V1 classification | Current status |
|---|---|---|---|---|
| Gross sales | Shopify canonical sales output | Shopify Analytics/ShopifyQL | Core | Requires verification |
| Discounts | Discount amounts and sign convention | Shopify | Core | Requires verification |
| Returns/refunds | Return/refund amounts and recognition date | Shopify | Core | Requires definition and verification |
| Net sales | Approved Shopify definition | Shopify Analytics/ShopifyQL | Core | Requires verification |
| Shipping | Shipping charges | Shopify | Core | Requires verification |
| Taxes | Tax amounts | Shopify | Core | Requires verification |
| Total sales | Approved Shopify total-sales definition | Shopify Analytics/ShopifyQL | Core | Requires verification |
| Orders | Qualifying order count | Shopify | Core | Requires definition and verification |
| AOV | Approved sales basis divided by qualifying orders | Shopify | Core | Requires definition and verification |
| Sales trend | Certified sales by day/week/month | Shopify | Core | Requires verification |
| Sales/units by product or SKU | Order line items and product/variant identifiers | Shopify | Core | Requires verification |
| Revenue vs target | Actual revenue plus approved target series | Shopify + Budget/Metric Targets | Conditional | Requires source audit |
| Month-end revenue forecast | Historical actuals plus approved forecast method/inputs | Shopify + forecast input | Conflict | Clarify simple plan forecast versus V2 predictive forecast |
| Revenue by channel | Order source, tags, UTMs/codes, approved mapping | Shopify + mapping input | Core for verified mappings | Requires verification |
| Revenue waterfall | Prior/current totals and decomposable new/repeat/discount/refund effects | Shopify | Conditional derived | Requires exact decomposition definition |
| Best purchase windows heatmap | Order timestamps normalized to reporting timezone | Shopify | Core derived | Requires detailed-order history verification |

### 6.3 Customer Intelligence

| Component | Required data | Candidate source | V1 classification | Current status |
|---|---|---|---|---|
| New customers | Shopify customer classification | Shopify | Core | Requires verification |
| Returning customers/rate | Shopify customer classification | Shopify | Core | Requires verification |
| Customer geography | Shipping/customer region with approved grouping | Shopify | Core | Requires verification and PII-safe aggregation |
| Basic repeat behavior | Complete customer-order linkage | Shopify | Core with history limits | Requires history verification |
| Active customers (purchased in 12 months) | Customer-order history | Shopify | Conditional on detailed history | Requires verification |
| Acquisition funnel | Sessions, product views, cart, checkout, purchase | Shopify Analytics and/or GA4 | Conflict | Demo says GA4; deliverables says Shopify funnel. Audit both. |
| Cohort heatmap | First-order date and subsequent orders per customer | Shopify | Conditional on backfill | Requires detailed history |
| Realized CLV trend | Customer revenue or contribution history | Shopify + optional approved costs | Conditional | Requires definition and backfill |
| RFM customer mix | Recency, frequency, monetary rules and history | Shopify | Conditional derived | Requires rules and backfill |
| At-risk customers | Approved deterministic lapse/value rules | Shopify/Klaviyo | Conditional | Predictive churn is out of V1 |

### 6.4 Product Intelligence

| Component | Required data | Candidate source | V1 classification | Current status |
|---|---|---|---|---|
| Units sold | Order-line quantities and approved inclusion policy | Shopify | Core | Requires verification |
| Sales by product/variant/SKU | Line-item sales, product, variant, SKU | Shopify | Core | Requires verification |
| Product mix | Certified sales or units grouped by product | Shopify | Core derived | Requires basis definition |
| Product price/status | Product and variant fields | Shopify | Core | Requires verification |
| Shopify inventory by location | Inventory quantities and location IDs | Shopify | Core for populated locations | Requires verification |
| Cost completeness warning | Active/sold SKUs and cost presence | Shopify plus approved cost input | Core data-quality control | Requires verification |
| Sell-through rate | Opening/received/sold/on-hand units over defined period | Shopify/S&OP | Conditional | Demo formula `units sold / available units` requires correction/approval. |
| Inventory value | Quantity multiplied by approved effective unit cost | Shopify + COGS table | Conditional | Requires cost version and valuation policy |
| Inventory risk/days of cover | Complete inventory and approved sales-velocity window | Shopify + S&OP | Conditional | Requires full SNAPL/YBYD and rules |
| Stockout/reorder date | Days of cover, lead time, safety buffer, incoming units | S&OP + Shopify | Conditional | Requires complete planning data |
| Portfolio matrix | Revenue contribution, unit growth, bubble basis | Shopify | Core derived candidate | Requires quadrant and growth definitions |
| Frequently bought together | Complete order-level product pairs | Shopify | Conditional on detailed history | Requires support/confidence definitions |
| Units-sold velocity trend | Line-item units by period | Shopify | Core | Requires verification |

### 6.5 Operations Intelligence

| Component | Required data | Candidate source | V1 classification | Current status |
|---|---|---|---|---|
| Fulfilled/unfulfilled counts | Fulfillment status/events | Shopify | Core | Requires verification |
| Shipped/delivered counts | Fulfillment and carrier events | Shopify | Core where captured | Requires event-completeness verification |
| Current Shopify inventory | Inventory levels by represented location | Shopify | Core limited | Requires verification |
| Combined SNAPL/YBYD inventory | Location/SKU snapshots | S&OP/warehouse input | Conditional | Requires workbook audit |
| Lots, best-by, FEFO | Lot receipts, remaining units, best-by, depletion/shipment links | S&OP | Conditional | Requires workbook audit |
| Forecast vs actual | Forecast version by week/channel/SKU plus Shopify actuals | S&OP + Shopify | Conditional | Requires workbook audit and channel mapping |
| Production timeline/incoming units | POs, production runs, dates, status, quantities | S&OP | Conditional | Requires workbook audit |
| Production costs/payment dates | Approved costs, freight, deposits, balances | Budget/S&OP | Conditional | Requires workbook reconciliation |
| Additional depletions | Non-revenue movement records | S&OP/manual table | Conditional | Requires source confirmation |
| Page placement | All Operations components | Approved demo | Conflict | Deliverables require page; demo has no Operations page. |

### 6.6 Marketing Intelligence

| Component | Required data | Candidate source | V1 classification | Current status |
|---|---|---|---|---|
| Email sends/delivery/open/click/bounce/unsubscribe | Klaviyo message/event/report metrics | Klaviyo | Core | Requires fresh endpoint/metric audit |
| SMS engagement | Klaviyo SMS reporting metrics | Klaviyo | Core | Requires fresh endpoint/metric audit |
| Campaign results | Campaign report and attribution outputs | Klaviyo | Core | Requires fresh audit |
| Flow results | Flow report and attribution outputs | Klaviyo | Core | Requires fresh audit |
| Klaviyo-attributed revenue/share | Klaviyo attribution output plus company revenue | Klaviyo + Shopify | Core derived candidate | Requires attribution label and reconciliation rules |
| Shopify web funnel | Sessions, cart, checkout, conversion | Shopify Analytics | Core if accessible | Requires verification |
| GA4 ecommerce funnel | GA4 events and purchase reconciliation | GA4 + Shopify | Conditional | GA4 access not supplied |
| Marketing revenue | Platform-attributed revenue | Klaviyo/ads/GA4 | Conditional composite | Requires attribution scope; cannot be total company revenue |
| Blended ROAS | Paid attributed revenue divided by paid spend | Ad platforms + attribution | Conditional | Missing source access |
| Blended CAC | Approved acquisition spend divided by approved new customers | Ad platforms + Shopify | Conditional | Missing source access and policy |
| Performance by channel | Revenue, spend, and ROAS by source | Klaviyo, Meta, Google, GA4 | Conditional | Missing ad/GA4 access |
| Content that converts | Content tags, assisted revenue, attribution | GA4/ad platforms | Conditional or V2 | Missing tracking/access |

### 6.7 Growth Intelligence

All demo Growth components are Conditional V1 because they depend on maintained manual systems not yet audited.

| Component | Required data | Candidate source | Current status |
|---|---|---|---|
| Open pipeline | Opportunity values and open statuses | Growth/CRM tracker | Requires verification |
| Weighted pipeline | Values and approved manual stage probabilities | Growth/CRM tracker | Requires verification |
| Retail opportunities | Opportunity records and stages | Retail tracker/CRM | Requires verification |
| Active ambassadors | Ambassador IDs and approved/active status | Ambassador tracker | Requires verification |
| Opportunity funnel | Stage counts and values | Growth/CRM tracker | Requires verification |
| Pipeline by category | Pipeline type and weighted value | Growth/CRM tracker | Requires verification |
| Ambassador momentum | Applications, approvals, active dates | Ambassador/application tracker | Requires verification |
| Highest-value follow-ups | Value, probability, last activity, next-action date | Growth/CRM tracker | Requires verification |

Model-generated probabilities are outside V1. A manually maintained probability is permitted only when clearly labeled manual.

### 6.8 Financial Intelligence

All demo Financial components are Conditional V1 because Shopify does not contain complete expenses, cash, payroll, liabilities, or actual cost data.

| Component | Required data | Candidate source | Current status |
|---|---|---|---|
| Gross revenue | Approved Shopify sales basis | Shopify | Requires definition/verification |
| Contribution margin | Net sales and approved variable cost scope | Shopify + COGS/finance | Requires verification |
| Monthly burn | Actual cash/expense records and approved burn policy | Finance source | Missing or requires verification |
| Cash runway | Confirmed cash and approved trailing/projected burn | Finance source | Missing or requires verification |
| Revenue/expense/contribution trend | Actual revenue, expense, payroll, COGS | Shopify + finance | Requires verification |
| Runway outlook | Cash and trailing burn | Finance source | Requires verification |
| Scenario forecast | Approved scenario assumptions and actuals | Budget + finance | Conditional; predictive cash flow remains out of V1 |
| Expense composition | Actual chart-of-accounts values | Accounting/Finance Actuals | Missing or requires verification |
| Budget vs actual | One budget version and corresponding actuals | Budget + Shopify/finance | Requires verification |

### 6.9 Insights and Data Quality

| Component | Required data | Candidate source | V1 classification | Current status |
|---|---|---|---|---|
| Source freshness/staleness | Last successful read and data-as-of timestamp | Every source | Core | Confirmed requirement |
| Validation matrix | Metric/source/field/readiness register | Audit output | Core | Confirmed requirement |
| Missing SKU cost | Active/sold SKU and effective cost records | Shopify + cost source | Core data-quality alert | Requires verification |
| Unclassified channel | Orders failing approved mapping | Shopify + mapping rules | Core data-quality alert | Requires verification |
| Low Shopify inventory | Shopify available quantity and approved threshold | Shopify | Core if threshold approved | Requires definition |
| Conversion decline | Equivalent-period conversion and approved threshold | Shopify/GA4 | Core or Conditional by source | Requires definition |
| Return/refund increase | Refund rate and threshold | Shopify | Core | Requires definition |
| Fulfillment backlog | Unfulfilled order age/count and threshold | Shopify | Core | Requires definition |
| Lot expiry/stockout/forecast alerts | Operational inputs and rules | S&OP + Shopify | Conditional | Requires verification |
| Ranked priority actions | Certified deterministic alerts and ranking rules | Multiple sources | Conditional composition | Requires rules |
| Assign action | Action state, assignee, writes, audit history | New write system | Out of current V1 | Conflicts with read-only scope |
| AI recommendations | Predictive/generative system | Future | Out of V1 | Explicitly deferred |

## 7. Required source audits

### Shopify

The fresh audit must prove access, exact GraphQL/analytics fields, historical coverage, and data quality for:

- Shop configuration, currency, timezone, plan/scopes where discoverable.
- Orders, financial status, cancellations, test orders, refunds, returns, discounts, shipping, taxes, and transactions.
- Order line items, products, variants, SKUs, prices, costs, and status.
- Customers, guest orders, first/last order attributes, and addresses at aggregated geography level.
- Inventory items, quantity names, inventory levels, and locations.
- Fulfillments, shipment status, tracking/delivery events, and timestamps.
- Sales channels, source names, app/channel information, tags, discount codes, referrers, and attribution completeness.
- Shopify Analytics/ShopifyQL access for sessions, funnel, conversion, customer classification, and historical aggregates.
- Detailed-order history limits and `read_all_orders` or export alternatives.

### Klaviyo

The fresh audit must prove endpoint/field availability, account timezone, history, rate limits, and attribution for:

- Account metadata and timezone.
- Metrics and metric IDs.
- Campaigns, messages, reports, and attribution.
- Flows, actions/messages, reports, and attribution.
- Email and SMS sends, deliveries, opens, clicks, bounces/failures, unsubscribes, and spam complaints.
- Placed Order, Ordered Product, Checkout Started, Fulfilled Order, Refunded Order, and Cancelled Order metrics.
- Profiles/lists/segments only where an approved aggregate metric requires them.
- Reporting API versus metric-aggregate API requirements.
- History/retention and API permission limitations.

### Google Drive, Budget, and S&OP

The audit must cover the supplied files and search Drive for other candidate sources:

- `Zacao_12Month_Budget_v5_5SKUs - Corrected Model` — native Google Sheet.
- `Zacao_SOP_Tool.xlsx` — Excel file stored in Drive.
- Inventory, lots, production, marketing spend, social, affiliate/ambassador, collaborations, growth pipeline, grants, sponsorship, and finance trackers.

For every file/tab, record purpose, data fields, formula health, examples/placeholders, unique keys, history, last modification, conflicts, and integration readiness. The audit is read-only; no Sheet or workbook will be created or changed.

### Additional sources implied by the demo

These are not yet supplied and must not be treated as available:

- Google Analytics 4.
- Meta Ads.
- Google Ads.
- Other paid-media platforms used in V1.
- Accounting or actual-finance system/export.
- Complete CRM/pipeline trackers.

## 8. Google Sheet/workbook operating assumptions to validate

The team may update Sheets ad hoc. That is technically workable if the integration can detect and validate changes. The following remain requirements rather than current facts:

- Stable file ID and tab names.
- Stable header row and required columns.
- One record per row with a stable unique key.
- Consistent ISO dates/timestamps and numeric/currency formats.
- No merged cells, totals, or presentation blocks inside machine-read ranges.
- A data-as-of or updated-at value that reflects the underlying records, not only the file modification time.
- Invalid or incomplete rows must be excluded and reported without erasing the last valid data.
- Formula errors, duplicate records, missing SKUs, and conflicting versions must be surfaced.
- For the Excel S&OP file, formulas and cached values must remain readable after upload, and file replacement behavior must be understood.

No named owner or owner-gated approval is assumed. Where the old document says “owner approval,” the restarted V1 instead requires transparent source status, data-as-of information, validation results, and unresolved-conflict reporting unless ZACAO later assigns an approver.

## 9. Database and authentication boundary

### Confirmed

- V1 does not require user accounts, sessions, roles, or an authentication database.
- The dashboard and integration must never write to Shopify, Klaviyo, or the maintained Google sources.

### Not yet concluded

The absence of login authentication does not by itself prove that no analytical storage is needed. The data audit must determine whether V1 can reliably:

- Combine Shopify, Klaviyo, Budget, S&OP, and other Sheets on every request.
- Preserve historical snapshots when a Sheet overwrites prior values.
- Reconcile source totals and retain the last valid result when a source fails.
- Calculate rolling periods, cohorts, inventory velocity, and cross-source metrics within acceptable latency.
- Respect API rate limits and avoid slow or inconsistent page loads.
- Show freshness and validation history.

The feasibility report will compare:

1. Direct server-side source reads with short-lived caching and no persistent database.
2. A minimal scheduled snapshot/cache store only for the metrics that require history or resilience.
3. A normalized analytical database, only if the verified requirements make it necessary.

No database purchase or implementation is approved at this stage.

## 10. Conflicts requiring scope confirmation

1. **Operations page:** required by the V1 document but absent from the approved demo.
2. **Default date range:** confirmed as rolling 12 months; demo defaults to 90 days.
3. **No authentication:** demo includes an Administrator profile control.
4. **Read-only dashboard:** demo includes an Assign Action button.
5. **Marketing Core scope:** deliverables say Shopify/Klaviyo, while the demo prominently depends on GA4 and paid-ad platforms.
6. **Customer Core scope:** demo includes cohorts, CLV, RFM, and at-risk segments that require history and business definitions.
7. **Product Core scope:** demo includes inventory value, sell-through, days of cover, and stockout risk that are Conditional under the data plan.
8. **Revenue forecasting:** demo shows a forecast; advanced forecasting is explicitly V2 and plan-based forecast inputs are Conditional.
9. **Business health score:** present in the demo, but its weights and inputs are not approved.
10. **Named owner/sign-off requirements:** required by the old document but explicitly unavailable in the restarted project.

## 11. Approval questions for this requirements gate

These questions should be answered before the register is treated as final. They do not block beginning the read-only source audits, but unresolved answers will keep affected metrics unconfirmed.

1. Should Operations become a separate navigation page matching the demo's design system, or should its content live under Product Intelligence?
2. Should the production V1 remove the Administrator/profile control and Assign Action interaction?
3. Are GA4, Meta Ads, and Google Ads intended V1 sources, or should Marketing V1 be limited to Shopify and Klaviyo?
4. Should the month-end revenue forecast be a simple budget/target comparison in Conditional V1, or be removed until V2?
5. Should cohorts, realized CLV, RFM segments, and customer-risk segments remain Conditional until full order history is proven?
6. Which export is required: CSV data, XLSX workbook, PDF report, or more than one?
7. Is any simple access protection required for an internal dashboard containing financial and customer aggregates, despite having no individual login?

## 12. Next sequential step

The next authorized work is the fresh Shopify audit against this register. It must report exact fields/resources, accessible history, permissions, completeness, limitations, and alternatives for every Shopify-backed component. It must not write code or decide architecture.
