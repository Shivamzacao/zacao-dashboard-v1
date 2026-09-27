# Sheets → API Migration: Status

Branch `claude/shopify-api-migration` · baseline `e09a6aa` · updated 2026-09-28

Evidence base: the live Shopify capability audit (store `e93644-3`, API `2026-07`) and the codebase audit. Both reports are kept outside this public repository because they contain store figures.

## 1. Where the migration stands

| Area | State |
|---|---|
| Shopify correctness (C-1 … C-4) | **Done**, unit-tested. Not yet exercised live from this environment (no credentials) |
| Klaviyo (C-7 unsubscribes, F-K3 rate limits, metrics 400) | **Fixed and live-validated** 2026-09-28 through the real dashboard runtime. See KLAVIYO.md |
| Canonical models + Shopify commerce reader | **Done** (variants, locations, inventory positions, fulfillments; GIDs preserved) |
| Configuration layer | **Started**: versioned `config/zacao-business-config.json`. Holds only verified values; sheet-owned configuration not yet exported (see CONFIGURATION.md) |
| Central source selection (`ZACAO_SOURCE_MODE`) | **Done**: `legacy` (default, unchanged behaviour) / `parallel` / `api` |
| Reconciliation harness | **Done**: generic engine + 4 tab comparers + opt-in live runner |
| Live parity / historical reconciliation | **BLOCKED**: `SHOPIFY_*` and `GOOGLE_*` are not set in this environment. Run `pnpm parity:live` where they are |
| Metrics switched from Sheets to API | **None yet**. By design: no tab has passed parity |
| Internal DB | **BLOCKED by decision**: DEC-003 ("no primary database in V1") is locked. Design only (INTERNAL_DB_DESIGN.md) |
| External ad/social APIs | **Not built**: no credentials or approved platform list. Nothing fabricated |
| Google Sheets runtime | **Retained** (required until parity is proven) |

## 2. Architecture after this change

```text
Shopify Admin GraphQL ─┐                       ┌─ ShopifyQL (analytics budget: shared window, bounded wait — C-1)
                       ▼                       ▼
            ShopifyGraphQlClient ──► ShopifyAdminAdapter (orders: date-filtered, paged to exhaustion — C-2)
                                          │
                                          ▼
                     normalization.ts + line-items.ts (fee/product/custom classes — C-4; variant-GID identity — C-3)
                                          │
                     ┌────────────────────┼─────────────────────────┐
                     ▼                    ▼                         ▼
            existing contributors   ShopifyCommerceReader     catalog-identity.ts
            (unchanged contracts)   (canonical models,        (VariantIdentityRegistry)
                                     SourceReadOutcome)
                                          │
Google Sheets ─► SheetsApiClient ─► ParityTabSource (only when ZACAO_SOURCE_MODE ≠ legacy)
                                     │  returns Sheets rows unchanged (authoritative)
                                     └─ background: comparers ─► reconcile() ─► ParityLedger + logs
                                          │
                                          ▼
                       existing metric builders (src/application/metrics — unchanged)
```

Key files:

| Concern | File |
|---|---|
| Analytics throttle window | `src/infrastructure/shopify/client.ts` |
| Order search window / paging | `src/infrastructure/shopify/admin-graphql/adapter.ts`, `queries.ts`, `pagination.ts` |
| Line classification & identity | `src/infrastructure/shopify/line-items.ts`, `catalog-identity.ts` |
| Canonical models | `src/domain/commerce/models.ts` |
| Read outcomes (no data ≠ failure ≠ not authorized …) | `src/domain/sources/read-outcome.ts` |
| Shopify commerce reader | `src/infrastructure/shopify/commerce-reader.ts` |
| Configuration | `config/zacao-business-config.json`, `src/domain/configuration/business-config.ts`, `src/infrastructure/config/business-config.ts` |
| Source mode | `src/infrastructure/sources/source-mode.ts` (read once in `src/infrastructure/api/handlers.ts`) |
| Parity decorator / ledger | `src/infrastructure/sources/parity-tab-source.ts`, `parity-ledger.ts` |
| Reconciliation | `src/application/reconciliation/reconcile.ts`, `tab-comparers.ts` |
| Live runner | `tests/live/parity.live.ts`, `vitest.live.config.ts`, `pnpm parity:live` |

