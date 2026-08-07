# B4.3 TEST and PRODUCTION Workbook Design

## Dynamic input capacity

Physical row count is not part of the approved schema or a data-completeness signal. Each input tab may retain its current native Google Sheets capacity, and ZACAO may add rows when required. Runtime ingestion processes populated records dynamically, ignores empty rows, and does not hardcode row 1,000, row 10,000, or another physical boundary. Newly populated rows must follow the approved schema and preserve applicable validation, dropdowns, and formats. This operational policy does not alter the approved columns, business rules, metrics, scope, architecture, environment separation, or read-only runtime model.

Status: Design complete; awaiting ZACAO approval before B4.4.

Scope: Local design specification only. No workbook, Google Sheet, adapter, or application implementation is created by B4.3.

## Locked workbook pair

| Environment | Workbook name | Records |
|---|---|---|
| Test/staging | `ZACAO Dashboard V1 — TEST` | Synthetic records only; covers valid, empty, invalid, stale, duplicate, and conflicting cases. |
| Production | `ZACAO Dashboard V1 — PRODUCTION` | Same schema and validations; starts with instructions and headers only, with no synthetic business records. |

Both workbooks contain the same `README` plus the same 14 contract-controlled input tabs, in this order:

1. `Mappings`
2. `Inventory`
3. `Inventory_Lots`
4. `Depletions`
5. `Forecast`
6. `Production`
7. `SKU_Costs`
8. `Finance_Actuals`
9. `Cash`
10. `Marketing_Spend`
11. `Social_Metrics`
12. `Partner_Performance`
13. `Growth_Pipeline`
14. `Rules_Targets`

Runtime access is read-only. Production never reads or falls back to the TEST workbook. Budget and S&OP remain separate read-only sources and are not copied or modified.

## Marketing attribution clarification

`Marketing_Spend` supplies spend only. It does not prove acquired customers, attributed revenue, CAC, ROAS, or LTV:CAC.

Before any such metric activates, its contract must identify:

- the exact numerator and denominator;
- whether it is blended company/channel or campaign-attributed;
- the verified source of acquired customers;
- the verified source of attributed revenue; and
- the supported attribution window/policy.

Shopify or Klaviyo attribution is used only where the approved source contract supports it. Campaign attribution is never inferred. An unresolved definition or missing attribution source affects only that metric and does not block spend, campaign-delivery, Klaviyo, or other Marketing Intelligence features.

## Workbook-wide design

- `README` is frozen at the first position; input tabs follow in the order above.
- Row 1 contains exact column headers. Row 1 is frozen and filtered.
- Required headers use a clear required marker in the instruction note, not an extra technical column.
- Dates are true Sheet dates displayed as `yyyy-mm-dd`.
- USD fields are numeric and displayed as `$#,##0.00`.
- Counts use `#,##0`; quantities use `#,##0.00` only where fractional units are allowed.
- Percentages, when present, are numeric decimals displayed as `0.0%`.
- Free-text identifiers are stored as text and are never inferred from row numbers.
- Blank optional cells mean “not supplied,” not zero.
- Input tabs contain no required formulas. Dashboard calculations and cross-source validation occur in application code.
- Invalid rows are excluded from affected calculations and surfaced through source status/data-quality output. Valid unrelated rows continue where the feature permits partial results.
- A duplicate business key is invalid; spreadsheet row order is never used to choose a winner.
- TEST examples below are synthetic. PRODUCTION contains the same headers, formats, notes, and validations but no example records.

## README design

The `README` tab is instructional and is not ingested as business data. It contains these sections:

1. **Workbook identity** — workbook name, environment (`TEST` or `PRODUCTION`), contract version, and explicit “dashboard read-only” statement.
2. **Safety rules** — never paste TEST/mock/example records into PRODUCTION; never rename tabs or required columns; never replace the production file without controlled configuration.
3. **Formatting** — `YYYY-MM-DD`, numeric USD, blank versus zero, and controlled dropdown use.
4. **How updates work** — add rows for append-history datasets; update current-state rows only where explicitly allowed.
5. **Invalid data behavior** — affected rows are rejected and reported; missing required data produces partial or `Data source not ready`; production never falls back to TEST.
6. **Tab directory** — purpose and update method for every input tab.

