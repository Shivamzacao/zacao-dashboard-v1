# F0 Visual and Frontend Scope Contract

Status: Audited; awaiting ZACAO F0 approval

Visual authority: [ZACAO Executive Intelligence](https://zacao-executive-intelligence.shivam922128.chatgpt.site/)

The approved demo is a single browser route with eight client-selected sections. Production V1
rebuilds those sections as App Router pages and adds Operations by composing the same shell, KPI,
chart-card, table, status, and source-footnote patterns. Demo numbers are visual fixtures only.

## Route decisions

| V1 route      | Demo section                               | B7 contract                     | Decision                                     |
| ------------- | ------------------------------------------ | ------------------------------- | -------------------------------------------- |
| `/executive`  | Executive health                           | `/api/v1/dashboards/executive`  | REBUILD_TO_MATCH                             |
| `/revenue`    | Revenue intelligence                       | `/api/v1/dashboards/revenue`    | REBUILD_TO_MATCH                             |
| `/customers`  | Customer intelligence                      | `/api/v1/dashboards/customers`  | REBUILD_TO_MATCH                             |
| `/products`   | Product intelligence                       | `/api/v1/dashboards/products`   | REBUILD_TO_MATCH                             |
| `/operations` | Not present                                | `/api/v1/dashboards/operations` | CONDITIONAL — compose approved patterns only |
| `/marketing`  | Marketing intelligence                     | `/api/v1/dashboards/marketing`  | REBUILD_TO_MATCH                             |
| `/growth`     | Growth intelligence                        | `/api/v1/dashboards/growth`     | CONDITIONAL                                  |
| `/financial`  | Financial intelligence                     | `/api/v1/dashboards/financial`  | CONDITIONAL                                  |
| `/insights`   | Insights & recommendations; validation tab | `/api/v1/dashboards/insights`   | REBUILD_TO_MATCH                             |

There are no authentication, account, admin, settings, or editing routes in V1.

## Reusable visual inventory

| Pattern               | Demo treatment                                                                         | F1–F3 decision                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Application shell     | Fixed 260 px forest sidebar; sticky 70 px top bar; cream-gray canvas                   | REBUILD_TO_MATCH                                                                                         |
| Sidebar navigation    | Brand lockup, workspace tile, eight section buttons, source status, profile affordance | REBUILD; add Operations; replace profile with non-interactive internal-workspace label                   |
| Top bar               | Search, notifications, date range, export                                              | REBUILD shell; remove search and notification behavior until supported; enable approved CSV exports only |
| Page header           | Terracotta eyebrow, Georgia title, muted description, sample/source pill               | REBUILD; pill must say TEST/synthetic or truthful production freshness                                   |
| Attention banner      | Icon, short executive brief, right-aligned action                                      | CONDITIONAL; only approved deterministic insights/readiness                                              |
| KPI card              | Four-card grid, label/help affordance, serif value, delta pill, sparkline              | REBUILD; null values render readiness, never demo numbers                                                |
| Chart card            | Kicker, serif title, description, status/legend, visualization, source footnote        | REBUILD                                                                                                  |
| Table/list card       | Same card shell with semantic rows, status badges, bounded controls                    | REBUILD                                                                                                  |
| Funnel                | Horizontal labelled stages and conversion percentages                                  | REBUILD                                                                                                  |
| Heatmap/cohort/matrix | Labelled cells plus legend/text meaning                                                | CONDITIONAL to the metric's readiness                                                                    |
| Insight card          | Severity accent, evidence text, confidence/source chips, read-only action              | REBUILD; remove assignment/write actions                                                                 |
| Validation matrix     | Summary counters and metric/source/readiness table                                     | REBUILD from B7 metric and source readiness                                                              |
| Tooltip/help          | Help and chart-option buttons are visually present but inert in the demo               | REBUILD only with accessible explanatory content; remove inert chart menus                               |
| Drill-down            | Demo uses navigation/action buttons, not a functioning drawer                          | REBUILD only for B7-approved datasets using the existing card visual language                            |
| Loading/empty/error   | Not demonstrated                                                                       | REBUILD using the card geometry and B7 readiness states                                                  |

## Global control contract

- Default period is rolling last 12 months, replacing the demo's mock 90-day default.
- Period, comparison, channel, SKU/product, and location controls appear only when B7 reports support.
- Comparison and dimension filters reuse the demo's 35 px date-control visual pattern.
- Filters are URL-backed in F1; no browser parameter selects TEST versus PRODUCTION.
- Export uses only the B7 allowlisted dataset/field contract and preserves current filters.
- Search is REMOVE_FROM_V1 as an interaction because no approved searchable-object API exists. Its
  top-bar space may remain empty; do not ship decorative search.
- Notifications are REMOVE_FROM_V1 as an interaction. Source warnings belong in readiness surfaces.
- Chart option ellipses are REMOVE_FROM_V1 unless an approved action exists.
- Demo profile/Administrator control is REMOVE_FROM_V1 and becomes a non-interactive “Internal
  dashboard” treatment.
- “Assign action” is REMOVE_FROM_V1 because `actions.assign` is `NOT_V1` and V1 is read-only.

## Responsive contract

Desktop baseline is `1280 × 720`; tablet landscape baseline is `1024 × 768`. These reflect the
demo's real 260 px sidebar and its first responsive change at `1050px`. Exact demo media rules are:

- `≤1050px`: KPI grid becomes two columns and dashboard grid becomes one column.
- `≤780px`: sidebar becomes an off-canvas panel, main loses its left margin, top-bar gutter becomes
  18 px.
- `≤580px`: KPI grid becomes one column, top bar becomes auto-height, chart padding becomes 15 px.

F1/F4 must preserve no horizontal clipping. Desktop and tablet are primary; `≤780px` receives the
approved safe read-only navigation behavior without redesigning pages mobile-first.

## Operations treatment

Operations uses only existing demo patterns:

1. Standard page header and source/freshness pill.
2. Four KPI cards for represented inventory, shipped/delivered readiness, combined inventory, and
   inventory runway/reorder readiness.
3. A primary chart/table card for fulfillment and current Shopify inventory.
4. Supporting cards for combined inventory, lots/FEFO, forecast variance, incoming production,
   production timeline, costs/payment, and depletions.
5. Every Conditional card remains in place with its truthful B7 readiness state; no synthetic
   production value is shown.

## State contract

All KPI, chart, list, and table shells support READY/current, PARTIAL, no activity/EMPTY,
NOT_CONFIGURED/data source not ready, BUSINESS_RULE_REQUIRED, SOURCE_LIMITED,
SOURCE_UNAVAILABLE, stale, invalid, and internal-error presentation. Zero is a valid value and is
not rendered as unavailable. The demo's sample pill becomes the canonical environment/freshness
indicator.

## Accessibility baseline

- Heading hierarchy is usable (`h1` page title and `h2` card titles), but many supporting labels are
  only 7–9 px and must be increased while preserving hierarchy.
- Several muted pairs fail WCAG 2.2 AA, including `#6c7b75` on `#f7f7f3` (4.14:1), pale metadata
  near 2.6–3.2:1, green status text near 4.1:1, and white text on the light product bubble near
  2.9:1. F1/F2 must select the nearest approved darker brand token that passes.
- The demo exposes no authored `:focus` or `:focus-visible` rule; browser-default blue focus appears.
  F1 must add a consistent visible brand-compatible focus ring.
- Icon-only controls have useful accessible names in several cases; this must be required for all.
- Charts have some image descriptions, but F2 must provide summaries and accessible tables where
  the architecture requires them. Color cannot be the only status/series signal.
- Tablet layout is usable at 1024 px. Keyboard order, drawers, and focus return require F1/F2 tests.
