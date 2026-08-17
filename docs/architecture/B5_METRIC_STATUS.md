# B5 Metric Status and Traceability Record

Status: Definitive B5 record. Runtime keys and full machine-readable definitions live in `src/domain/metrics/catalog.ts`.

Classification totals at the B5 gate: 13 `CERTIFIABLE`, 36 `DATA_PENDING`, 39 `BUSINESS_RULE_REQUIRED`, 4 `SOURCE_LIMITED`, and 6 `NOT_V1` (98 total).

Amendment (2026-08-08, Phase 3 integration): DEC-015 activated the revenue/order/AOV/refund cluster (`commerce.net_sales`, `commerce.orders`, `commerce.average_order_value`, `commerce.sales_trend`, `commerce.gross_sales`, `commerce.discounts`, `commerce.returns`, `commerce.shipping_charges`, `commerce.taxes`, `commerce.total_sales`, `commerce.purchase_heatmap`, `products.sales`, `customers.billing_geography`) and DEC-016 approved the channel/fulfillment/mix defaults. The runtime authority for current statuses remains `src/domain/metrics/catalog.ts`; the table below records the original B5 classifications.

Reconciled before B6: the six metrics outside the four active-status counts are `commerce.predictive_forecast`, `customers.predictive_churn`, `actions.assign`, `recommendations.ai`, `growth.weighted_pipeline`, and `finance.predictive_cashflow`. All six are explicitly `NOT_V1`; no metric was unclassified.

`products.units_velocity` is descriptive observed merchandise units grouped by the requested provider reporting period. It is not the approved inventory-planning velocity policy and must not drive days on hand, projected stockout, or reorder calculations. Those calculations remain `BUSINESS_RULE_REQUIRED`.

`CERTIFIABLE` means the implementation contract can be certified after applicable source gates; it does not mean live production credentials have passed. `DATA_PENDING` permits deterministic TEST verification but no production value until genuine data exists.