### README maintenance table

| Tab | Team action | History rule |
|---|---|---|
| `Mappings` | Add a new effective mapping when source meaning changes. | Append effective-dated rows. |
| `Inventory` | Add a dated warehouse/SKU observation. | Append; never replace prior dates. |
| `Inventory_Lots` | Maintain the current row for each warehouse/SKU/lot. | Current state; update the existing lot row. |
| `Depletions` | Add one row for each non-sales depletion. | Append only. |
| `Forecast` | Add a complete new version and mark the prior version `Superseded`. | Append versions. |
| `Production` | Maintain one row per PO line; retain completed/cancelled rows. | Current PO state with retained completed rows. |
| `SKU_Costs` | Add a new effective-dated cost when the approved cost changes. | Append effective periods. |
| `Finance_Actuals` | Add one actual expense row; use a correcting row for corrections. | Append only. |
| `Cash` | Add dated account balances. | Append only. |
| `Marketing_Spend` | Add dated campaign spend records. | Append only. |
| `Social_Metrics` | Add dated account observations. | Append only. |
| `Partner_Performance` | Add one row per partner reporting period. | Append only. |
| `Growth_Pipeline` | Maintain one current row per opportunity. | Current state only. |
| `Rules_Targets` | Add a new effective-dated rule when a value changes. | Append effective periods. |

## 1. Mappings

Purpose: map source identifiers to canonical dashboard SKUs, channels, and warehouses.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Mapping Type` | Yes | Text | Dropdown: `SKU`, `CHANNEL`, `WAREHOUSE` | Select what kind of source value is being mapped. |
| 2 | `Source System` | Yes | Text | Dropdown: `Shopify`, `Klaviyo`, `Budget`, `S&OP`, `Manual` | System in which Source Value appears. |
| 3 | `Source Value` | Yes | Plain text | Nonblank | Exact provider ID/value; do not paraphrase. |
| 4 | `Maps To` | Yes | Plain text | Nonblank | Canonical SKU, dashboard channel, or warehouse code. |
| 5 | `Units per Sellable Unit` | For SKU | Number `0.00` | Greater than zero when Mapping Type is `SKU` | Number of canonical units represented by one source sellable unit. |
| 6 | `S&OP Channel` | For channel | Text | Dropdown: `DTC/Website`, `TikTok Shop`, `Instagram Shop`, `Retail`, `Events/pop-ups`, `Unclassified` | Planning roll-up for a channel mapping. |
| 7 | `Effective From` | Yes | Date `yyyy-mm-dd` | Valid date | First reporting date for the mapping. |
| 8 | `Notes` | No | Text | None | Short clarification only. |

Business key: `Mapping Type + Source System + Source Value + Effective From`.

History: append a new dated mapping; overlapping mappings for the same source value are invalid.

TEST examples:

| Mapping Type | Source System | Source Value | Maps To | Units per Sellable Unit | S&OP Channel | Effective From | Notes |
|---|---|---|---|---:|---|---|---|
| SKU | Shopify | TEST-VARIANT-001 | TEST-SKU-A | 4 |  | 2026-01-01 | Synthetic 4-pack mapping |
| CHANNEL | Shopify | test-affiliate | Affiliate/ShopMy |  | DTC/Website | 2026-01-01 | Synthetic source channel |

PRODUCTION: header row and validation only; no example rows.

Invalid behavior: affected values remain unmapped/unclassified; they are not guessed.

## 2. Inventory

Purpose: manual inventory for locations not reliably covered by Shopify and physical-count reconciliation.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Date` | Yes | Date `yyyy-mm-dd` | Valid date | Date the quantity represents. |
| 2 | `Warehouse` | Yes | Text | Must resolve through `Mappings` | Warehouse/location being counted. |
| 3 | `SKU` | Yes | Text | Must resolve through `Mappings` | Canonical SKU. |
| 4 | `Inventory Type` | Yes | Text | Dropdown: `System`, `Physical` | Whether the value is system-reported or physically counted. |
| 5 | `Quantity On Hand` | Yes | Number `#,##0.00` | Zero or positive | Total quantity on hand. |
| 6 | `Quantity Available` | No | Number `#,##0.00` | Blank or zero/positive | Supply only when genuinely maintained. |
| 7 | `Notes` | No | Text | None | Short exception/reconciliation note. |

