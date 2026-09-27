# Configuration Layer

**Source:** `config/zacao-business-config.json`, validated at module load by `src/domain/configuration/business-config.ts` (zod, `.strict()`). An invalid file fails at startup; it cannot change a classification silently at request time. Loaded by `src/infrastructure/config/business-config.ts`.

**Rule:** a value enters this file only with its evidence. Spreadsheet-owned values are **exported from the workbook**, never re-typed from memory.

## Migrated values

| Key | Value | Evidence | Used by |
|---|---|---|---|
| `lineItemClassification.feeSkus[]` | `FAIRE-COMMISSION` (marketplace_commission), `FAIRE-PAYMENT-PROCESSING-FEE` (payment_processing_fee) | Live store read 2026-09-27: 34 each, no product or variant | `src/infrastructure/shopify/line-items.ts` (C-4) |
| `shopify.orders.pageSize` / `maxPages` | 25 / 400 | 25 was the existing runtime page size (cost of nested line items); 400 pages = 10,000 orders per window, and truncation beyond that is reported | `live-runtime.ts`, `tests/live/parity.live.ts` |
| `shopify.catalog.pageSize` / `maxPages` | 25 / 20 | Existing runtime values (store has 6 products) | same |
| `shopify.analyticsMaxThrottleWaitMs` | 75,000 | One ShopifyQL window (60 s) plus jitter margin, from live throttle payloads | `ShopifyGraphQlClient` |

## Pending: owned by the workbook, must be exported before moving

| Configuration | Current home | Why not migrated yet |
|---|---|---|
| Channel mapping (raw channel → DTC/retail) | Sheet `Channel_Mapping` | Values not visible without Google access. Shopify channel names are verified (8 values), but the mapping is a business decision |
| Pack size (bars per variant), canonical SKU id | Sheet `SKU_Master` | Same. A Shopify variant metafield is a candidate home (needs a write workflow outside this read-only app) |
| Location codes ↔ Shopify `Location.id` | Sheet `Location_Master` | Needs a `shopify_location_id` column; name joins are ambiguous (two `SNAPL`) |
| Targets: `target_landed_cogs_per_bar`, `inventory.stock_min/max`, time-to-close | Sheet `Metric_Targets` | Business-owned, effective-dated |
| Channel economics (price per bar, fee rates, $2.494 COGS) | `src/domain/metrics/channel-economics.ts` | Already code configuration, but most rates are PLACEHOLDERs pending ZACAO approval. Faire fees can be read from Shopify fee lines once reconciled |

## Environment-driven

`ZACAO_SOURCE_MODE` (see MIGRATION_STATUS.md §4), plus the existing provider credentials.