## 3. Source-of-truth matrix

| Data | System of record (target) | Today | Status |
|---|---|---|---|
| Orders, lines, refunds, discounts, customers, consent | Shopify | Shopify (Admin + ShopifyQL) | READY |
| Products / variants / SKU identity | Shopify | Sheets `SKU_Master` (identity + pack size) | PARTIAL: identity comparer built; pack size stays config |
| Locations | Shopify | Sheets `Location_Master` | PARTIAL: comparer built; join-by-id needs a sheet/config column |
| Inventory at Shopify locations (SNAPL) | Shopify | Shopify (bars via SKU_Master) + Sheets mirror rows | PARTIAL: mirror comparer built |
| Inventory at non-Shopify locations (YBYD) | 3PL export / manual (internal) | Sheets | MANUAL / INTERNAL_DB |
| Fulfilment timing | Shopify | Sheets `Warehouse_Fulfillment` | PARTIAL: comparer built; pick accuracy stays manual |
| Email/SMS engagement | Klaviyo | Klaviyo | READY (live-validated 2026-09-28) |
| Ad spend, social reach/followers | Platform APIs | Sheets | EXTERNAL_API: not built |
| COGS history, POs, lots, packaging, forecast, depletions | Internal DB | Sheets | INTERNAL_DB: blocked by DEC-003 |
| Pipelines, investors, grants, finance actuals, cash | Internal DB / accounting | Sheets | MANUAL / INTERNAL_DB |
| Channel map, targets, stock bands, pack sizes | Configuration | Sheets | CONFIG: awaiting export |

## 4. Fallback behaviour (`ZACAO_SOURCE_MODE`)

| Mode | What the dashboard serves | Extra API load |
|---|---|---|
| `legacy` (default, unset) | Exactly the pre-migration behaviour | none |
| `parallel` | Sheets, unchanged | ≤ 1 background Shopify comparison per replaceable tab per 10 min |
| `api` | Sheets for every tab, because none is certified. A warning is logged once | same as parallel |
| invalid value | `legacy`; `source_mode.invalid` logged at error level | none |

A tab moves to API serving only after its comparer reports `match` over the §6 periods, the difference log is resolved, and this document records the certification.

## 5. Environment variables

| Variable | Purpose | Required for |
|---|---|---|
| `ZACAO_SOURCE_MODE` | `legacy` / `parallel` / `api` | optional (default `legacy`) |
| `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ADMIN_API_VERSION` | Shopify (read-only client-credentials) | Shopify metrics, parity |
| `GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_*` | Sheets (legacy side) | Sheets metrics, parity |
| `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_API_REVISION` (+ optional) | Klaviyo | Klaviyo metrics |
| `PARITY_REPORT_DIR` | Where `pnpm parity:live` writes its JSON (default: OS temp dir) | live parity only |

**Security.** A Shopify client secret for the "dashboard" app was exposed in a chat session during the audit. It was never written to this repository (`pnpm check:secrets` passes; a repo-wide search found no occurrence). **It must be rotated in the Shopify Dev Dashboard**, and the new value set only in the deployment environment.

## 6. Reconciliation process

1. Set credentials in the environment (never in files). Run `ZACAO_SOURCE_MODE=parallel` in a non-production deployment, or run `pnpm parity:live` directly.
2. The runner compares:
   - `SKU_Master`, `Location_Master`, `Inventory_Snapshots` (Shopify-mapped warehouses, in bars) and `Warehouse_Fulfillment` timing against Shopify;
   - units by SKU from ShopifyQL (the current dashboard source) against the migrated Admin read, for each period: last 7 / 30 / 90 days, previous month, current month, all history.
3. Record every difference in `RECONCILIATION_LOG.md`: old value, new value, delta, likely reason, resolution. Neither side is presumed correct.
4. Certify a tab here only when its differences are resolved.

Known expected differences:
- **Snapshot timing:** the sheet snapshot date vs Shopify's live levels.
- **Returns vs refunds:** ShopifyQL `net_items_sold` nets returns; Admin `currentQuantity` nets refund and edit removals.
- **Location keys:** Shopify has two locations named `SNAPL` (one inactive), so joining by name is ambiguous until `Location.id` is recorded.