Business key: `Date + Warehouse + SKU + Inventory Type`.

History: append dated snapshots; prior dates are never overwritten.

TEST examples:

| Date | Warehouse | SKU | Inventory Type | Quantity On Hand | Quantity Available | Notes |
|---|---|---|---|---:|---:|---|
| 2026-07-01 | TEST-WH-A | TEST-SKU-A | System | 1200 | 1150 | Synthetic system quantity |
| 2026-07-01 | TEST-WH-A | TEST-SKU-A | Physical | 1196 |  | Synthetic physical count |

PRODUCTION: header row and validation only.

Invalid behavior: reject the row; combined inventory becomes partial or not ready if a required warehouse component is missing.

## 3. Inventory_Lots

Purpose: current lot, best-by, quantity, and FEFO-prerequisite visibility.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `As Of Date` | Yes | Date `yyyy-mm-dd` | Valid date | Date the current lot quantity was checked. |
| 2 | `Warehouse` | Yes | Text | Must resolve through `Mappings` | Current lot location. |
| 3 | `SKU` | Yes | Text | Must resolve through `Mappings` | Canonical SKU. |
| 4 | `Lot Code` | Yes | Plain text | Nonblank | Supplier/production lot identifier. |
| 5 | `Best By Date` | Yes | Date `yyyy-mm-dd` | Valid date | Printed best-by date. |
| 6 | `Quantity Remaining` | Yes | Number `#,##0.00` | Zero or positive | Current remaining quantity. |
| 7 | `Production Date` | No | Date `yyyy-mm-dd` | Blank or valid date | Production date if known. |
| 8 | `Receipt Date` | No | Date `yyyy-mm-dd` | Blank or valid date | Warehouse receipt date if known. |
| 9 | `Status` | No | Text | Dropdown: `Available`, `Hold`, `Depleted`, `Expired` | Current lot status. |
| 10 | `Notes` | No | Text | None | Short clarification. |

Business key: `Warehouse + SKU + Lot Code`.

History: current state only; update the existing lot row. Approved V1 has no historical lot-movement visualization.

TEST example:

| As Of Date | Warehouse | SKU | Lot Code | Best By Date | Quantity Remaining | Production Date | Receipt Date | Status | Notes |
|---|---|---|---|---|---:|---|---|---|---|
| 2026-07-01 | TEST-WH-A | TEST-SKU-A | TEST-LOT-01 | 2027-01-31 | 600 | 2026-06-01 | 2026-06-15 | Available | Synthetic lot |

PRODUCTION: header row and validation only.

Invalid behavior: reject the lot row; affected FEFO/best-by output is partial or not ready.

## 4. Depletions

Purpose: record inventory use not represented by revenue orders.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Date` | Yes | Date `yyyy-mm-dd` | Valid date | Date inventory left the warehouse. |
| 2 | `Warehouse` | Yes | Text | Must resolve through `Mappings` | Source warehouse. |
| 3 | `SKU` | Yes | Text | Must resolve through `Mappings` | Canonical SKU. |
| 4 | `Quantity` | Yes | Number `#,##0.00` | Greater than zero | Quantity depleted. |
| 5 | `Reason` | Yes | Text | Dropdown: `Gifting`, `Sample`, `Influencer`, `Promotion`, `Damage`, `Wastage`, `Other` | Reason it did not generate a normal order. |
| 6 | `Lot Code` | No | Text | None | Lot if known. |
| 7 | `Recipient or Project` | No | Text | None | Non-sensitive recipient/project label. |
| 8 | `Notes` | No | Text | None | Short clarification. |

