# Internal Data Store: Design Only (not implemented)

**Status: BLOCKED BY DECISION.** Locked decision DEC-003 states "no primary database in active V1". DEC-017/ADR-003 briefly re-introduced Supabase, and commit `5629b9c` then removed it. Building a database now would contradict the locked baseline, so this document gives the minimum schema only. Implementation needs an explicit ZACAO decision recorded as a new DEC entry.

## Scope

Only data Shopify, Klaviyo and ad/social APIs cannot provide, verified in the live capability audit:

1. COGS components, effective-dated
2. Purchase orders and receipts
3. Inventory lots / best-by
4. Packaging materials, stock, orders, forecast
5. Demand forecast
6. Additional depletions (non-sale stock movements)
7. Partner / affiliate registry (code/UTM → partner, commission terms)
8. Growth / collaboration pipeline
9. Investor pipeline (restricted access)
10. Grants
11. Finance actuals and cash position, unless an accounting/bank API is approved

## Conventions for every table

`id` (uuid), `created_at`, `updated_at`, `updated_by`, `source` (`manual` | `import:<workbook-id>` | `api:<name>`), `status` (`draft` | `active` | `superseded` | `void`), `source_reference`, plus `effective_from` / `effective_to` where values change over time. SKUs and locations reference Shopify GIDs (`variant_id`, `location_id`), never SKU text.

## Minimum schema (sketch)

```sql
-- COGS: one row per variant × component × effective period
create table cogs_component (
  id uuid primary key, variant_id text not null, component text not null
    check (component in ('production','packaging','freight','fulfillment','duties_insurance_receiving')),
  unit_cost_usd numeric(12,4) not null, cost_basis text not null check (cost_basis in ('landed','standard')),
  supplier text, effective_from date not null, effective_to date,
  source text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null, updated_by text not null
);
create table purchase_order (id uuid primary key, po_number text not null unique, supplier text not null,
  order_date date not null, expected_date date, confirmed_date date, production_start_date date,
  destination_location_id text, status text not null, source text not null, created_at timestamptz not null, updated_at timestamptz not null);
create table purchase_order_line (id uuid primary key, purchase_order_id uuid not null references purchase_order(id),
  variant_id text not null, units integer not null, unit_cost_usd numeric(12,4) not null, freight_usd numeric(12,2),
  received_date date, received_units integer, accepted_units integer);
create table inventory_lot (id uuid primary key, location_id text not null, variant_id text not null, lot_number text not null,
  po_line_id uuid references purchase_order_line(id), received_date date, best_by_date date not null,
  quantity_received integer not null, quantity_remaining integer not null, status text not null);
create table stock_movement (id uuid primary key, movement_date date not null, location_id text not null,
  variant_id text not null, quantity integer not null, reason text not null, source text not null);
-- packaging_material / packaging_stock / packaging_order / packaging_forecast,
-- demand_forecast (version, week_start, variant_id, channel, units, status),
-- partner (code_or_utm, commission terms), pipeline_opportunity, investor_opportunity (restricted),
-- grant_application, finance_actual (period, account, amount), cash_position (as_of, balance)
```

Migration into it is a one-time, versioned import from the workbook (HISTORICAL_MIGRATION), then an admin UI replaces the tabs.