## 7. Known limitations (not silently changed)

- **Shopify search syntax.** The order window uses `created_at:>='…' AND created_at:<'…'` (ISO instants). The date-only form was verified live during the audit; the ISO form still needs its first live run.
- **Detailed orders date rule.** The drill-down now honours the requested period (per its catalog definition). It keeps the existing UTC `createdAt` calendar-date rule shared with `operations.refund_rate`, which differs from the America/New_York reporting day at the edges. Changing it is a business decision.
- **Composite source status.** Composite contributors still hard-code Shopify status as current/complete (prior audit K4). Not changed in this pass.
- **ShopifyQL fee lines.** Faire fee lines appear in ShopifyQL as `line_type=product` rows with no SKU. They are already shown as unattributed in the ShopifyQL metrics, and the Admin path now excludes them. ShopifyQL rows are not reclassified, because fee lines cannot be told apart from other SKU-less lines there.
- **Newly granted scopes not yet exercised live.** `read_markets`, `read_publications`, `read_pixels`, `read_metaobjects`, `read_metaobject_definitions` and `read_shopify_payments_accounts` have not been used. No metric in the 157-entry catalog consumes markets, publications, pixels or metaobjects, so nothing was introduced into the runtime for them. Shopify Payments payouts and fees become reachable with `read_shopify_payments_accounts` and are the candidate source for channel-margin processing fees once live-verified.
- **Formatting.** `pnpm format:check` was already failing on 4 untouched files at baseline (`src/application/metrics/sheets.ts` and 3 tests). They were left untouched.

## 8. Per-metric status (all 157)

Old source → new source → status → validation result. Statuses:

| Status | Meaning |
|---|---|
| READY | Already API-sourced, no Sheets dependency |
| PARTIAL | Shopify side exists, but Sheets config or parity is still required |
| INTERNAL_DB / MANUAL / EXTERNAL_API / CONFIG | Target system named, not built |
| UNKNOWN | Catalog-only or business rule pending |