Business key: each event row; exact duplicates are rejected.

History: append only.

TEST example:

| Date | Warehouse | SKU | Quantity | Reason | Lot Code | Recipient or Project | Notes |
|---|---|---|---:|---|---|---|---|
| 2026-07-03 | TEST-WH-A | TEST-SKU-A | 12 | Sample | TEST-LOT-01 | TEST-EVENT | Synthetic depletion |

PRODUCTION: header row and validation only.

Invalid behavior: reject the row and disclose that depletion-adjusted inventory is partial.

## 5. Forecast

Purpose: versioned manual operational forecast used for forecast-versus-actual.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Forecast Version` | Yes | Plain text | Nonblank | Stable version label, such as a planning cycle ID. |
| 2 | `Version Date` | Yes | Date `yyyy-mm-dd` | Valid date | Date the version was created. |
| 3 | `Status` | Yes | Text | Dropdown: `Draft`, `Active`, `Superseded` | Only one complete version may be active for overlapping periods. |
| 4 | `Week Start` | Yes | Date `yyyy-mm-dd` | Valid date | First date of the forecast week. |
| 5 | `SKU` | Yes | Text | Must resolve through `Mappings` | Canonical SKU. |
| 6 | `Dashboard Channel` | Yes | Text | Dropdown: `Website/DTC`, `Affiliate/ShopMy`, `TikTok Shop`, `IG Shop`, `In-store/cafés`, `Wholesale/Faire`, `Events/pop-ups`, `Unclassified` | Detailed dashboard channel. |
| 7 | `Forecast Units` | Yes | Number `#,##0.00` | Zero or positive | Expected units for this row. |
| 8 | `Forecast Revenue USD` | Yes | Currency `$#,##0.00` | Zero or positive | Expected revenue for this row. |
| 9 | `Notes` | No | Text | None | Short assumption note. |

Business key: `Forecast Version + Week Start + SKU + Dashboard Channel`.

History: append complete versions. Mark the previous version `Superseded`; do not delete it.

TEST example:

| Forecast Version | Version Date | Status | Week Start | SKU | Dashboard Channel | Forecast Units | Forecast Revenue USD | Notes |
|---|---|---|---|---|---|---:|---:|---|
| TEST-FC-001 | 2026-06-25 | Active | 2026-07-06 | TEST-SKU-A | Website/DTC | 180 | 1618.20 | Synthetic forecast |

PRODUCTION: header row and validation only.

Invalid behavior: if an active version contains duplicate or invalid required rows, that active version is invalid; no partial forecast is silently certified.

## 6. Production

Purpose: production orders, incoming inventory, delivery timing, receipt, PO cost, payment exposure, and rebate eligibility.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `PO Number` | Yes | Plain text | Nonblank | Production purchase-order identifier. |
| 2 | `PO Line` | Yes | Plain text | Nonblank | Stable line identifier within the PO. |
| 3 | `SKU` | Yes | Text | Must resolve through `Mappings` | Canonical SKU. |
| 4 | `Units Ordered` | Yes | Number `#,##0.00` | Greater than zero | Units ordered for this SKU. |
| 5 | `Order Date` | Yes | Date `yyyy-mm-dd` | Valid date | PO/order date. |
| 6 | `Expected Arrival Date` | Yes | Date `yyyy-mm-dd` | Valid date on/after Order Date | Expected warehouse arrival. |
| 7 | `Destination Warehouse` | Yes | Text | Must resolve through `Mappings` | Receiving location. |
| 8 | `Status` | Yes | Text | Dropdown: `Planned`, `Ordered`, `In Production`, `In Transit`, `Partially Received`, `Received`, `Delayed`, `Cancelled` | Current PO-line status. |
| 9 | `Expected Production Date` | No | Date `yyyy-mm-dd` | Blank or valid date | Planned production date. |
| 10 | `Actual Arrival Date` | No | Date `yyyy-mm-dd` | Required when Status is `Received` | Actual receipt date. |
| 11 | `Units Received` | No | Number `#,##0.00` | Zero or positive | Units actually received. |
| 12 | `Unit Cost USD` | No | Currency `$#,##0.00` | Zero or positive | Genuine PO unit cost for exposure only. |
| 13 | `Freight USD` | No | Currency `$#,##0.00` | Zero or positive | Genuine PO freight exposure. |
| 14 | `Deposit Due Date` | No | Date `yyyy-mm-dd` | Blank or valid date | Deposit due date. |
| 15 | `Deposit Amount USD` | No | Currency `$#,##0.00` | Zero or positive | Deposit amount due. |
| 16 | `Balance Due Date` | No | Date `yyyy-mm-dd` | Blank or valid date | Balance due date. |
| 17 | `Balance Amount USD` | No | Currency `$#,##0.00` | Zero or positive | Remaining amount due. |
| 18 | `Rebate Eligible` | No | Checkbox/boolean | `TRUE` or `FALSE` | Use only after the Fairafric eligibility rule is approved. |
| 19 | `Notes` | No | Text | None | Delay/payment clarification. |

