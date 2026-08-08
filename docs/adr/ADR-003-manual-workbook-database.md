# ADR-003 — Manual-workbook database (Supabase Postgres) and dashboard import flow

Status: Accepted 2026-08-08 (DEC-017)

## Problem

The Conditional/manual analytics (inventory snapshots, lots, depletions, incoming
production, marketing spend, social metrics, partner performance, growth pipeline,
finance actuals, cash position) were designed to be read live from allowlisted Google
Sheets. No Google service account was ever provisioned, the PRODUCTION workbook stayed
empty, and mutable Sheets cannot preserve history when rows are overwritten — one of the
documented database revisit triggers in the approved Deliverable Plan (§13.2).

ZACAO issued a final input workbook (`ZACAO_Dashboard_V1_Input_Workbook.xlsx`) with a
machine-readable `Data_Dictionary` (299 column definitions), controlled vocabularies
(`Lists`), master tabs (`SKU_Master`, `Location_Master`, `Source_Registry`), and a
per-row `source_status` flag, and asked for the data to be saved into a database through
a dashboard upload flow instead of read from Google.

## Decision

1. **Database re-entry** (revises the no-database posture for this scope only): a
   **Supabase Postgres** database stores the manual input data. The database is the
   dashboard's own durable store — it is *not* a source system; Shopify, Klaviyo, and
   Google sources remain strictly read-only.
2. **Driver**: `postgres` (postgres.js), no ORM. Runtime queries use the Supabase
   transaction pooler (`prepare: false`); migrations use the session connection
   (`DATABASE_MIGRATE_URL`, falling back to `DATABASE_URL`). Migrations are plain
   ordered SQL files applied by `scripts/db/migrate.mjs` with a `schema_migrations`
   ledger.
3. **Versioned imports**: every save creates one `import_batches` row per tab, grouped
   by a shared `upload_id`; the whole save is one transaction. The dashboard reads the
   latest committed batch per tab and only rows with `source_status = 'production'`.
   Prior batches are never deleted — history survives overwrites.
4. **Generated contracts**: tab/column contracts and the DDL are generated from the
   workbook's own `Data_Dictionary` and `Lists` tabs by `scripts/db/generate-contracts.mjs`
   and checked in; a drift-guard test regenerates from the pristine fixture and diffs.
5. **Google Sheets path dropped**: the deferred Google Sheets contributors are replaced
   by manual-workbook contributors. Google adapters stay in the tree, unwired. Budget
   and S&OP dependent metrics keep their `google_sheets`/`google_drive` source keys and
   remain truthfully `not_configured`.
6. **New source key** `manual_workbook` is added to the source enum so freshness,
   readiness, and metric source labels stay truthful.

## Mapping decisions (workbook columns → existing metric builders)

The dormant builders in `src/application/metrics/manual.ts` and `conditional.ts` are
reused unchanged. The workbook's snake_case columns are mapped in
`src/infrastructure/manual-workbook/records.ts` / `facts.ts`:

- `Growth_Pipeline`: `pipeline_status` values map `open → "Open"`; `opportunity →
  "Opportunity Name"`; `record_id → "Opportunity ID"`; `next_action_date → "Due Date"`.
- `Finance_Actuals`: `period` (`YYYY-MM`) maps to `"Date" = YYYY-MM-01`. Month
  granularity: a month counts toward the selected range when its first day is in range.
- `Affiliate_Ambassador_Perf`: `period` (`YYYY-MM`) derives `"Period Start"`/`"Period
  End"` as the month bounds; `partner_name → "Partner"`; partner type is not captured
  by the workbook and stays null.
- `Production_Orders`: `poLine ← record_id`; the workbook has no destination warehouse,
  so `destinationWarehouse ← "Unassigned"` with warning `PRODUCTION_DESTINATION_UNSPECIFIED`;
  rows without `expected_date` are excluded from the incoming table; incoming statuses
  are `open, confirmed, in_production, in_transit, partially_received`; `unitsReceived`
  is null unless `received_date` is present.
- `Cash_Position`: the workbook models one company-wide balance per date, so
  `account ← "all_accounts"` and account coverage is complete when any production row
  exists for the latest `as_of_date`.
- `Inventory_Lots`: `asOfDate ← data_as_of` (row) falling back to the batch upload date;
  `lot_number → lotCode`.
- `Inventory_Snapshots`: `quantity ← on_hand`; `asOfDate ← date(snapshot_at)`; required
  warehouses are active `Location_Master` rows, and coverage is complete when each
  appears at the latest snapshot date.

Metrics that stay unwired (truthfully pending): `forecast.variance` (needs a
Shopify-actuals join), `finance.budget_vs_actual` (needs the Budget plan source),
`production.timeline` and `production.cost_payment` (no approved builders yet).

## Security

Dashboard V1 has no application login (approved scope). The import endpoints write only
to the dashboard's own database, enforce a 10 MB size cap and `.xlsx` magic-byte check,
re-validate on commit, and never modify Shopify, Klaviyo, or Google data. Production
deployments must sit behind the approved Vercel deployment protection before the import
page is exposed beyond the internal team.

## Alternatives considered

- SQLite local file: zero setup but not deployable to Vercel serverless.
- Turso/libSQL: viable, but ZACAO selected Supabase.
- Drizzle/Supabase JS client: unnecessary surface; plain SQL through postgres.js keeps
  the dependency budget at one package and the queries reviewable.

## Rollback

Unset `DATABASE_URL` — the runtime reverts to deferred `not_configured` behavior for
`manual_workbook` and no import writes are possible. Dropping the schema removes all
imported data; source systems are unaffected.
