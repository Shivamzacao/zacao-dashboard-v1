# ZACAO Dashboard V1 — Budget, S&OP, and Google Drive Data Audit

Status: **Completed read-only audit**  
Audit date: **2026-08-05**  
Dashboard reporting standard: **USD; `America/New_York`**  
Default dashboard period: **rolling 12 months**

## 1. Audit conclusion

The supplied Budget workbook is structurally readable and suitable as a source of **approved plans and assumptions**, but not as a source of actual revenue, actual operating expenses, current cash, or actual runway. The supplied S&OP workbook has a useful planning structure, but its principal operational inputs are currently zero, blank, examples, or placeholders. It cannot yet support certified combined inventory, lot/FEFO, forecast variance, stockout, reorder, production-timeline, or cash-flow analytics.

Google Drive contains several additional spreadsheets that may support Growth Intelligence, including the internal CRM, investor outreach, ambassador applications, collaboration lists, store lists, and grant/fundraising schemas. Most are prospect/contact lists or planning frameworks rather than complete event or performance ledgers. They require purpose-specific validation and stable source selection before activation.

### V1 implication

| Module | Current conclusion |
|---|---|
| Budget/target comparison | **Partially available** — technically possible using the corrected Budget model after target-period and channel/SKU mapping rules are confirmed |
| Planned COGS and planned margin | **Partially available** — model values exist, but do not represent approved actual cost layers |
| Actual gross margin | **Missing/blocked** — incomplete Shopify costs and conflicting planned/PO cost labels |
| Cash runway | **Missing/blocked** — no confirmed current cash balance or actual cash ledger |
| Combined SNAPL/YBYD inventory | **Missing/blocked** — S&OP on-hand values are placeholders; Shopify currently contains only partial location inventory |
| Lot and FEFO analytics | **Missing/blocked** — no real lot ledger or shipment/depletion linkage |
| Forecast versus actual | **Missing/blocked** — forecast and actual input fields are unpopulated |
| Inventory runway and reorder alert | **Missing/blocked** — requires complete inventory, velocity rules, lead times, incoming stock, and safety rules |
| Production timeline and cash exposure | **Partially available but unreliable** — one PO exists, schedule formulas are broken, and payment/freight assumptions are incomplete |
| Growth pipelines | **Partially available** — candidate CRM/tracker data exists, but source selection, field completeness, and metric rules are not yet approved |
| Social/affiliate performance | **Missing/blocked** — planning documents exist, but no verified recurring performance ledger was found |

No source was modified during this audit.

## 2. Sources inspected

### 2.1 Supplied sources