Business key: `PO Number + PO Line`.

History: update current status on the same row; retain received/cancelled rows. V1 does not require production status event history.

TEST example:

| PO Number | PO Line | SKU | Units Ordered | Order Date | Expected Arrival Date | Destination Warehouse | Status | Expected Production Date | Actual Arrival Date | Units Received | Unit Cost USD | Freight USD | Deposit Due Date | Deposit Amount USD | Balance Due Date | Balance Amount USD | Rebate Eligible | Notes |
|---|---|---|---:|---|---|---|---|---|---|---:|---:|---:|---|---:|---|---:|---|---|
| TEST-PO-001 | 1 | TEST-SKU-A | 1000 | 2026-06-01 | 2026-07-15 | TEST-WH-A | In Transit | 2026-06-20 |  | 0 | 1.50 | 250.00 | 2026-06-05 | 500.00 | 2026-07-01 | 1000.00 | FALSE | Synthetic PO |

PRODUCTION: header row and validation only.

Invalid behavior: reject the PO line from affected incoming/payment calculations; unrelated valid PO lines remain usable.

## 7. SKU_Costs

Purpose: minimum approved effective cost per unit for actual margin.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Effective From` | Yes | Date `yyyy-mm-dd` | Valid date | First date this cost applies. |
| 2 | `SKU` | Yes | Text | Must resolve through `Mappings` | Canonical SKU. |
| 3 | `Cost per Unit USD` | Yes | Currency `$#,##0.0000` | Zero or positive | Approved total cost per canonical unit. |
| 4 | `Effective To` | No | Date `yyyy-mm-dd` | Blank or date on/after Effective From | Last applicable date, if closed. |
| 5 | `Cost Reference` | No | Text | None | Invoice, approved model, or decision reference. |
| 6 | `Notes` | No | Text | None | Short explanation. |

Business key: `SKU + Effective From`.

History: append effective-dated costs; active periods cannot overlap.

TEST example:

| Effective From | SKU | Cost per Unit USD | Effective To | Cost Reference | Notes |
|---|---|---:|---|---|---|
| 2026-01-01 | TEST-SKU-A | 2.25 |  | TEST-COST-APPROVAL | Synthetic effective cost |

PRODUCTION: header row and validation only.

Invalid behavior: overlapping/missing cost periods make actual margin unavailable for the affected SKU/period; no Budget or PO value silently replaces it.

## 8. Finance_Actuals

Purpose: actual operating expenses not authoritatively supplied by Shopify.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Date` | Yes | Date `yyyy-mm-dd` | Valid date | Expense/accounting date. |
| 2 | `Category` | Yes | Text | Dropdown: `Payroll`, `Contractor`, `Marketing`, `Fulfillment`, `Warehouse`, `Production`, `Freight`, `Other Operating Expense` | Financial reporting category. Revenue is prohibited. |
| 3 | `Amount USD` | Yes | Currency `$#,##0.00;($#,##0.00)` | Numeric; negative corrections allowed | Actual expense amount. |
| 4 | `Description` | No | Text | None | Short business description. |
| 5 | `Reference` | No | Text | None | Invoice/report reference if available. |

