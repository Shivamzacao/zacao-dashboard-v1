# Operations Intelligence — Shopify activation evidence

Status: PASS, with two pre-existing baseline failures explicitly not addressed here.
Date: 2026-08-09
Governing decisions: DEC-016 (existing), DEC-018 and DEC-019 (proposed, pending ZACAO confirmation)

## Why

The Operations page rendered genuine values in 2 of 11 surfaces. The question raised was
whether Shopify could supply the rest instead of the pending workbook. It can supply part
of it, and one surface was not waiting on data at all.

## What changed

| Surface | Before | After | Basis |
| --- | --- | --- | --- |
| Current Shopify inventory | Sum of all 7 provider quantity states | Provider `available` only; every state still in the breakdown | DEC-018 |
| Shipped and delivered counts | `SOURCE_LIMITED`, value always null | Delivered headline, shipped in breakdown, carrier coverage disclosed | DEC-016 / DEC-019 |
| Fulfillment trend | Not present; monthly data fetched then discarded | Provider `orders_fulfilled` per month, no additional request | DEC-019 |
| Units sold by SKU (chart + table) | Present only on Product Intelligence | Also on Operations, unchanged status and calculation | DEC-019 |
| Combined inventory, lots & FEFO, forecast variance, incoming production | `DATA_PENDING` | Unchanged | Workbook-only sources |

### The inventory defect

`buildInventoryBreakdown` summed every fact returned by `mapInventoryFacts`, which emits one
fact per quantity state. `PRODUCTS_QUERY` requests seven states, and they overlap — `on_hand`
already contains `available` and `committed`. Against the audited SNAPL figures
(`docs/research/02_SHOPIFY_DATA_AUDIT.md:78-84`) the headline read `available 56 +
committed 4 + on_hand 60 = 120`, which corresponds to no real quantity. The headline is now
`available` alone. A regression test pins this.

### Why the shipped/delivered tile was not a data problem

The `shopify-fulfillment` contributor already reads
`FROM fulfillments SHOW orders_fulfilled, orders_shipped, orders_delivered TIMESERIES month`,
and the same three counts already rendered in the Fulfillment status chart. The tile was
gated by `status: "SOURCE_LIMITED"` in the catalog, which nulls the value before any data is
consulted. DEC-016 approved passing these aggregates through "with ... disclosed
carrier-coverage limits" — disclosure, not suppression.

## Deliberately not done

- **Days of cover / runway / reorder** — `B5_METRIC_STATUS.md:11` bars `products.units_velocity`
  from driving days-on-hand, stockout, or reorder calculations, and `inventory.runway_reorder`
  needs lead time and safety buffer that only the workbook supplies.
- **Sell-through** — the `inventory_history` ShopifyQL dataset exists but is unwired.
  `inventory.sell_through` is `BUSINESS_RULE_REQUIRED`, and audit §7.3 records legacy/deleted
  SKUs and a 1,647-unit blank-product bucket in the provider's historical inventory. Needs a
  formula decision plus a catalog-hygiene rule.
- **Forecast variance** — Shopify has no plan data; the forecast rows must come from the workbook.
- **Combined SNAPL/YBYD, lots & FEFO, incoming production** — Shopify cannot source these.
  YBYD is an inactive Shopify location with no inventory levels (audit:85), and Shopify has
  no lot or best-by fields (audit:29).

## Verification

- `pnpm typecheck` — passed.
- `pnpm lint` — passed, zero warnings.
- `pnpm format:check` — passed.
- `pnpm test` — 51 files, 271 tests passed (263 before; 8 added).
- `pnpm test:f3` — 6 passed.
- `pnpm test:f3:browser` — 18 passed, 2 failed.

### The two browser failures are pre-existing

`customers` and `marketing` at the desktop viewport fail. Verified by stashing this change
and re-running against the clean tree: the same 2 tests failed and no others. They are
therefore stale baselines from earlier work, not a regression here.

`f3-operations-{desktop,tablet}` and `f3-products-{desktop,tablet}` baselines were
regenerated, scoped with `-g "operations|products"`. The customers and marketing baselines
were **not** regenerated — refreshing them would bake in drift whose cause has not been
established, and would hide whatever earlier change produced it. That drift needs its own
investigation.

### Rendered confirmation

Fixture mode (`ZACAO_DATA_MODE=fixture`, the default), `/operations`:

- Current Shopify inventory (available) — 208, the two `available` fixture rows, excluding
  the overlapping `on_hand` rows.
- Shipped and delivered counts — 96, no longer a "Source limited" empty state.
- Fulfillment trend — monthly series renders.
- Units sold by SKU chart and Units sold detail table render, export enabled.
- Combined inventory, Forecast variance, Incoming production, Inventory lots & FEFO — still
  "Data pending" with their specific reasons.

Browser console: no errors. Dev server log: no errors.

## Follow-ups found, not addressed

- `inventory.combined` derives required warehouses from active `Location_Master` rows, and
  the delivered workbook marks YBYD `is_active = 'no'`. A metric named "Combined SNAPL/YBYD
  inventory" can therefore report complete coverage from SNAPL alone, contradicting audit:85.
- `inventory.fefo` declares `sourceKeys: ["google_sheets"]` while lot data now lands in
  `manual_workbook`, so best-by/FEFO stays `not_configured` even after a fully populated
  import — while the table card is titled "Inventory lots & FEFO".