| Metric | V1 section | Source(s) | Calculation/definition | Status | Blocking reason if any |
|---|---|---|---|---|---|
| commerce.net_sales | Executive; Revenue | ShopifyQL sales | Provider `net_sales` after policy approval | BUSINESS_RULE_REQUIRED | Revenue/order/refund policy |
| commerce.orders | Executive; Revenue | ShopifyQL sales | Provider aggregate orders after policy approval | BUSINESS_RULE_REQUIRED | Order inclusion policy |
| commerce.average_order_value | Executive; Revenue | ShopifyQL sales | One approved Shopify AOV definition | BUSINESS_RULE_REQUIRED | Numerator/denominator |
| customers.returning_rate | Executive; Customer | ShopifyQL classification | Provider aggregate returning rate; disclose blanks | CERTIFIABLE | — |
| commerce.sales_trend | Executive; Revenue | ShopifyQL timeseries | Period net sales after sales-policy approval | BUSINESS_RULE_REQUIRED | Revenue basis |
| commerce.native_channel_mix | Executive; Revenue | ShopifyQL + Mappings | Effective mappings; unmatched stays Unclassified | BUSINESS_RULE_REQUIRED | Production mappings/channel policy |
| operations.fulfillment_summary | Executive; Operations | Shopify fulfillment | Provider status counts under approved policy | BUSINESS_RULE_REQUIRED | Status/age/time policy |
| plan.revenue_variance | Executive; Revenue; Financial | Shopify + Budget/Forecast | Actual minus labelled Plan for matching scope | BUSINESS_RULE_REQUIRED | Actual policy and plan mapping |
| executive.business_health_score | Executive | Approved metrics | Approved weighted/normalized signals only | BUSINESS_RULE_REQUIRED | Weights and thresholds |
| executive.recommendations | Executive; Insights | Deterministic alerts | Approved deterministic ranking; no AI | BUSINESS_RULE_REQUIRED | Alert/ranking rules |
| commerce.gross_sales | Revenue | ShopifyQL | Provider `gross_sales` after policy approval | BUSINESS_RULE_REQUIRED | Revenue policy |
| commerce.discounts | Revenue | ShopifyQL | Provider value/sign; never subtract twice | BUSINESS_RULE_REQUIRED | Sign/inclusion policy |
| commerce.returns | Revenue | ShopifyQL | Provider returns under approved recognition date | BUSINESS_RULE_REQUIRED | Refund policy |
| commerce.shipping_charges | Revenue | ShopifyQL | Provider shipping shown separately | BUSINESS_RULE_REQUIRED | Revenue inclusion policy |
| commerce.taxes | Revenue | ShopifyQL | Provider taxes shown separately | BUSINESS_RULE_REQUIRED | Revenue inclusion policy |
| commerce.total_sales | Revenue | ShopifyQL | Provider `total_sales` after policy approval | BUSINESS_RULE_REQUIRED | Total-sales policy |
| products.sales | Revenue; Product | ShopifyQL product lines | Group approved merchandise sales by stable keys | BUSINESS_RULE_REQUIRED | Sales basis/line cleaning |
| products.units_sold | Revenue; Product | ShopifyQL product lines | Sum merchandise `net_items_sold` | CERTIFIABLE | — |
| commerce.purchase_heatmap | Revenue | ShopifyQL purchase time | Approved orders by New York day/hour | BUSINESS_RULE_REQUIRED | Order policy |
| commerce.detailed_order_drilldown | Revenue; Customer | Admin GraphQL | Sanitized detail only for complete requested range | SOURCE_LIMITED | Detailed history incomplete |
| commerce.predictive_forecast | Revenue | Future model | Not implemented | NOT_V1 | Predictive forecasting excluded |
| customers.new_count | Customer | ShopifyQL classification | Sum rows classified New | CERTIFIABLE | — |
| customers.returning_count | Customer | ShopifyQL classification | Sum rows classified Returning | CERTIFIABLE | — |
| customers.billing_geography | Customer | ShopifyQL geography | PII-free billing geography after order approval | BUSINESS_RULE_REQUIRED | Order policy |
| commerce.web_funnel | Customer; Marketing | ShopifyQL sessions | Provider funnel counts and conversion rate | CERTIFIABLE | — |
| customers.active | Customer | Customer/order history | Approved activity window on complete history | BUSINESS_RULE_REQUIRED | Definition/history |
| customers.cohorts | Customer | Detailed history | Cohort retention on complete history | SOURCE_LIMITED | Detailed history incomplete |
| customers.realized_ltv | Customer | Orders + optional costs | Approved revenue/contribution LTV | BUSINESS_RULE_REQUIRED | LTV/identity/history |
| customers.rfm | Customer | Detailed history | Approved RFM bands | BUSINESS_RULE_REQUIRED | Bands/history |
| customers.predictive_churn | Customer | Future model | Not implemented | NOT_V1 | Prediction excluded |
| products.mix | Product | ShopifyQL | Product basis divided by approved total basis | BUSINESS_RULE_REQUIRED | Sales-vs-units basis |
| products.catalog | Product | Admin GraphQL | Current sanitized product/variant fields | CERTIFIABLE | — |
| products.units_velocity | Product | ShopifyQL lines | Merchandise units by provider period | CERTIFIABLE | — |
| inventory.shopify_current | Product; Operations | InventoryLevel | Provider quantities for represented locations | CERTIFIABLE | — |
| quality.missing_sku_cost | Product; Insights | Catalog + SKU_Costs | Active/sold SKUs without applicable cost | CERTIFIABLE | — |
| inventory.sell_through | Product | Inventory history/S&OP | Approved sell-through formula | BUSINESS_RULE_REQUIRED | Formula/history |
| inventory.value | Product; Financial | Inventory + costs | Quantity × approved effective canonical cost | BUSINESS_RULE_REQUIRED | Cost authority/mapping |
| inventory.runway_reorder | Product; Operations | Shopify + manual planning | Approved velocity, stockout and reorder rules | BUSINESS_RULE_REQUIRED | Velocity/lead/safety rules |
| products.frequently_bought_together | Product | Detailed order lines | Pair support/confidence under approved rules | BUSINESS_RULE_REQUIRED | History/thresholds |
| operations.shipped_delivered | Operations | Shopify fulfillment | Provider aggregates with partial warning | SOURCE_LIMITED | Carrier-event completeness |
| inventory.combined | Operations | Shopify + Inventory | Sum mapped facts only with complete location coverage | DATA_PENDING | Production inventory empty |
| inventory.lots | Operations | Inventory_Lots + S&OP | Valid current lot rows and remaining quantities | DATA_PENDING | Production lots empty |
| inventory.fefo | Operations | Lots + Depletions | Approved FEFO rule on linked records | BUSINESS_RULE_REQUIRED | Rule/data linkage |
| forecast.variance | Operations; Financial | Forecast + Shopify actual units | Actual minus forecast for identical scope | DATA_PENDING | Production forecast/mappings empty |
| production.incoming | Operations | Production + S&OP | Caller-verified incoming units and PO rows | DATA_PENDING | Production rows empty |
| production.timeline | Operations | Production + S&OP | Current validated PO milestones only | DATA_PENDING | Production empty/S&OP unreliable |
| production.cost_payment | Operations; Financial | Production + references | PO exposure kept separate from actual/COGS | DATA_PENDING | Production values empty/conflicts |
| inventory.depletions | Operations | Depletions | Valid quantities summed by dimensions | DATA_PENDING | Production rows empty |
| klaviyo.email_overview | Marketing | Reporting API | Verified report statistics; send-date semantics | DATA_PENDING | No activity/live verification deferred |
| klaviyo.email_recipients | Marketing | Reporting API | Provider recipients | DATA_PENDING | No report data |
| klaviyo.email_delivery_rate | Marketing | Reporting API | Provider delivery rate | DATA_PENDING | No report data |
| klaviyo.email_open_rate | Marketing | Reporting API | Provider open rate | DATA_PENDING | No report data |
| klaviyo.email_click_rate | Marketing | Reporting API | Provider click rate | DATA_PENDING | No report data |
| klaviyo.email_click_to_open_rate | Marketing | Reporting API | Provider click-to-open rate | DATA_PENDING | No report data |
| klaviyo.email_bounce_rate | Marketing | Reporting API | Provider bounce rate | DATA_PENDING | No report data |
| klaviyo.email_unsubscribe_rate | Marketing | Reporting API | Provider unsubscribe rate | DATA_PENDING | No report data |
| klaviyo.email_spam_complaints | Marketing | Reporting API | Provider complaint count | DATA_PENDING | No report data |
| klaviyo.sms_overview | Marketing | Klaviyo reports/metrics | Exact supported SMS measures with semantics | DATA_PENDING | No SMS activity/live deferred |
| klaviyo.sms_sent | Marketing | Klaviyo verified source | Exact sent measure | DATA_PENDING | No SMS activity |
| klaviyo.sms_delivered | Marketing | Klaviyo verified source | Exact delivered/received measure and label | DATA_PENDING | No SMS activity |
| klaviyo.sms_clicked | Marketing | Klaviyo verified source | Exact click measure | DATA_PENDING | No SMS activity |
| klaviyo.sms_failed | Marketing | Klaviyo verified source | Failed-delivery count | DATA_PENDING | No SMS activity |
| klaviyo.sms_unsubscribed | Marketing | Klaviyo verified source | SMS unsubscribe count | DATA_PENDING | No SMS activity |
| klaviyo.campaign_performance | Marketing | Campaign reports | Sanitized report rows; send-date semantics | DATA_PENDING | No campaigns/report rows |
| klaviyo.flow_performance | Marketing | Flow reports | Sanitized report rows; send-date semantics | DATA_PENDING | Flows have no report rows |
| klaviyo.attributed_revenue | Marketing | Klaviyo conversion value | Label only as Klaviyo-attributed revenue | DATA_PENDING | No report data/settings not recorded |
| klaviyo.engagement_trend | Marketing | Metric aggregates | Event-time points in New York periods | DATA_PENDING | No events/live deferred |
| marketing.spend | Marketing; Financial | Marketing_Spend | Sum validated spend; no attribution inferred | DATA_PENDING | Production rows empty |
| marketing.cac | Marketing | Marketing_Spend + Shopify orders | In-scope paid media spend ÷ unique Shopify first-time customers, same period | CERTIFIABLE | DEC-019 |
| marketing.roas | Marketing | Attributed revenue + spend | Matching attributed revenue ÷ spend | BUSINESS_RULE_REQUIRED | Attribution/scope |
| marketing.ltv_cac | Marketing; Financial | Approved LTV + CAC | Approved LTV ÷ approved CAC | BUSINESS_RULE_REQUIRED | Both definitions unresolved |
| social.performance | Marketing; Growth | Social_Metrics | Valid dated observations; blanks remain unavailable | DATA_PENDING | Production rows empty |
| marketing.content_conversion | Marketing | GA4/ad/content tracking | No calculation without verified attribution | SOURCE_LIMITED | Tracking/access absent |
| sources.freshness | Insights | Source statuses | Expose verified timestamps/states | CERTIFIABLE | — |
| sources.historical_completeness | Insights | Shopify history | Aggregate-vs-detailed completeness | CERTIFIABLE | — |
| quality.unclassified_channel | Insights | Shopify + Mappings | Report values missing approved effective mapping | BUSINESS_RULE_REQUIRED | Mapping/policy absent |
| quality.klaviyo_no_activity | Insights | Klaviyo status | Valid connection with no activity | CERTIFIABLE | — |
| quality.sop_validation | Insights | S&OP XLSX | Formula/placeholder limitations without repair | CERTIFIABLE | — |
| alerts.low_inventory | Insights; Product | Inventory + Rules_Targets | Compare only to approved effective threshold | BUSINESS_RULE_REQUIRED | Threshold absent |
| alerts.conversion_decline | Insights | Funnel + Rules_Targets | Approved equivalent-period threshold evaluation | BUSINESS_RULE_REQUIRED | Comparison/threshold absent |
| alerts.refund_increase | Insights | Refunds + Rules_Targets | Approved refund comparison/threshold | BUSINESS_RULE_REQUIRED | Refund/threshold policy absent |
| alerts.fulfillment_backlog | Insights | Orders/fulfillment + rules | Approved status/age/threshold | BUSINESS_RULE_REQUIRED | Backlog policy absent |
| actions.assign | Insights | Write workflow | Not implemented | NOT_V1 | Read-only V1 |
| recommendations.ai | Insights | Future AI | Not implemented | NOT_V1 | AI recommendations excluded |
| partners.performance | Growth | Partner_Performance | Aggregate only supplied attributed measures | DATA_PENDING | Production rows empty |
| growth.open_pipeline | Growth | Growth_Pipeline | Count Open; sum only supplied values | DATA_PENDING | Production rows empty |
| growth.pipeline_by_type | Growth | Growth_Pipeline | Group current opportunities by type/status | DATA_PENDING | Production rows empty |
| growth.next_actions | Growth | Growth_Pipeline | Supplied actions ordered by due date | DATA_PENDING | Production rows empty |
| growth.weighted_pipeline | Growth | Future probability source | Not calculated from simplified V1 schema | NOT_V1 | Probability field removed/prediction excluded |
| finance.actual_expenses | Financial | Finance_Actuals | Sum actual rows including negative corrections | DATA_PENDING | Production rows empty |
| finance.expense_composition | Financial | Finance_Actuals | Group actual expenses by approved category | DATA_PENDING | Production rows empty |
| finance.cash_position | Financial | Cash | Latest account balances only with complete coverage | DATA_PENDING | Production empty/coverage unknown |
| finance.budget_vs_actual | Financial | Budget + actuals | Actual minus Plan for mapped matching scope | DATA_PENDING | Actuals/mappings absent |
| finance.actual_margin | Financial; Product | Sales + effective costs | Approved revenue minus non-overlapping realized cost | BUSINESS_RULE_REQUIRED | Sales/cost authority conflict |
| finance.monthly_burn | Financial | Finance_Actuals | Approved burn scope only | BUSINESS_RULE_REQUIRED | Burn policy absent |
| finance.cash_runway | Financial | Cash + burn | Approved available cash ÷ approved burn | BUSINESS_RULE_REQUIRED | Cash/burn/runway policy absent |
| finance.fairafric_rebate | Financial; Operations | Production + Rules_Targets | Signed/effective approved rebate rule only | BUSINESS_RULE_REQUIRED | Rule absent |
| finance.predictive_cashflow | Financial | Future model | Not implemented | NOT_V1 | Prediction excluded |

## Certification boundary

- `IMPLEMENTATION VERIFIED` is supported only by focused deterministic tests.
- Shopify, Klaviyo, and Google live credential checks remain `SOURCE VERIFICATION DEFERRED` where recorded.
- Empty PRODUCTION workbook metrics remain `DATA_PENDING` even when TEST calculations pass.
- `BUSINESS_RULE_REQUIRED`, `SOURCE_LIMITED`, and `NOT_V1` metrics cannot emit numeric production values through the certified view-model factory.