Business key: each expense entry; exact duplicates are rejected.

History: append only. Corrections use reversing/correcting rows.

TEST example:

| Date | Category | Amount USD | Description | Reference |
|---|---|---:|---|---|
| 2026-07-01 | Warehouse | 850.00 | Synthetic monthly storage | TEST-INV-001 |

PRODUCTION: header row and validation only.

Invalid behavior: reject the row and mark affected actual-expense totals partial. Shopify revenue must never be entered here.

## 9. Cash

Purpose: dated cash balances for cash position and runway prerequisites.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Date` | Yes | Date `yyyy-mm-dd` | Valid date | Balance date. |
| 2 | `Account` | Yes | Plain text | Nonblank | Stable non-sensitive account label. |
| 3 | `Balance USD` | Yes | Currency `$#,##0.00;($#,##0.00)` | Numeric | Account balance. |
| 4 | `Restricted Cash USD` | No | Currency `$#,##0.00` | Blank or zero/positive | Restricted portion if tracked. |
| 5 | `Notes` | No | Text | None | Short clarification. |

Business key: `Date + Account`.

History: append dated balances.

TEST example:

| Date | Account | Balance USD | Restricted Cash USD | Notes |
|---|---|---:|---:|---|
| 2026-07-01 | TEST-OPERATING | 75000.00 | 5000.00 | Synthetic balance |

PRODUCTION: header row and validation only.

Invalid behavior: reject the row; runway remains unavailable if a required account/date is missing.

## 10. Marketing_Spend

Purpose: actual campaign/platform spend only.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Date` | Yes | Date `yyyy-mm-dd` | Valid date | Spend date. |
| 2 | `Platform` | Yes | Text | Dropdown: `Meta`, `Google`, `TikTok`, `Klaviyo`, `ShopMy`, `Other` | Platform on which spend occurred. |
| 3 | `Campaign` | Yes | Plain text | Nonblank | Exact platform campaign ID/name where available. |
| 4 | `Spend USD` | Yes | Currency `$#,##0.00` | Zero or positive | Actual spend only. |
| 5 | `Dashboard Channel` | No | Text | Approved channel values | Channel mapping if genuinely known. |
| 6 | `Impressions` | No | Number `#,##0` | Blank or zero/positive integer | Platform-reported impressions. |
| 7 | `Clicks` | No | Number `#,##0` | Blank or zero/positive integer | Platform-reported clicks. |

Business key: `Date + Platform + Campaign`.

History: append only.

TEST example:

| Date | Platform | Campaign | Spend USD | Dashboard Channel | Impressions | Clicks |
|---|---|---|---:|---|---:|---:|
| 2026-07-01 | Meta | TEST-CAMPAIGN-001 | 120.00 | Website/DTC | 25000 | 450 |

PRODUCTION: header row and validation only.

Invalid behavior: reject invalid spend rows. Spend remains available independently of CAC/ROAS attribution readiness.

Attribution rule: this tab never supplies acquired customers or attributed revenue. CAC, ROAS, and LTV:CAC stay `BUSINESS_RULE_REQUIRED` or `DATA_NOT_AVAILABLE` until their exact definitions and verified attribution sources exist.

## 11. Social_Metrics

Purpose: dated social account metrics not supplied by Shopify or Klaviyo.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Date` | Yes | Date `yyyy-mm-dd` | Valid date | Observation date. |
| 2 | `Platform` | Yes | Text | Dropdown: `Instagram`, `TikTok`, `Facebook`, `LinkedIn`, `YouTube`, `Other` | Social platform. |
| 3 | `Account` | Yes | Plain text | Nonblank | Stable account/handle label. |
| 4 | `Followers` | Yes | Number `#,##0` | Zero or positive integer | Follower count at this date. |
| 5 | `Impressions` | No | Number `#,##0` | Blank or zero/positive | Platform-reported impressions. |
| 6 | `Reach` | No | Number `#,##0` | Blank or zero/positive | Platform-reported reach. |
| 7 | `Engagements` | No | Number `#,##0` | Blank or zero/positive | Platform-reported engagements. |
| 8 | `Link Clicks` | No | Number `#,##0` | Blank or zero/positive | Platform-reported link clicks. |