| # | Metric | Dashboard | Old source → | New source | Status | Validation result |
|---|---|---|---|---|---|---|
| 1 | `commerce.net_sales` | executive | ShopifyQL dataset `sales_totals` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 2 | `commerce.orders` | executive, revenue | ShopifyQL `sales_totals` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 3 | `commerce.average_order_value` | executive, revenue | ShopifyQL `sales_totals` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 4 | `customers.returning_rate` | executive, customers | ShopifyQL `returning_customer_rate` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 5 | `commerce.sales_trend` | executive, revenue | ShopifyQL `sales_trend` grain month | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 6 | `commerce.native_channel_mix` | executive | ShopifyQL `native_channels` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 7 | `operations.fulfillment_summary` | executive, operations | ShopifyQL `fulfillment_trend` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 8 | `operations.manufacturer_otif` | executive, operations | Sheet `Production_Orders` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 9 | `manufacturing.cogs_per_bar` | executive, products | Sheet `COGS_By_SKU, Metric_Targets, SKU_Master` | INTERNAL_DB_REQUIRED (+ CONFIGURATION target) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 10 | `manufacturing.input_cost_movement` | executive | Sheet `COGS_By_SKU` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 11 | `plan.revenue_variance` | catalog: Executive Health, Revenue Intelligence, Financial Intelligence | catalog says: Shopify actuals and Corrected Budget/Forecast plan | CONFIGURATION (budget) + SHOPIFYQL actuals | **CONFIG** | Not migrated. Serving: current source (Sheets where applicable). |
| 12 | `executive.business_health_score` | catalog: Executive Health | catalog says: Multiple approved metrics | UNKNOWN (catalog-only, business rule / NOT_V1) | **UNKNOWN** | Not migrated. Serving: current source (Sheets where applicable). |
| 13 | `executive.recommendations` | catalog: Executive Health, Insights and Data Quality | catalog says: Approved deterministic alerts | UNKNOWN (catalog-only, business rule / NOT_V1) | **UNKNOWN** | Not migrated. Serving: current source (Sheets where applicable). |
| 14 | `commerce.gross_sales` | revenue | ShopifyQL `sales_totals` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 15 | `commerce.discounts` | revenue | ShopifyQL | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 16 | `commerce.returns` | revenue | ShopifyQL | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 17 | `commerce.shipping_charges` | catalog: Revenue Intelligence | ShopifyQL | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 18 | `commerce.taxes` | catalog: Revenue Intelligence | ShopifyQL | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 19 | `commerce.total_sales` | revenue, financial | ShopifyQL | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 20 | `revenue.dtc_total` | revenue | ShopifyQL `native_channels` + Sheet `Channel_Mapping` | SHOPIFYQL + CONFIGURATION | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 21 | `revenue.retail_total` | revenue | ShopifyQL + Sheet `Channel_Mapping` | SHOPIFYQL + CONFIGURATION | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 22 | `revenue.channel_mix` | revenue | ShopifyQL + Sheet `Channel_Mapping` | SHOPIFYQL + CONFIGURATION | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 23 | `revenue.channel_margin` | revenue, financial | ShopifyQL + Sheet `Channel_Mapping` + hard-coded CHANNEL_ECONOMICS | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 24 | `products.sales` | executive, revenue, products | ShopifyQL `product_line_classification` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 25 | `products.units_sold` | executive, revenue, products | ShopifyQL `product_line_classification` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 26 | `commerce.purchase_heatmap` | revenue | ShopifyQL `purchase_time` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 27 | `commerce.detailed_order_drilldown` | revenue | Shopify Admin readOrders | SHOPIFY_DIRECT (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 28 | `commerce.predictive_forecast` | catalog: Revenue Intelligence | catalog says: Future model | UNKNOWN (catalog-only, business rule / NOT_V1) | **UNKNOWN** | Not migrated. Serving: current source (Sheets where applicable). |
| 29 | `customers.new_count` | customers | ShopifyQL `new_returning_customers` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 30 | `customers.returning_count` | customers | ShopifyQL | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 31 | `customers.billing_geography` | catalog: Customer Intelligence | ShopifyQL `billing_geography` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 32 | `customers.geo_city` | customers | ShopifyQL `billing_city` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 33 | `engagement.time_on_site` | customers | ShopifyQL `session_engagement` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 34 | `customers.age_mix` | customers | Klaviyo API profiles | KLAVIYO_DIRECT (current) | **BLOCKED** | LIVE 2026-09-28: `not_configured`. Needs KLAVIYO_AGE_BAND_PROPERTY + KLAVIYO_GENDER_PROPERTY (profile property names) and profiles:read. |
| 35 | `customers.sex_mix` | customers | Klaviyo API profiles | KLAVIYO_DIRECT (current) | **BLOCKED** | LIVE 2026-09-28: `not_configured`. Needs KLAVIYO_AGE_BAND_PROPERTY + KLAVIYO_GENDER_PROPERTY (profile property names) and profiles:read. |
| 36 | `commerce.web_funnel` | customers | ShopifyQL `web_funnel` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 37 | `commerce.website_sessions` | executive | ShopifyQL `web_funnel` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 38 | `customers.active` | customers | Shopify Admin readOrders → mapShopifyLtvRecords (facts.ts) | SHOPIFY_DERIVED (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 39 | `customers.cohorts` | catalog: Customer Intelligence | catalog says: Detailed customer/order history | SHOPIFY_DERIVED | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 40 | `customers.realized_ltv` | customers | Shopify Admin readOrders 2000-01-01..endDate (composite/customer-ltv-metrics.ts:54-57) + o | SHOPIFY_DERIVED (current) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 41 | `customers.ltv_90d` | customers | Shopify Admin readOrders | SHOPIFY_DERIVED (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 42 | `customers.realized_ltv_cohorts` | customers | Shopify Admin readOrders | SHOPIFY_DERIVED (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 43 | `customers.rfm` | catalog: Customer Intelligence | catalog says: Detailed customer/order history | SHOPIFY_DERIVED | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 44 | `customers.predictive_churn` | catalog: Customer Intelligence | catalog says: Future model | UNKNOWN (catalog-only, business rule / NOT_V1) | **UNKNOWN** | Not migrated. Serving: current source (Sheets where applicable). |
| 45 | `products.mix` | products | ShopifyQL `product_line_classification` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 46 | `products.catalog` | products | Shopify Admin readProducts | SHOPIFY_DIRECT (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 47 | `products.units_velocity` | catalog: Product Intelligence | ShopifyQL `product_line_classification` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 48 | `products.sku_velocity` | products | ShopifyQL `product_line_classification` trailing range | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 49 | `inventory.on_hand_bars` | products | Shopify Admin readProducts inventory + Sheet `SKU_Master` | SHOPIFY_DIRECT + CONFIGURATION (pack size) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 50 | `inventory.weeks_cover` | products | Shopify Admin inventory + ShopifyQL trailing units + Sheet `SKU_Master` | SHOPIFY_DERIVED + CONFIGURATION | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 51 | `products.sku_margin` | products | ShopifyQL + Sheet `SKU_Master, COGS_By_SKU` | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 52 | `products.cogs_flags` | products | Sheet `COGS_By_SKU, Metric_Targets, SKU_Master` | INTERNAL_DB_REQUIRED + CONFIGURATION | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 53 | `inventory.sku_stock` | products, operations | Shopify Admin inventory + Sheet `SKU_Master, Location_Master, Inventory_Snapshots, Metric_ | SHOPIFY_DIRECT + CONFIGURATION (min/max targets) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 54 | `manufacturing.cogs_trend` | catalog: Product Intelligence | catalog says: Approved COGS_By_SKU and Metric_Targets | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 55 | `inventory.shopify_current` | operations | Shopify Admin readProducts (+ (B) Sheet `SKU_Master, Location_Master` ) | SHOPIFY_DIRECT (current) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 56 | `quality.missing_sku_cost` | products, insights | Sheet `SKU_Master, COGS_By_SKU` | SHOPIFY_DIRECT (if Shopify unitCost becomes the cost of record) else INTERNAL_DB_REQUIRED | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 57 | `inventory.sell_through` | products | Sheet `Inventory_Snapshots, Production_Orders, SKU_Master` + ShopifyQL `product_units_week | SHOPIFYQL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 58 | `inventory.value` | products, financial | Sheet `Inventory_Snapshots, COGS_By_SKU` | SHOPIFY_DERIVED (if costs complete) else INTERNAL_DB_REQUIRED | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 59 | `inventory.runway_reorder` | catalog: Product Intelligence, Operations Intelligence | Sheet `Inventory_Snapshots, Sales_Forecast` | SHOPIFY_PLUS_EXTERNAL (Shopify stock + internal forecast) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 60 | `products.frequently_bought_together` | catalog: Product Intelligence | catalog says: Detailed order line history | SHOPIFY_DERIVED | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 61 | `operations.shipped_delivered` | operations | catalog says: Shopify fulfillment analytics | SHOPIFY_DIRECT | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 62 | `operations.manufacturer_lead_time` | operations | Sheet `Production_Orders` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 63 | `operations.warehouse_on_time_accuracy` | operations | Sheet `Warehouse_Fulfillment` | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 64 | `operations.refund_rate` | operations | Shopify Admin readOrders | SHOPIFY_DIRECT (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 65 | `operations.manufacturer_performance` | operations | Sheet `Production_Orders` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 66 | `inventory.stock_health` | operations | Shopify Admin + Sheet `SKU_Master, Location_Master, Inventory_Snapshots, Metric_Targets` | SHOPIFY_DIRECT + CONFIGURATION (min/max targets) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 67 | `inventory.packaging_stock` | operations | Sheet `Packaging_Materials, Packaging_Inventory, Packaging_Orders` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 68 | `inventory.packaging_projection` | operations | Sheet `Packaging_* + Packaging_Forecast` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 69 | `production.delivery_timeline` | operations | Sheet `Production_Orders` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 70 | `inventory.combined` | executive, operations | Sheet `Inventory_Snapshots, Location_Master` (+ (B) Shopify inventory, SKU_Master) | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 71 | `inventory.lots` | operations | Sheet `Inventory_Lots` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 72 | `inventory.fefo` | catalog: Operations Intelligence | catalog says: Inventory_Lots and Depletions | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 73 | `forecast.variance` | operations | Sheet `Sales_Forecast, SKU_Master` + ShopifyQL weekly units | SHOPIFY_PLUS_EXTERNAL (ShopifyQL actuals + internal forecast) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 74 | `production.incoming` | operations | Sheet `Production_Orders` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 75 | `production.timeline` | catalog: Operations Intelligence | catalog says: PRODUCTION Production and S&OP reference | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 76 | `production.cost_payment` | financial | Sheet `Production_Orders` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 77 | `inventory.depletions` | operations | Sheet `Additional_Depletions` | INTERNAL_DB_REQUIRED / MANUAL_INPUT_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 78 | `klaviyo.email_overview` | catalog: Marketing Intelligence | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 79 | `klaviyo.email_recipients` | marketing | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 80 | `klaviyo.email_delivery_rate` | marketing | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 81 | `klaviyo.email_open_rate` | customers, marketing | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 82 | `klaviyo.email_click_rate` | marketing | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 83 | `klaviyo.email_click_to_open_rate` | catalog: Marketing Intelligence | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 84 | `klaviyo.email_bounce_rate` | catalog: Marketing Intelligence | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 85 | `klaviyo.email_unsubscribe_rate` | catalog: Marketing Intelligence | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 86 | `klaviyo.email_spam_complaints` | catalog: Marketing Intelligence | Klaviyo API reporting | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 87 | `klaviyo.sms_overview` | catalog: Marketing Intelligence | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: `no_activity`, correctly null. The account has 0 campaigns / no SMS activity; no false zero. |
| 88 | `klaviyo.sms_sent` | catalog: Marketing Intelligence | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: `no_activity`, correctly null. The account has 0 campaigns / no SMS activity; no false zero. |
| 89 | `klaviyo.sms_delivered` | catalog: Marketing Intelligence | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: `no_activity`, correctly null. The account has 0 campaigns / no SMS activity; no false zero. |
| 90 | `klaviyo.sms_clicked` | catalog: Marketing Intelligence | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: `no_activity`, correctly null. The account has 0 campaigns / no SMS activity; no false zero. |
| 91 | `klaviyo.sms_failed` | catalog: Marketing Intelligence | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: `no_activity`, correctly null. The account has 0 campaigns / no SMS activity; no false zero. |
| 92 | `klaviyo.sms_unsubscribed` | catalog: Marketing Intelligence | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: `no_activity`, correctly null. The account has 0 campaigns / no SMS activity; no false zero. |
| 93 | `klaviyo.campaign_performance` | customers | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: `no_activity`, correctly null. The account has 0 campaigns / no SMS activity; no false zero. |
| 94 | `klaviyo.flow_performance` | marketing | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 95 | `klaviyo.attributed_revenue` | marketing | Klaviyo API reporting | KLAVIYO_DIRECT (current); Shopify UTM revenue = different metric | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 96 | `klaviyo.engagement_trend` | marketing | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 97 | `klaviyo.email_funnel` | marketing | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 98 | `marketing.spend` | marketing | Sheet `Marketing_Spend` | OTHER_EXTERNAL_API (ad platforms) + MANUAL for non-API spend | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 99 | `marketing.cac` | customers | Sheet `Marketing_Spend` + Shopify Admin orders | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 100 | `marketing.roas` | catalog: Marketing Intelligence | catalog says: Approved attributed revenue and spend | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 101 | `marketing.paid_cac` | marketing | Sheet `Marketing_Spend` | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 102 | `marketing.ltv_cac` | executive, customers | Shopify Admin + Sheet `Marketing_Spend` | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 103 | `social.performance` | growth | Sheet `Social_Metrics` | OTHER_EXTERNAL_API or MANUAL_INPUT_REQUIRED | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 104 | `social.followers_total` | marketing | Sheet `Social_Metrics` | OTHER_EXTERNAL_API or MANUAL_INPUT_REQUIRED | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 105 | `social.follower_growth` | marketing | Sheet `Social_Metrics` | OTHER_EXTERNAL_API or MANUAL_INPUT_REQUIRED | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 106 | `social.channel_performance` | marketing | Sheet `Social_Metrics, Social_Channel_Performance` | OTHER_EXTERNAL_API + SHOPIFYQL (attributed sessions/sales) | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 107 | `social.mentions_by_channel` | marketing | Sheet `Social_Channel_Performance` | OTHER_EXTERNAL_API or MANUAL_INPUT_REQUIRED | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 108 | `collabs.active` | marketing | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 109 | `collabs.reach` | marketing | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 110 | `collabs.by_category` | marketing | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 111 | `traffic.attribution` | marketing | ShopifyQL `traffic_attribution` | SHOPIFYQL (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 112 | `ambassadors.active` | marketing | Sheet `Affiliate_Ambassador_Perf` | SHOPIFY_PLUS_EXTERNAL (partner registry internal) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 113 | `ambassadors.sessions` | marketing | Sheet `Affiliate_Ambassador_Perf` + ShopifyQL `affiliate_sessions` | SHOPIFYQL + CONFIGURATION (code/UTM → partner map) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 114 | `ambassadors.revenue` | marketing | Sheet `Affiliate_Ambassador_Perf` + ShopifyQL `affiliate_sales` | SHOPIFYQL + CONFIGURATION (code → partner map) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 115 | `ambassadors.top` | marketing | Sheet `Affiliate_Ambassador_Perf` + ShopifyQL | SHOPIFY_PLUS_EXTERNAL (partner registry internal) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 116 | `marketing.affiliate_roi_message` | marketing | n/a | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 117 | `marketing.campaign_roi` | marketing | n/a | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 118 | `marketing.content_conversion` | catalog: Marketing Intelligence | catalog says: GA4/ad/content tracking | OTHER_EXTERNAL_API | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 119 | `sources.freshness` | executive, insights | all source statuses | Derived from source statuses (no Sheets data needed once Sheets are retired) | **UNKNOWN** | Not migrated. Serving: current source (Sheets where applicable). |
| 120 | `sources.historical_completeness` | insights | Shopify Admin | SHOPIFY_DIRECT (current) | **READY** | No Sheets dependency. Shopify path hardened (C-1..C-4); unit-tested. Live check BLOCKED (no credentials in env). |
| 121 | `quality.unclassified_channel` | insights | Sheet `Channel_Mapping` + ShopifyQL native_channels | SHOPIFYQL + CONFIGURATION | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 122 | `quality.klaviyo_no_activity` | insights | Klaviyo API | KLAVIYO_DIRECT (current) | **READY** | LIVE 2026-09-28: value present, source `current`, via the real runtime (tests/live/klaviyo.live.ts). |
| 123 | `quality.sop_validation` | insights | S&OP workbook inspection (live-runtime.ts:610) | HISTORICAL_MIGRATION (S&OP workbook) / INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 124 | `alerts.low_inventory` | insights | n/a | SHOPIFY_DIRECT + CONFIGURATION | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 125 | `alerts.conversion_decline` | catalog: Insights and Data Quality | catalog says: Shopify funnel and Rules_Targets | SHOPIFY_DERIVED + CONFIGURATION (thresholds) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 126 | `alerts.refund_increase` | catalog: Insights and Data Quality | catalog says: Shopify returns/refunds and Rules_Targets | SHOPIFY_DERIVED + CONFIGURATION (thresholds) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 127 | `alerts.fulfillment_backlog` | catalog: Insights and Data Quality | catalog says: Shopify orders/fulfillments and Rules_Targets | SHOPIFY_DERIVED + CONFIGURATION (thresholds) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 128 | `actions.assign` | catalog: Insights and Data Quality | catalog says: Write workflow | UNKNOWN (catalog-only, business rule / NOT_V1) | **UNKNOWN** | Not migrated. Serving: current source (Sheets where applicable). |
| 129 | `recommendations.ai` | catalog: Insights and Data Quality | catalog says: Future AI system | UNKNOWN (catalog-only, business rule / NOT_V1) | **UNKNOWN** | Not migrated. Serving: current source (Sheets where applicable). |
| 130 | `partners.performance` | growth | Sheet `Affiliate_Ambassador_Perf` + ShopifyQL `affiliate_sales` | SHOPIFY_PLUS_EXTERNAL (partner registry internal) | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 131 | `growth.open_pipeline` | catalog: Growth Intelligence | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB / CRM) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 132 | `growth.open_pipeline_value` | growth | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB / CRM) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 133 | `growth.closed_pipeline` | growth | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB / CRM) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 134 | `growth.pipeline_by_type` | growth | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB / CRM) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 135 | `growth.next_actions` | growth | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB / CRM) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 136 | `growth.weighted_pipeline` | growth | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB / CRM) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 137 | `growth.time_to_close` | growth | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB / CRM) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 138 | `growth.time_to_close_target` | growth | Sheet `Metric_Targets` | CONFIGURATION | **CONFIG** | Not migrated. Serving: current source (Sheets where applicable). |
| 139 | `growth.weighted_by_industry` | growth | Sheet `Growth_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB / CRM) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 140 | `investors.count` | growth | Sheet `Investor_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 141 | `investors.pipeline` | growth | Sheet `Investor_Pipeline` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 142 | `grants.secured` | growth | Sheet `Grants` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 143 | `grants.submitted` | growth | Sheet `Grants` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 144 | `grants.acceptance_rate` | growth | Sheet `Grants` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 145 | `grants.rolling` | growth | Sheet `Grants` | MANUAL_INPUT_REQUIRED (→ INTERNAL_DB) | **MANUAL** | Not migrated. Serving: current source (Sheets where applicable). |
| 146 | `finance.actual_expenses` | financial | Sheet `Finance_Actuals` | OTHER_EXTERNAL_API (accounting system) or MANUAL_INPUT_REQUIRED | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 147 | `finance.expense_composition` | financial | Sheet `Finance_Actuals` | OTHER_EXTERNAL_API (accounting system) or MANUAL_INPUT_REQUIRED | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 148 | `finance.cash_position` | financial | Sheet `Cash_Position` | OTHER_EXTERNAL_API (bank) or MANUAL_INPUT_REQUIRED | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 149 | `finance.budget_vs_actual` | financial | n/a in runtime | CONFIGURATION (budget) + SHOPIFYQL actuals | **CONFIG** | Not migrated. Serving: current source (Sheets where applicable). |
| 150 | `finance.actual_margin` | financial | catalog says: Eligible Shopify product revenue and corrected Budget V5 SKU COGS | SHOPIFY_PLUS_EXTERNAL | **PARTIAL** | Shopify side built + reconciler unit-tested. Live parity NOT RUN (SHOPIFY_* / GOOGLE_* unset). Serving: Sheets. |
| 151 | `finance.monthly_burn` | financial | catalog says: PRODUCTION Finance_Actuals | OTHER_EXTERNAL_API (accounting system) or MANUAL_INPUT_REQUIRED | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 152 | `finance.cash_runway` | financial | catalog says: PRODUCTION Cash and approved burn | OTHER_EXTERNAL_API + INTERNAL_DB | **EXTERNAL_API** | Not migrated. Serving: current source (Sheets where applicable). |
| 153 | `finance.fairafric_rebate` | catalog: Financial Intelligence, Operations Intelligence | catalog says: No approved source — a signed Fairafric rebate agreement registry does not e | INTERNAL_DB_REQUIRED + MANUAL (supplier agreement) | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 154 | `finance.effective_cogs` | financial | Sheet `COGS_By_SKU, Inventory_Lots, Production_Orders` | INTERNAL_DB_REQUIRED | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 155 | `finance.rebate_tier` | financial | catalog says: Fairafric invoices and approved effective-dated rebate rules | INTERNAL_DB_REQUIRED + MANUAL (supplier agreement) | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 156 | `finance.rebate_tiers` | financial | catalog says: Fairafric invoices and approved effective-dated rebate rules | INTERNAL_DB_REQUIRED + MANUAL (supplier agreement) | **INTERNAL_DB** | Not migrated. Serving: current source (Sheets where applicable). |
| 157 | `finance.predictive_cashflow` | catalog: Financial Intelligence | catalog says: Future model | UNKNOWN (NOT_V1) | **UNKNOWN** | Not migrated. Serving: current source (Sheets where applicable). |

| Status | Metrics |
|---|---|
| READY | 38 |
| PARTIAL | 37 |
| READY (Klaviyo, live-validated) | 21 (14 with values, 7 genuine no_activity); 2 BLOCKED on optional demographic config |
| INTERNAL_DB | 19 |
| MANUAL | 17 |
| EXTERNAL_API | 12 |
| UNKNOWN | 8 |
| CONFIG | 3 |