| Source | Drive type | File ID | Last modified | Audit role |
|---|---|---|---|---|
| [Zacao 12-Month Budget V5 — Corrected Model](https://docs.google.com/spreadsheets/d/1ccm6JvpLYmKSWoatG0UOiDAKe4XF1_-ZBZ18WwMcTzE/edit) | Native Google Sheet | `1ccm6JvpLYmKSWoatG0UOiDAKe4XF1_-ZBZ18WwMcTzE` | 2026-08-03 | Planned revenue, cost, overhead, channel, scenario, freight, and SKU assumptions |
| [Zacao S&OP Tool](https://docs.google.com/spreadsheets/d/1LIVRpc72FOLi_cYcFHbqkc_liF495jxs/edit) | Excel `.xlsx` stored in Drive | `1LIVRpc72FOLi_cYcFHbqkc_liF495jxs` | 2026-07-31 | Inventory, lots, forecast, production, BOM, and projected cash planning |

The Budget workbook uses `America/Los_Angeles`; the dashboard requirement is `America/New_York`. The S&OP file is an Excel file, not a native Google Sheet. Both differences must be handled explicitly.

### 2.2 Additional candidate sources found in Drive

| Candidate source | Relevant content | Preliminary status |
|---|---|---|
| [Zacao CRM (INTERNAL)](https://docs.google.com/spreadsheets/d/1khFk1_8BxEamjpUjbdyrbvWYJz6oMGn1p2Dv4qeBvFw/edit) | Ambassadors, collaborations, stores, coffee shops, sales contacts, PR, investors/donors, grants, fundraising, suppliers, customers | **Partially available**; broad CRM with inconsistent completeness and PII; possible Growth source after tab-level approval |
| [ZACAO/NZINGA Investor Reach Out Tracker](https://docs.google.com/spreadsheets/d/1ULs_5feYymZYZUtrHy7JSNjhPWGn9UTO3W0tlNpT1kw/edit) | Annual investor outreach lists and statuses | **Partially available**; multiple year tabs and free-text status history |
| [Campus Ambassador Applicants](https://docs.google.com/spreadsheets/d/1kN5E95vzsNHRbww0_TCJz_OBYg2OnaUumyG1CQ8j7A8/edit) | Applicant identities, handles, preferences, agreement indicator | **Available as application data**, not ambassador performance data |
| [Spotlight Spread Collaborations](https://docs.google.com/spreadsheets/d/1mRp6Rf4AZ-UAiGbw9Rnllh0WUqH3RvJkAN1LNXafUkw/edit) | Proposed brands, hotels, platforms, talent, publications, foundations | **Planning list**, not a maintained stage/value performance pipeline |
| [Zacao Influencer Campaign Strategy](https://docs.google.com/spreadsheets/d/1_-79hJaiUItoM2FERbAaRZ7ZV4maWwdrALtUVqag6Dg/edit) | Influencer targets, audience, approach, campaign ideas, care packages | **Strategy/target list**, not actual performance |
| [Partnership Success Metrics](https://docs.google.com/spreadsheets/d/1pT25-a4z8iANgZ8olTF-CzzEQ9_74TF-li3fRsPp7Bs/edit) | Desired success measures and target concepts | **Definition framework**, not measured results |
| [PR Activity 2026](https://docs.google.com/spreadsheets/d/1L8HICoVvw8NuPlg4_yO95bQe0Bo7un1_QWq5nhY4ZEs/edit) | Outreach, strategy, MarCom overview, influencer/PR gifting recommendations | **Requires detailed validation**; not proven as a normalized performance ledger |
| [Operational Overview](https://docs.google.com/spreadsheets/d/1UWnulHgE2DV6UKwUtH3kn_6wCMKf3d_mlK-mpPIfipE/edit) | Channel responsibilities, qualitative readiness, rough goals | **Planning/operating document**, not actual KPI data |
| [Untitled KPI framework](https://docs.google.com/spreadsheets/d/1mQ-PLeaSMqmnsLihmYnpUfkME3sPINrgp3APNfxs5N0/edit) | Grant, investor, sales/partnership, and marketing KPI definitions/targets | **Definition framework**; title and authority unclear |
| ZACAO Marketing Execution Plan WIP | Execution/automation planning | **Work in progress**, not a verified spend/performance source |

Searches also found archived and duplicate KPI sheets, prior Budget versions, duplicated strategy documents, and files explicitly titled `do not use` or `Archived`. Title search alone is therefore not a safe automatic source-selection method.

## 3. Budget workbook audit

### 3.1 Structure and formula health

| Tab | Primary use | Non-empty cells | Formula cells | Formula errors observed |
|---|---|---:|---:|---:|
| Assumptions | Commercial, channel, overhead, and staffing assumptions | 195 | 19 | 0 |
| COGS | Per-SKU cost model | 51 | 13 | 0 |
| 12-Month P&L | Monthly planned P&L | 408 | 336 | 0 |
| Budget | Monthly budget summary | 141 | 93 | 0 |
| Channel ROI | Channel economics and contribution assumptions | 171 | 109 | 0 |
| AAA Details | Supporting assumptions | 14 | 4 | 0 |
| Seasonal SKU Plan | Planned SKU units and revenue | 301 | 119 | 0 |
| Revenue Scenarios | Scenario planning | 254 | 156 | 0 |
| Freight Analysis | Air/sea freight scenarios | 54 | 12 | 0 |
| SKU Channel Mix | Planned SKU/channel allocation | 461 | 60 | 0 |
| SKU-Channel Detail | Detailed planned SKU/channel calculations | 694 | 546 | 0 |

The selected workbook has no observed spreadsheet formula errors in the audited used ranges. This indicates technical readability, not business approval or actual-data completeness.

### 3.2 Directly usable planned values

The workbook can provide the following **plan/assumption series**, provided they are labelled as plans:

- Monthly planned revenue from June 2026 through May 2027.
- Planned channel mix and planned SKU mix.
- Planned units, selling prices, and revenue by SKU/channel where the model produces them.
- Planned COGS and planned gross margin.
- Planned staffing, marketing, and fixed-overhead assumptions.
- Air- and sea-freight assumptions.
- Revenue scenarios.
- Channel-level gross-margin and contribution assumptions.

Examples of audited assumptions include:

| Assumption | Workbook value | Audit note |
|---|---:|---|
| Retail MSRP per bar | $8.99 | Planned/reference value |
| Wholesale price per bar | $4.50 | Workbook note says confirmation is required |
| Distributor price per bar | $4.55 | Planned/reference value |
| DTC 4-pack price | $36.00 | Planned/reference value |
| DTC 10-pack price | $85.00 | Planned/reference value |
| Average bars per order | 4 | Marked `TBC` in the workbook |
| Current landed COGS per bar | $2.494 | $1.694 production/packaging plus $0.80 air freight |
| Future sea freight per bar | $0.60 | Model assumes a 20,000-unit switch threshold |
| Fulfillment per order | $7.96 | Assumption, not reconciled actual |
| Amazon fee assumptions | $3.00 + 15% referral + $1.00 advertising | Planned economics |
| TikTok fee | 8% | Planned economics |

### 3.3 Planned SKU cost values

| Budget SKU | Base cost per bar before modelled freight |
|---|---:|
| 70% Dark Chocolate with Coconut Sugar | $1.501 |
| 70% Dark Chocolate with Tigernut & Hazelnut | $1.788 |
| 42% Vegan Creamy Cashew with Coconut Sugar | $1.694 |
| Matcha Bar | $2.009 |
| 80% Dark Chocolate with Fleur de Sel | $1.767 |

These five planned SKUs do not match the current Shopify active catalog one-to-one. Shopify currently exposes four active chocolate pack variants across two chocolate products, plus gift cards. A governed SKU/pack conversion table is required before plan-versus-actual SKU reporting.

### 3.4 Budget limitations

1. The workbook is a plan, not an accounting ledger.
2. It does not contain a confirmed current cash balance.
3. It does not contain complete actual cash receipts/payments or actual operating expenses.
4. Its cumulative cash series starts from zero and cannot be called actual runway.
5. Scenario revenues are user-entered and some scenario results exclude staff/marketing costs.
6. Channel ROI uses modelled economics; gross margin and contribution have different cost scopes.
7. The plan horizon is June 2026–May 2027, while the dashboard default is a rolling trailing 12 months. These are not equivalent periods.
8. The workbook timezone differs from the dashboard timezone.
9. Drive contains another Budget V5 titled `Updated Copy`; the supplied corrected-model URL is used for this audit, but automatic file discovery must never switch versions.
10. Several workbook assumptions are explicitly marked for confirmation.

### 3.5 Budget metric feasibility

| Requested metric | Required Budget fields | Status | Limitation/action |
|---|---|---|---|
| Revenue target | Period, planned revenue | Partially available | Use only for overlapping forecast months; label `Plan` |
| Actual vs budget revenue | Budget target + Shopify actual | Partially available | Requires compatible time grain and channel mapping |
| Planned COGS | SKU, planned unit cost, freight basis, period | Partially available | Not actual COGS |
| Planned gross margin | Planned revenue and planned COGS | Partially available | Must not be shown as realized margin |
| Actual gross margin | Actual recognized revenue + effective actual cost per sold unit | Missing | Shopify cost coverage and cost-version policy incomplete |
| Operating budget | Period and planned expense category | Available as plan | No actual comparison source supplied |
| Budget vs actual expenses | Planned and actual expenses | Missing | Requires accounting/actual-finance source |
| Marketing budget | Period and planned spend | Available as plan | No actual ad-spend ledger supplied |
| Cash runway | Current cash + dated actual/forecast cash flows | Missing | Starting cash and actual ledger absent |
| Scenario forecast | Scenario assumptions and outputs | Partially available | Present as management scenario, not prediction |

## 4. S&OP workbook audit

### 4.1 Structure

The Excel workbook contains these sections/tabs:

1. Instructions/open items
2. SKU Master
3. On-Hand Inventory
4. Lot Tracking
5. Production Purchase Orders
6. Production Schedule
7. Sales Forecast
8. Bill of Materials and Per-Bar Costs
9. Cash Flow Assumptions
10. Master Summary — Weekly Inventory Status
11. COGS
12. Forecast Accuracy
13. Cash Flow Calendar

The structure is appropriate for an S&OP process, but most dashboard-driving inputs are not populated.

### 4.2 Explicit open items in the workbook

The workbook itself states that it still needs:

- Actual on-hand inventory quantities.
- Lot codes and best-by dates.
- Weekly sales forecast units and sell price by channel.
- Day-by-day production schedule.
- Co-packing, coconut sugar, matcha, and packaging cost splits.
- Freight-cost basis.
- Customer and supplier payment terms.
- Confirmation of real channel names; current names are placeholders.

### 4.3 Current data condition by tab

| Tab | Current condition | Dashboard status |
|---|---|---|
| SKU Master | Five canonical planned SKU names | Partially available; mapping to Shopify variants is unresolved |
| Inventory On-Hand | One example row plus five real SKU rows with zero quantities at SNAPL; no populated YBYD inventory | Missing/blocked |
| Lot Tracking | Example row plus blank real-SKU rows | Missing/blocked |
| Production POs | PO 2001 with five SKU lines and 1,500 units total | Partially available; operational authenticity and status must be confirmed |
| Production Schedule | Example row only; three `#REF!` date errors; zero cost | Unusable until repaired and populated |
| Sales Forecast | 52-week, 5-SKU, 3-channel framework; forecast units and prices are zero | Missing/blocked |
| BOM Costs | Recipe percentages exist; per-bar cost components are blank/zero; PO reference prices exist | Partially available; cost build-up incomplete |
| Cash Flow Assumptions | Explicitly placeholder; payment/freight terms incomplete | Missing/blocked |
| Master Summary | Formula output driven by zero inputs; separate week-56 scenario block contains values not tied to the main live framework | Not certifiable |
| COGS | Formula output depends on incomplete BOM and schedule | Not certifiable |
| Forecast Accuracy | Forecast is zero; actual sales and actual inventory blank | Missing/blocked |
| Cash Flow Calendar | Starting cash is zero; all projected daily movements are zero | Missing/blocked |

### 4.4 Production PO 2001

The workbook contains PO 2001 dated 2026-07-20, with a due date of 2026-08-07, 300 units for each of five SKUs, 1,500 units total, and a displayed total of $2,301. Freight cost and related due dates are incomplete.

| PO 2001 SKU label | Unit price |
|---|---:|
| 42% Vegan Creamy Cashew | $1.34 |
| 70% Dark Chocolate | $1.52 |
| 80% Fleur de Sel | $1.63 |
| Matcha | $1.54 |
| Tigernut & Hazelnut | $1.64 |

The `Payment Terms` field contains `FOB`, but FOB is a shipping/incoterm concept, not a payment term. Payment dates and freight rules therefore cannot be calculated reliably from the current row.

### 4.5 Material cost conflict

The Budget and S&OP sources conflict for the first two SKU labels:

| SKU | Budget base co-pack/reference value | S&OP PO 2001 value | Finding |
|---|---:|---:|---|
| 70% Dark Chocolate | $1.34 component/reference basis in Budget model | $1.52 | Potential label/value mismatch |
| 42% Vegan Creamy Cashew | $1.52 component/reference basis in Budget model | $1.34 | Potential swapped values |

The other three PO values align more closely with the corresponding planned base values. The dashboard must not choose which source is correct. Actual margin remains blocked until ZACAO confirms the authoritative effective cost by SKU and date.

### 4.6 S&OP metric feasibility

| Requested metric/feature | Required fields | Current status | Missing or invalid input |
|---|---|---|---|
| Inventory by warehouse | Snapshot date, warehouse, SKU, on-hand, committed/allocated, available | Missing | Real SNAPL and YBYD quantities |
| Combined inventory | Complete location snapshots and mapping | Missing | YBYD plus verified SNAPL inventory |
| Lot/best-by visibility | SKU, warehouse, lot, receipt/production date, best-by, remaining quantity | Missing | Real lot records |
| FEFO risk/compliance | Lot balances plus shipment/depletion lot links | Missing | Depletion/fulfilment-to-lot linkage |
| Forecast by SKU/channel | Week, SKU, channel, forecast units, forecast price, version | Missing | All forecast values are zero; channel names are placeholders |
| Actual vs forecast | Approved forecast plus comparable actuals | Missing | Forecast and actual fields |
| Incoming production | PO/run, SKU, quantity, status, expected receipt | Partially available | Only PO 2001; operational status not confirmed |
| Production timeline | Run dates, milestone dates, status, completed/received units | Missing | Production schedule is example-only and broken |
| Production cost/payment dates | Effective unit costs, deposits, balances, freight, payment terms, due dates | Missing | Cost splits, freight basis, real payment terms/dates |
| Days on hand | Available inventory and approved sales velocity | Missing | Inventory plus velocity definition |
| Projected stockout | Inventory, sales velocity/forecast, incoming stock | Missing | All critical inputs incomplete |
| Recommended reorder date | Projected stockout, lead time, safety buffer | Missing | Lead times and safety policy |
| Additional depletions | Date, SKU, location, quantity, reason, reference | Missing | No recurring ledger found |
| Cash runway | Current cash, dated inflows/outflows, approved assumptions | Missing | Starting cash is zero and flows are not populated |

## 5. Additional Drive source audit

### 5.1 Growth CRM and pipeline data

The internal CRM is the strongest candidate manual source for Growth Intelligence, but different tabs have different readiness:

| CRM tab | Relevant fields observed | Readiness |
|---|---|---|
| Ambassador (Grove) | Name, signup status, outreach progress, contact owner, follow-up, last contact, action item, category, deal status | Partial; membership/outreach data, not sales or content performance |
| Brand Collaborations | Priority, company/person, collaboration type, source, follow-up, action, deal status | Partial; many rows have only names and free text |
| List of Stores | Store, address, status, order count, cases, distributor, last order date | Partial; useful retail roster but must be reconciled to order facts |
| Coffee Shops | Same intended structure as store list | Header-only in audited sample |
| Investors/Donors | Company/person, source, follow-up, action, category, deal status | Partial; usable for stage/status counts after controlled status vocabulary |
| Grant Applications (Active) | Grant, funder, focus, amount, deadline, status, owner, link, notes | Header-only in audited sample |
| Fundraising (Active) | Item/round, target amount, type, status, owner, target close, notes | Header-only in audited sample |

The separate investor tracker contains multi-year lists and free-text statuses. It overlaps with the internal CRM. One must be selected as the reporting source; values cannot be merged automatically without stable record IDs and deduplication rules.

### 5.2 Ambassador and affiliate data

The Campus Ambassador Applicants sheet contains application data and personal contact information. It can support counts such as applications received or agreed-to-terms, but it does not contain:

- Assigned affiliate/discount code.
- Attributed orders or revenue.
- Content/posts delivered.
- Impressions, reach, engagement, or clicks.
- Commission earned or payout status.
- Campaign dates or conversion outcomes.

No verified ShopMy performance export or affiliate transaction ledger was found. Affiliate/ambassador revenue and performance therefore remain blocked.

### 5.3 Collaboration and partnership data

The collaboration and influencer sheets are strategy/target lists. The partnership success sheet defines desired outcomes but does not record measured results. To support the V1 collaboration/partnership pipeline, a maintained table must contain at least:

`record_id`, `partner`, `pipeline_type`, `stage`, `status`, `estimated_value_usd`, `probability_if_manually_assigned`, `created_date`, `last_activity_date`, `next_action`, `next_action_date`, `closed_date`, `actual_revenue_usd`, `source_reference`

Predictive probability is outside V1. If probability is used, it must be a manually approved stage rule or manually entered value.

### 5.4 Grants and fundraising

Drive contains a KPI framework and CRM schemas for grants/fundraising. The active CRM tabs were header-only in the audited sample. The KPI framework defines targets, not applications or awards. Reliable reporting needs record-level data for each application/round.

Required fields include:

`record_id`, `program_or_round`, `funder_or_investor`, `submitted_date`, `deadline`, `stage`, `status`, `requested_amount_usd`, `committed_amount_usd`, `awarded_amount_usd`, `decision_date`, `next_action`, `next_action_date`, `source_link`

### 5.5 Social and marketing spend

Drive contains marketing strategies, process documents, roadmaps, and execution plans. These define intended activity but do not prove a recurring ledger of actual platform performance or actual paid spend. No verified source was found for:

- Daily platform spend.
- Campaign/ad-set/ad identifiers.
- Impressions, reach, clicks, or conversions by platform.
- Follower history by day/week.
- Post/content performance history.
- Attributed revenue reconciled to Shopify.

These metrics require direct Meta/Google/TikTok/Metricool access or governed exports/sheets with stable schemas.

## 6. Duplicate and conflict risks

1. Multiple Budget versions exist in Drive. The user-supplied `Corrected Model` file is the audited source; automatic title search is prohibited.
2. The internal CRM and separate investor tracker overlap.
3. Archived and current KPI review sheets share nearly identical titles.
4. Strategy documents and operational ledgers are mixed in broad Drive search results.
5. Some files are explicitly marked archived, WIP, `do not use`, or are untitled.
6. S&OP planned SKUs differ from the current Shopify catalog/pack structure.
7. S&OP and Budget conflict on at least two SKU cost labels/values.
8. S&OP channels are placeholders and differ from Shopify native source names and the requested dashboard taxonomy.
9. Workbook reporting periods/timezones differ from dashboard reporting requirements.

The V1 system must use an explicit allowlist of file IDs and tab names. It must not select files from titles or newest-modified timestamps.

## 7. Data quality and maintenance controls required

Direct read-only integration is feasible only if these controls are adopted:

- Fixed file IDs and tab names.
- Documented required columns and types.
- Stable unique record IDs for event/pipeline tables.
- One date format, preferably ISO `YYYY-MM-DD` or timezone-aware ISO timestamps.
- USD numeric amounts stored as numbers, not `$`-formatted text where possible.
- Controlled status/channel/SKU vocabularies.
- No merged cells inside source data tables.
- Example rows removed or explicitly flagged with `is_example = TRUE`.
- Invalid rows excluded and reported rather than silently coerced.
- A `data_as_of` or source-update timestamp shown in the dashboard.
- Append-only snapshots where historical state is required.
- Formula errors and blank required fields surfaced as data-quality issues.
- Previous successfully loaded values retained in cache if a source is temporarily unavailable; stale state must be visible.

## 8. Read-only integration and database implication

### What can work without a database

A no-database V1 is technically possible for a narrow dashboard if it:

- Reads Shopify aggregates and current inventory directly on the server.
- Reads Klaviyo reports directly when the account has data.
- Reads allowlisted Google Sheet ranges or the S&OP Excel export read-only.
- Performs lightweight calculations on the server.
- Uses a server/cache layer to avoid hitting provider APIs on every browser request.
- Accepts that historical snapshots of mutable Sheets will not exist unless the source itself preserves them.

### What authentication does not decide

The absence of user login removes the need for an authentication/user database. It does **not** by itself determine whether analytical storage is useful. Data storage is a separate decision driven by:

- Preserving history when Sheets are overwritten.
- Combining asynchronous sources consistently.
- Retaining last-known-good data during provider failures.
- Reconciliation and auditability.
- Query latency and API rate limits.
- Repeatable calculations across the rolling 12-month view.

### Current provisional recommendation

Do not purchase or provision a database yet. Continue the feasibility process with a **no-database-first** design constraint. Before final architecture approval, run a proof against the final Core V1 source set and choose between:

1. Direct server-side reads plus managed response caching; or
2. A very small dashboard-owned snapshot store only if Sheets/history, reliability, or provider rate limits make direct retrieval inadequate.

This is not an authentication decision and does not require Supabase by default. The final decision belongs in the consolidated feasibility report after the complete metric/source matrix is reconciled.

## 9. Required source updates before conditional modules can activate

### S&OP minimum updates

1. Remove or flag example rows.
2. Enter real SNAPL and YBYD inventory by SKU.
3. Populate lot numbers, best-by dates, and remaining quantities.
4. Populate forecast units and prices by week, SKU, and approved channel.
5. Enter actual sales/inventory or confirm Shopify as the actual source.
6. Replace placeholder channel names with an approved mapping.
7. Populate incoming production and status records.
8. Fix Production Schedule `#REF!` formulas.
9. Populate BOM cost splits and packaging/freight inputs.
10. Replace `FOB` in payment terms with actual payment terms; store incoterms separately.
11. Enter real payment/freight due dates.
12. Confirm the two conflicting SKU costs.

### Growth/marketing minimum updates

1. Select the authoritative CRM/pipeline source for each module.
2. Add stable record IDs.
3. Use controlled stage/status values.
4. Add dated activity, value, and outcome fields.
5. Separate targets from actual results.
6. Supply direct performance exports or approved structured ledgers for social, paid media, ShopMy, affiliate, and ambassador performance.

## 10. Findings requiring confirmation

| Decision | Why required |
|---|---|
| Is PO 2001 real and current? | Determines whether it may be shown as incoming production |
| Which effective cost is correct for the 42% and 70% SKUs? | Budget and S&OP appear to swap values |
| How do five planned bar SKUs map to Shopify products, pack variants, and units? | Required for SKU plan-versus-actual and inventory |
| Which CRM or investor tracker is authoritative? | Duplicate pipelines cannot be merged safely |
| Are S&OP week-56 scenario values real inputs or illustrative? | They conflict with the zero main planning tables |
| May the dashboard use the corrected Budget file as the fixed plan source? | Prevents accidental switch to `Updated Copy` or older versions |
| Will the team preserve Sheet history or overwrite rows? | Determines whether a snapshot store is required for historical analytics |
| What fields define a collaboration, grant, investor, or ambassador as active/closed/successful? | Required for deterministic counts and funnel stages |

## 11. Audit status

- Budget source: **Available as plan/assumption data; not actuals**.
- S&OP source: **Structurally available, operational data mostly missing or invalid**.
- Drive Growth sources: **Partially available; overlapping and not yet certified**.
- Social/paid/affiliate performance ledgers: **Missing**.
- Formula health: Budget healthy in audited ranges; S&OP has three observed `#REF!` errors in Production Schedule.
- Write access used: **No**.
- Database conclusion: **No authentication database required; analytical storage decision deferred to consolidated feasibility evaluation**.

## 12. Next sequential step

Create the consolidated Data Feasibility, V1 Scope Recommendation, Database Decision, and Prerequisites report using:

1. the approved V1 requirements register;
2. the Shopify audit;
3. the Klaviyo audit; and
4. this Budget/S&OP/Drive audit.

No architecture plan or production code is authorized at this stage.