Business key: `Date + Platform + Account`.

History: append dated observations.

TEST example:

| Date | Platform | Account | Followers | Impressions | Reach | Engagements | Link Clicks |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-07-01 | Instagram | TEST-ACCOUNT | 2500 | 30000 | 18000 | 1500 | 210 |

PRODUCTION: header row and validation only.

Invalid behavior: reject the row; missing optional measures remain unavailable rather than becoming zero.

## 12. Partner_Performance

Purpose: affiliate, ambassador, and creator performance.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Period Start` | Yes | Date `yyyy-mm-dd` | Valid date | First date of the reporting period. |
| 2 | `Period End` | Yes | Date `yyyy-mm-dd` | On/after Period Start | Last date of the reporting period. |
| 3 | `Partner Type` | Yes | Text | Dropdown: `Affiliate`, `Ambassador`, `Creator` | Partner classification. |
| 4 | `Partner` | Yes | Plain text | Nonblank; avoid unnecessary PII | Stable partner identifier/display label. |
| 5 | `Platform` | Yes | Text | Dropdown: `ShopMy`, `Shopify`, `Manual`, `Other` | Reporting platform/source. |
| 6 | `Orders` | No | Number `#,##0` | Blank or zero/positive integer | Attributed orders if supplied by the source. |
| 7 | `Revenue USD` | No | Currency `$#,##0.00` | Blank or zero/positive | Attributed revenue if supplied by the source. |
| 8 | `Commission USD` | No | Currency `$#,##0.00` | Blank or zero/positive | Commission for this period. |
| 9 | `Payout Status` | No | Text | Dropdown: `Not Due`, `Due`, `Paid`, `Disputed`, `Not Applicable` | Current payout status. |

Business key: `Period Start + Period End + Partner Type + Partner + Platform`.

History: append each reporting period.

TEST example:

| Period Start | Period End | Partner Type | Partner | Platform | Orders | Revenue USD | Commission USD | Payout Status |
|---|---|---|---|---|---:|---:|---:|---|
| 2026-07-01 | 2026-07-31 | Affiliate | TEST-PARTNER-001 | ShopMy | 8 | 720.00 | 72.00 | Due |

PRODUCTION: header row and validation only.

Invalid behavior: reject the row. At least one of Orders, Revenue USD, or Commission USD must be populated.

## 13. Growth_Pipeline

Purpose: current collaboration, retail, partnership, investor, grant, and sponsorship pipeline.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Pipeline Type` | Yes | Text | Dropdown: `Collaboration`, `Retail`, `Partnership`, `Investor`, `Grant`, `Sponsorship` | Pipeline category. |
| 2 | `Opportunity ID` | Yes | Plain text | Unique within Pipeline Type | Stable opportunity identifier. |
| 3 | `Opportunity Name` | Yes | Text | Nonblank | Business-friendly opportunity name. |
| 4 | `Stage` | Yes | Text | Nonblank | Current business-defined stage. |
| 5 | `Status` | Yes | Text | Dropdown: `Open`, `Won`, `Lost`, `On Hold`, `Cancelled` | Current opportunity status. |
| 6 | `Last Updated` | Yes | Date `yyyy-mm-dd` | Valid date | Date the row was last reviewed. |
| 7 | `Value USD` | No | Currency `$#,##0.00` | Blank or zero/positive | Expected/confirmed value if maintained. |
| 8 | `Next Action` | No | Text | None | Next business action. |
| 9 | `Due Date` | No | Date `yyyy-mm-dd` | Blank or valid date | Next-action due date. |
| 10 | `Notes` | No | Text | None | Short clarification. |

Business key: `Pipeline Type + Opportunity ID`.

History: current state only; update the existing row. Historical stage-movement and predictive conversion are outside V1.

