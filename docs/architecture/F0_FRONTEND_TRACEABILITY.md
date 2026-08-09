# F0 Frontend Traceability

Status values: KEEP, REBUILD_TO_MATCH, CONDITIONAL, REMOVE_FROM_V1.

All listed metric keys are existing B5/B7 fields. `BRR` means `BUSINESS_RULE_REQUIRED`, `DP` means
`DATA_PENDING`, and `SL` means `SOURCE_LIMITED`.

| Demo page/element                                     | V1/B7 field or state                                                                 | Frontend pattern         | F3 page         | Decision         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ | --------------- | ---------------- |
| Global sidebar/topbar/header/date/source pill         | Page metadata, supported filters, source statuses                                    | Shell controls           | All             | REBUILD_TO_MATCH |
| Global search                                         | No approved search contract                                                          | None                     | All             | REMOVE_FROM_V1   |
| Notifications                                         | Source/readiness warnings replace decorative notification control                    | Readiness surface        | All             | REMOVE_FROM_V1   |
| Profile/Administrator                                 | No auth/account contract                                                             | Internal-dashboard label | All             | REMOVE_FROM_V1   |
| Export                                                | B7 export catalog                                                                    | Export control           | Supported pages | REBUILD_TO_MATCH |
| Executive: Net revenue                                | `commerce.net_sales` (BRR)                                                           | KPI                      | Executive       | CONDITIONAL      |
| Executive: Orders                                     | `commerce.orders` (BRR)                                                              | KPI                      | Executive       | CONDITIONAL      |
| Executive: AOV                                        | `commerce.average_order_value` (BRR)                                                 | KPI                      | Executive       | CONDITIONAL      |
| Executive: Repeat customer rate                       | `customers.returning_rate`                                                           | KPI                      | Executive       | REBUILD_TO_MATCH |
| Executive: Revenue momentum/target                    | `commerce.sales_trend`, `plan.revenue_variance` (BRR)                                | Trend chart              | Executive       | CONDITIONAL      |
| Executive: Business health                            | `executive.business_health_score` (BRR)                                              | Score card               | Executive       | CONDITIONAL      |
| Executive: Sales by channel                           | `commerce.native_channel_mix` (BRR)                                                  | Breakdown card           | Executive       | CONDITIONAL      |
| Executive: priorities/brief                           | `executive.recommendations` (BRR) plus source warnings                               | Insight list/banner      | Executive       | CONDITIONAL      |
| Revenue: Net/gross/discount/refund/shipping/tax/total | `commerce.*` sales fields (BRR)                                                      | KPI/summary set          | Revenue         | CONDITIONAL      |
| Revenue: month-end predictive forecast                | `commerce.predictive_forecast` (`NOT_V1`)                                            | None                     | Revenue         | REMOVE_FROM_V1   |
| Revenue: actual versus target                         | `commerce.sales_trend`, `plan.revenue_variance` (BRR)                                | Trend chart              | Revenue         | CONDITIONAL      |
| Revenue: channel contribution                         | `commerce.native_channel_mix` (BRR)                                                  | Breakdown card           | Revenue         | CONDITIONAL      |
| Revenue: driver waterfall                             | sales fields (BRR), customer counts where certified                                  | Waterfall                | Revenue         | CONDITIONAL      |
| Revenue: purchase windows                             | `commerce.purchase_heatmap` (BRR)                                                    | Heatmap                  | Revenue         | CONDITIONAL      |
| Customers: Active customers                           | `customers.active` (BRR)                                                             | KPI                      | Customers       | CONDITIONAL      |
| Customers: Repeat rate                                | `customers.returning_rate`                                                           | KPI                      | Customers       | REBUILD_TO_MATCH |
| Customers: Estimated CLV/LTV trend                    | `customers.realized_ltv` (BRR)                                                       | KPI/trend                | Customers       | CONDITIONAL      |
| Customers: At-risk segment                            | `customers.rfm` (BRR); no prediction                                                 | KPI/breakdown            | Customers       | CONDITIONAL      |
| Customers: Acquisition funnel                         | `commerce.web_funnel`                                                                | Funnel                   | Customers       | REBUILD_TO_MATCH |
| Customers: Cohorts                                    | `customers.cohorts` (SL)                                                             | Cohort matrix            | Customers       | CONDITIONAL      |
| Customers: Value mix                                  | `customers.rfm` (BRR)                                                                | Breakdown card           | Customers       | CONDITIONAL      |
| Products: Units sold                                  | `products.units_sold`                                                                | KPI                      | Products        | REBUILD_TO_MATCH |
| Products: Sell-through                                | `inventory.sell_through` (BRR)                                                       | KPI                      | Products        | CONDITIONAL      |
| Products: Inventory value                             | `inventory.value` (BRR)                                                              | KPI                      | Products        | CONDITIONAL      |
| Products: Stockout risk                               | `inventory.runway_reorder` (BRR)                                                     | KPI                      | Products        | CONDITIONAL      |
| Products: Portfolio matrix                            | `products.sales`, `products.mix` (BRR), `products.units_velocity`                    | Matrix/scatter           | Products        | CONDITIONAL      |
| Products: Inventory risk                              | `inventory.shopify_current`, `inventory.runway_reorder` (BRR)                        | Ranked list              | Products        | CONDITIONAL      |
| Products: Frequently bought together                  | `products.frequently_bought_together` (BRR)                                          | Pair list                | Products        | CONDITIONAL      |
| Products: Unit velocity                               | `products.units_velocity`                                                            | Trend chart              | Products        | REBUILD_TO_MATCH |
| Marketing: marketing revenue                          | Re-label to `klaviyo.attributed_revenue` (DP); no cross-channel inference            | KPI                      | Marketing       | CONDITIONAL      |
| Marketing: ROAS/CAC                                   | `marketing.roas`, `marketing.cac` (BRR)                                              | KPI/chart                | Marketing       | CONDITIONAL      |
| Marketing: Email revenue share                        | No approved share calculation; use Klaviyo overview/revenue separately               | KPI/readiness            | Marketing       | CONDITIONAL      |
| Marketing: Funnel                                     | `commerce.web_funnel`                                                                | Funnel                   | Marketing       | REBUILD_TO_MATCH |
| Marketing: Performance by channel                     | Klaviyo campaign/flow fields (DP), spend/social fields (DP); no inferred attribution | Table                    | Marketing       | CONDITIONAL      |
| Marketing: Content that converts                      | `marketing.content_conversion` (SL)                                                  | Ranked list              | Marketing       | CONDITIONAL      |
| Growth: Open pipeline                                 | `growth.open_pipeline` (DP)                                                          | KPI                      | Growth          | CONDITIONAL      |
| Growth: Weighted pipeline/value                       | `growth.weighted_pipeline` (`NOT_V1`)                                                | None                     | Growth          | REMOVE_FROM_V1   |
| Growth: Retail opportunity funnel                     | `growth.pipeline_by_type` (DP)                                                       | Funnel                   | Growth          | CONDITIONAL      |
| Growth: Active ambassadors/momentum                   | `partners.performance` (DP)                                                          | KPI/trend                | Growth          | CONDITIONAL      |
| Growth: Highest-value follow-ups                      | `growth.next_actions` (DP)                                                           | Ranked list/drill-down   | Growth          | CONDITIONAL      |
| Financial: Gross revenue                              | `commerce.total_sales` (BRR)                                                         | KPI                      | Financial       | CONDITIONAL      |
| Financial: Contribution margin                        | `finance.actual_margin` (BRR)                                                        | KPI/trend                | Financial       | CONDITIONAL      |
| Financial: Monthly burn                               | `finance.monthly_burn` (BRR)                                                         | KPI                      | Financial       | CONDITIONAL      |
| Financial: Cash runway                                | `finance.cash_runway` (BRR)                                                          | KPI/gauge                | Financial       | CONDITIONAL      |
| Financial: Profit trend                               | sales (BRR), `finance.actual_expenses` (DP), margin (BRR)                            | Trend chart              | Financial       | CONDITIONAL      |
| Financial: Predictive cash scenarios                  | `finance.predictive_cashflow` (`NOT_V1`)                                             | None                     | Financial       | REMOVE_FROM_V1   |
| Financial: Cost structure                             | `finance.expense_composition` (DP)                                                   | Breakdown card           | Financial       | CONDITIONAL      |
| Insights: priority recommendations                    | approved deterministic alerts/recommendations (BRR/DP)                               | Insight cards            | Insights        | CONDITIONAL      |
| Insights: Assign action                               | `actions.assign` (`NOT_V1`)                                                          | None                     | Insights        | REMOVE_FROM_V1   |
| Insights: Evidence/pipeline links                     | B7 page state and approved drill-downs                                               | Read-only actions        | Insights        | REBUILD_TO_MATCH |
| Insights: Data validation matrix                      | source/metric readiness, freshness, history completeness                             | Summary + table          | Insights        | REBUILD_TO_MATCH |
| Operations: represented/current inventory             | `inventory.shopify_current`                                                          | KPI/table                | Operations      | REBUILD_TO_MATCH |
| Operations: shipped/delivered                         | `operations.shipped_delivered` (SL)                                                  | KPI/list                 | Operations      | CONDITIONAL      |
| Operations: fulfillment summary                       | `operations.fulfillment_summary` (BRR)                                               | Chart/list               | Operations      | CONDITIONAL      |
| Operations: combined inventory/lots                   | `inventory.combined`, `inventory.lots` (DP)                                          | KPI/table                | Operations      | CONDITIONAL      |
| Operations: FEFO/runway/reorder                       | `inventory.fefo`, `inventory.runway_reorder` (BRR)                                   | Alert/table              | Operations      | CONDITIONAL      |
| Operations: forecast variance                         | `forecast.variance` (DP)                                                             | Comparison chart/table   | Operations      | CONDITIONAL      |
| Operations: production/incoming/costs                 | `production.incoming`, `production.timeline`, `production.cost_payment` (DP)         | Timeline/table           | Operations      | CONDITIONAL      |
| Operations: additional depletions                     | `inventory.depletions` (DP)                                                          | Breakdown/table          | Operations      | CONDITIONAL      |

Every demo data-bearing element is accounted for above. Visual shells remain even when Conditional,
but production values remain null until B7 readiness permits them.
