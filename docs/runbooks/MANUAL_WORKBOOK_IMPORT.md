# Runbook — Manual workbook import (Supabase Postgres)

Governing decisions: DEC-017 and [ADR-003](../adr/ADR-003-manual-workbook-database.md).

## One-time setup

1. Create a Supabase project (Postgres). From **Connect**, copy:
   - the **transaction pooler** URI (port `6543`) → `DATABASE_URL`
   - the **session** connection (port `5432`) → `DATABASE_MIGRATE_URL`
2. Put both in `.env.local` (never committed). See `.env.example`.
3. Apply the schema:

```bash
pnpm db:migrate
```

`scripts/db/migrate.mjs` records applied files in `schema_migrations` and is
safe to re-run. DDL must use the session connection — the transaction pooler
does not reliably support it.

## Importing data

1. Start the app (`pnpm dev`) and open **Data import** in the sidebar.
2. Choose the ZACAO input workbook (`.xlsx`, 10 MB max).
3. Review the per-sheet report: accepted rows, draft/example exclusions, and any
   validation issues with their exact row and column.
4. Untick sheets you do not want stored, then **Save**.

Rules enforced by the server on every save (the preview is never trusted):

- Only rows with `source_status = production` are stored; `draft`/`example` rows
  are counted and excluded; `invalid` rows are excluded and reported.
- A sheet whose headers drift from the workbook data dictionary is rejected
  (`HEADER_MISMATCH`) rather than partially imported.
- A selected sheet with zero accepted rows is refused, so a save can never blank
  an existing sheet.
- The whole save is one transaction with a shared `upload_id`; each sheet gets
  its own `import_batches` row. Dashboards read the latest committed batch per
  sheet, so previous versions remain as history.

## Regenerating contracts after a workbook revision

If ZACAO reissues the workbook with new or renamed columns:

```bash
cp <new workbook>.xlsx tests/fixtures/manual-workbook/ZACAO_Dashboard_V1_Input_Workbook.xlsx
pnpm db:generate      # rewrites contracts.generated.ts and migrations/0001_init.sql
pnpm test tests/infrastructure/manual-workbook
```

The generated migration is the initial schema. For an existing database, add a
new numbered migration under `scripts/db/migrations/` with the ALTER statements
rather than editing `0001_init.sql`.

## Sample data for testing

The real workbook ships with header-only data tabs. To exercise the flow:

```bash
node scripts/db/make-sample-workbook.mjs
```

Writes `outputs/manual-workbook-sample.xlsx` with production rows across
Marketing_Spend, Social_Metrics, Inventory_Snapshots, Inventory_Lots,
Additional_Depletions, Production_Orders, Growth_Pipeline,
Affiliate_Ambassador_Perf, Finance_Actuals, and Cash_Position.

## Verifying

```bash
curl -s localhost:3000/api/v1/sources/status | jq '.data.sources[] | {source, state}'
```

`manual_workbook` should read `current` once a batch exists, `no_activity` when
the database is empty, and `not_configured` when `DATABASE_URL` is unset.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Save button disabled, "Database not connected" | `DATABASE_URL` unset or malformed | Set it in `.env.local` and restart the server |
| `pnpm db:migrate` hangs or errors on DDL | Using the pooler URI | Set `DATABASE_MIGRATE_URL` to the session connection (port 5432) |
| Sheet rejected with `HEADER_MISMATCH` | Workbook columns changed | Regenerate contracts (above) or restore the approved headers |
| Metrics still show "Data pending" after a save | Sheet had no `production` rows | Set `source_status` to `production` on the rows that should count |
| Upload rejected at 10 MB | Workbook too large | Trim unused rows; note Vercel's serverless body limit is lower (~4.5 MB) |