TEST example:

| Pipeline Type | Opportunity ID | Opportunity Name | Stage | Status | Last Updated | Value USD | Next Action | Due Date | Notes |
|---|---|---|---|---|---|---:|---|---|---|
| Partnership | TEST-OPP-001 | Synthetic Retail Partner | Discussion | Open | 2026-07-01 | 12000.00 | Send test proposal | 2026-07-10 | Synthetic record |

PRODUCTION: header row and validation only.

Invalid behavior: reject the row; unrelated pipeline records remain available.

## 14. Rules_Targets

Purpose: approved KPI targets, alert thresholds, inventory policies, and Fairafric rebate rule values.

| # | Column | Required | Sheet format | Validation | Instruction |
|---:|---|---:|---|---|---|
| 1 | `Rule Key` | Yes | Text | Approved rule-key dropdown | Metric/rule identifier. |
| 2 | `Value` | Yes | Number `0.0000` | Numeric | Approved value. |
| 3 | `Unit` | Yes | Text | Dropdown: `Number`, `Percent`, `USD`, `Days`, `Units` | Meaning of Value. |
| 4 | `Effective From` | Yes | Date `yyyy-mm-dd` | Valid date | First date the rule applies. |
| 5 | `SKU` | No | Text | Must resolve through `Mappings` | Optional SKU scope. |
| 6 | `Warehouse` | No | Text | Must resolve through `Mappings` | Optional warehouse scope. |
| 7 | `Dashboard Channel` | No | Text | Approved channel values | Optional channel scope. |
| 8 | `Effective To` | No | Date `yyyy-mm-dd` | Blank or on/after Effective From | Last applicable date. |
| 9 | `Notes` | No | Text | None | Rule clarification/reference. |

Initial approved key registry is empty until the corresponding business rule is approved. Expected key families, when approved, are sales-velocity lookback, lead time, safety buffer, reorder threshold, KPI targets, alert thresholds, and Fairafric rebate parameters.

Business key: `Rule Key + SKU + Warehouse + Dashboard Channel + Effective From`.

History: append new effective-dated rules; overlapping active scopes are invalid.

TEST example:

| Rule Key | Value | Unit | Effective From | SKU | Warehouse | Dashboard Channel | Effective To | Notes |
|---|---:|---|---|---|---|---|---|---|
| TEST_ALERT_THRESHOLD | 10 | Percent | 2026-01-01 | TEST-SKU-A | TEST-WH-A |  |  | Synthetic rule only |

PRODUCTION: header row and validation only; no rule rows are added until approved values exist.

Invalid behavior: the affected metric/alert remains `BUSINESS_RULE_REQUIRED`; unrelated metrics continue.

## TEST coverage design

B4.4 TEST rows must include, without adding production-like PII:

- one valid record per tab;
- an empty-tab condition;
- a missing required value;
- an invalid date;
- numeric text where a number is required;
- duplicate business keys;
- unmapped SKU/channel/warehouse;
- stale dated data;
- overlapping mapping/cost/rule effective periods;
- an incomplete active forecast version;
- a received PO without actual arrival date;
- missing optional values that must remain unavailable rather than zero; and
- marketing spend without attribution, proving spend works while CAC/ROAS remains unavailable.

Invalid synthetic cases should be placed in a clearly marked test block or separate controlled test copy during B4.4 so ordinary valid TEST scenarios remain usable. They are never copied to PRODUCTION.

## PRODUCTION empty-state design

Every production input tab begins with:

- row 1 headers in the exact order defined above;
- formatting, dropdowns, filters, frozen header and column notes;
- zero business rows.

The dashboard returns `Data source not ready`, an approved empty state, or partial readiness until genuine valid records exist. Production never substitutes TEST records.

## B4.4 implementation boundary

B4.4 may create the local TEST workbook and empty PRODUCTION workbook/template using this exact design. Native Google Drive creation/upload requires the separately approved B4.4 authorization. Any genuine correctness issue that changes a required column, tab, enum, or history rule must return to B4.2/B4.3 approval rather than being silently changed.
