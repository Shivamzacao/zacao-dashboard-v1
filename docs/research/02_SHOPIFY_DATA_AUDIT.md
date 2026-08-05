# ZACAO Dashboard V1 — Shopify Data Audit

Status: Read-only source audit completed  
Audit date: 2026-08-05  
Implementation status: No application code or technical architecture is authorized by this document

## 1. Audit conclusion

Shopify can reliably support a substantial Core V1 without invented data:

- Canonical gross sales, discounts, returns, net sales, shipping, taxes, total sales, orders, and AOV.
- Daily, weekly, and monthly sales trends for the rolling last 12 months.
- Sales and units by product, variant, and SKU.
- Shopify-reported sales channels.
- New-versus-returning customer reporting and returning-customer rate.
- Customer billing geography and website-session geography.
- Website sessions, add-to-cart, checkout, completed-checkout, and conversion funnel metrics.
- Purchase day/hour analysis.
- Aggregate fulfilled, shipped, and delivered counts.
- Current inventory at active Shopify locations.
- Inventory-history and sell-through analytics, subject to the catalog/history limitations documented below.

Shopify alone cannot currently support a trustworthy complete V1 for:

- Detailed customer cohorts, realized LTV, RFM, repeat intervals, product-pair analysis, or full order drill-down across 12 months. The current app lacks `read_all_orders`, and detailed API records reach only the normal recent-order window.
- The requested business-channel taxonomy. Shopify currently reports only four source channels, and referral attribution is missing for most orders.
- Complete gross margin, contribution margin, or inventory value. SKU cost coverage is materially incomplete and the Budget/S&OP cost policies are not yet reconciled.
- Combined SNAPL and YBYD inventory. YBYD is not an active, populated Shopify location.
- Lots, best-by dates, FEFO, production planning, incoming production, lead times, safety stock, forecast, additional depletions, or reorder dates.
- Actual finance, cash, expenses, runway, paid-media spend, CAC, ROAS, social, ambassador, affiliate, pipeline, grant, or rebate analytics.

The principal blockers are current API history permission, store configuration/data completeness, and missing business rules—not the Shopify Basic plan for the aggregate metrics successfully verified here.

## 2. Audit method and safety boundary

The audit used only read operations through the connected ZACAO Shopify store:

- ShopifyQL analytics queries.
- Shopify Admin GraphQL schema inspection, validation, and queries.
- Product and inventory read tools.
- Official Shopify developer and Help Center documentation.

No order, product, inventory, customer, discount, fulfillment, or store setting was changed.

### Security finding

The currently connected app is not least-privilege. It has `read_*` scopes required for the audit, but it also has many `write_*` scopes, including write access to customers, orders, products, inventory, discounts, returns, fulfillments, files, themes, markets, and other store resources.

This does not invalidate the read-only audit, but the production dashboard must not use this permission set. V1 should use a separate Shopify app/token containing only the read scopes proven necessary by the final metric register. `read_all_orders`, if approved, is a read scope and does not authorize source writes.

## 3. Verified store facts

| Item | Verified result | Audit implication |
|---|---|---|
| Store | Zacao (`e93644-3.myshopify.com`) | Correct store was audited. |
| Shopify plan | Basic | Verified aggregate analytics work on the current plan. |
| Store currency | USD | Matches the confirmed V1 reporting currency. |
| Store timezone | EDT | Source periods must be normalized to the confirmed `America/New_York` reporting timezone. |
| Customer records | 462 | Count only; no customer PII was collected for this audit. |
| Orders in requested last-12-month count | 158 when counted with a dated Admin API query | Count access is not proof of detailed-record access. |
| Detailed order nodes accessible | 10 in the current API window; oldest observed 2026-06-08 | Full 12-month detailed analysis is unavailable without another history path. |
| Active products | 3 | Two chocolate products and one gift-card product. |
| Active locations | 2 | `139 North 10th Street` and `SNAPL`. |
| Inactive locations | 2 | `Boxtrot Warehouse` and `Your Brand Your Dream`. |

### Current active catalog

| Product | Active variants/SKUs | Current cost finding |
|---|---|---|
| 42% Cacao Smooth Chocolate | 4-Pack `ZAC-MC-42-4PK`; 10-Pack `ZAC-MC-42-10PK` | 4-Pack cost missing; 10-Pack cost recorded as $20.90 per Shopify variant unit. |
| 70% Cacao Dark Chocolate | 4-Pack `ZAC-DC-70-4PK`; 10-Pack `ZAC-DC-70-10PK` | Costs recorded as $8.36 and $20.70 per Shopify variant unit. |
| Zacao Gift Card | $25, $50, and $100 variants; no SKUs | Not inventory-tracked and no unit costs, as expected for gift cards. |

The Budget/S&OP sources model five chocolate SKUs, while the active Shopify catalog contains four chocolate pack variants. Product names in the approved demo are also mock labels and do not match the live catalog. A stable cross-source SKU mapping cannot be approved until the workbook audit is complete.

### Current Shopify inventory

| Location | SKU | Available | Committed | On hand | Status |
|---|---|---:|---:|---:|---|
| SNAPL | `ZAC-MC-42-4PK` | 0 | 0 | 0 | Available but out of stock. |
| SNAPL | `ZAC-MC-42-10PK` | 56 | 2 | 58 | Available. |
| SNAPL | `ZAC-DC-70-4PK` | 0 | 2 | 2 | No available quantity; committed stock exists. |
| SNAPL | `ZAC-DC-70-10PK` | 0 | 0 | 0 | Available but out of stock. |

The active `139 North 10th Street` location has no active inventory levels for the current product variants. `Your Brand Your Dream` exists only as an inactive Shopify location and does not provide current YBYD inventory. Therefore, Shopify inventory must be labeled as Shopify/SNAPL inventory, not combined company inventory.

## 4. Historical access and permission findings

The current app has `read_orders` but not `read_all_orders`.

Shopify's Admin API normally restricts detailed order access to the recent order window unless `read_all_orders` is approved. ShopifyQL aggregate reporting can still expose longer historical aggregates. The audit proved this exact split:

- Rolling 12-month ShopifyQL revenue, customers, sessions, fulfillment, product, inventory, channel, geography, and purchase-time queries succeeded.
- A date-filtered order count could count 158 orders from the requested historical period.
- Detailed order-node retrieval exposed only 10 recent orders, with the oldest observed record dated 2026-06-08.

Consequences:

- Aggregate charts can use ShopifyQL for the rolling last 12 months.
- Detailed customer/order/product drill-down cannot claim 12-month completeness.
- Cohorts, realized LTV, RFM, repeat intervals, product pairs, and full historical order exports remain **Partially available**.
- The approved alternatives are `read_all_orders`, a controlled historical Shopify export, or both.
- Every affected component must disclose detailed-history coverage until a backfill is validated.

Official reference: [Shopify Order Admin GraphQL documentation](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order).

## 5. Exact Shopify resource and field map

### 5.1 ShopifyQL datasets

The connector executes the Admin GraphQL `shopifyqlQuery` operation. The connected app has `read_reports` and `read_analytics`. Shopify documents ShopifyQL as schema-based analytics where the selected dataset determines the available metrics and dimensions: [ShopifyQL reference](https://shopify.dev/docs/api/shopifyql/latest/index).

| V1 data | Verified dataset/fields | Exact verified query pattern | Status |
|---|---|---|---|
| Revenue components and AOV | `sales`: `orders`, `gross_sales`, `discounts`, `returns`, `net_sales`, `shipping_charges`, `taxes`, `total_sales`, `average_order_value` | `FROM sales SHOW orders, gross_sales, discounts, returns, net_sales, shipping_charges, taxes, total_sales, average_order_value TIMESERIES month SINCE -12m UNTIL today` | Available |
| Revenue trend | Same sales metrics with `TIMESERIES day/week/month` | Monthly query returned 13 calendar buckets spanning the rolling window. | Available |
| Product sales | `sales`: `gross_sales`, `net_sales`, `orders`; dimension `product_title` | `FROM sales SHOW gross_sales, net_sales, orders GROUP BY product_title SINCE -12m UNTIL today` | Available with blank-product caveat |
| Variant/SKU units | `sales`: `net_items_sold`; dimensions `product_title`, `product_variant_title`, `product_variant_sku` | `FROM sales SHOW net_items_sold GROUP BY product_title, product_variant_title SINCE -12m UNTIL today` | Available with non-product/blank-SKU caveat |
| Product line classification | `sales`: `line_type`, product/variant/SKU dimensions | `FROM sales SHOW net_sales, orders, net_items_sold GROUP BY line_type, product_title, product_variant_title, product_variant_sku SINCE -12m UNTIL today` | Available; required to exclude adjustments/fees from merchandise units |
| New versus returning | `sales`: dimension `new_or_returning_customer`; metrics `orders`, `customers` | `FROM sales SHOW orders, customers GROUP BY new_or_returning_customer SINCE -12m UNTIL today` | Available |
| Returning-customer rate | `sales`: `returning_customers`, `customers`, `returning_customer_rate` | `FROM sales SHOW returning_customers, customers, returning_customer_rate TIMESERIES month SINCE -12m UNTIL today` | Available |
| Web funnel | `sessions`: `sessions`, `online_store_visitors`, `sessions_with_cart_additions`, `sessions_that_reached_checkout`, `sessions_that_completed_checkout`, `conversion_rate` | `FROM sessions SHOW sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate TIMESERIES month SINCE -12m UNTIL today` | Available |
| Website geography | `sessions`: dimension `session_country`; metric `sessions` | `FROM sessions SHOW sessions GROUP BY session_country SINCE -12m UNTIL today` | Available |
| Customer/order geography | `sales`: dimensions `billing_country`, `billing_region`; metrics `orders`, `total_sales` | `FROM sales SHOW orders, total_sales GROUP BY billing_country, billing_region SINCE -12m UNTIL today` | Available as billing geography |
| Purchase-time heatmap | `sales`: dimensions `day_of_week`, `hour_of_day`; metric `orders` | `FROM sales SHOW orders GROUP BY day_of_week, hour_of_day SINCE -12m UNTIL today` | Available |
| Shopify-reported channels | `sales`: dimension `sales_channel`; metrics `orders`, `net_sales`, `total_sales` | `FROM sales SHOW orders, net_sales, total_sales GROUP BY sales_channel SINCE -12m UNTIL today` | Available at Shopify's native channel level |
| Referrer attribution | `sales`: `order_referrer_source`, `order_referrer_name`; metrics `orders`, `total_sales` | `FROM sales SHOW orders, total_sales GROUP BY order_referrer_source, order_referrer_name SINCE -12m UNTIL today` | Partially available; attribution is sparse |
| Fulfillment trend | `fulfillments`: `orders_fulfilled`, `orders_shipped`, `orders_delivered` | `FROM fulfillments SHOW orders_fulfilled, orders_shipped, orders_delivered TIMESERIES month SINCE -12m UNTIL today` | Available as aggregate counts |
| Inventory history/sell-through | `inventory`: `starting_inventory_units`, `ending_inventory_units`, `inventory_units_sold`, `sell_through_rate`; product/variant dimensions | `FROM inventory SHOW starting_inventory_units, ending_inventory_units, inventory_units_sold, sell_through_rate GROUP BY product_title, product_variant_title SINCE -12m UNTIL today` | Partially available; historical catalog contains inactive/legacy rows |
| Cost coverage and Shopify gross margin | `sales`: `cost_of_goods_sold`, `gross_profit`, `gross_margin`, `net_sales_with_cost_recorded`, `net_sales_without_cost_recorded` | `FROM sales SHOW net_sales, cost_of_goods_sold, gross_profit, gross_margin, net_sales_with_cost_recorded, net_sales_without_cost_recorded SINCE -12m UNTIL today` | Partially available and not certifiable as total-company margin |

Shopify's current sales schema documents `new_or_returning_customer`, `months_since_first_purchase`, `day_of_week`, `hour_of_day`, product identifiers, billing geography, and canonical sales metrics: [ShopifyQL sales schema](https://shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/sales).

### 5.2 Admin GraphQL resources and exact verified fields

| Resource | Verified fields needed by V1 | Use | Limitation |
|---|---|---|---|
| `Shop` | `name`, `currencyCode`, `ianaTimezone`, plan/display information | Source metadata and reporting normalization | Current display timezone was EDT; dashboard uses configurable `America/New_York`. |
| `Order` via `orders` | `id`, `name`, `createdAt`, `processedAt`, `cancelledAt`, `test`, `currencyCode`, `sourceName`, `tags`, `displayFinancialStatus`, `displayFulfillmentStatus`, subtotal/total/discount/shipping/tax/refunded/net-payment money sets | Current/recent order drill-down and operational alerts | Detailed history is limited without `read_all_orders`. |
| `LineItem` | `id`, `name`, `quantity`, `currentQuantity`, `refundableQuantity`, `unfulfilledQuantity`, `sku`, `product`, `variant`, original/discounted unit price sets, discount allocations, tax lines | SKU sales, units, recent order detail | Faire fee lines can have no product/variant and negative prices; they must not be counted as merchandise units. |
| `Refund` | `id`, `createdAt`, `totalRefundedSet`, `refundLineItems` | Refund-date recognition and drill-down | Full historical refund detail inherits order-history limits. |
| `RefundLineItem` | `quantity`, `subtotalSet`, `lineItem`/SKU | Product refund analysis | Requires reliable line-item linkage. |
| `Fulfillment` | `id`, `createdAt`, `updatedAt`, `status`, `displayStatus`, `deliveredAt`, `inTransitAt`, `estimatedDeliveryAt`, `location`, `trackingInfo` | Fulfillment detail and delivery timing | Delivery/estimate timestamps are not complete for every observed fulfillment. Multiple fulfillments per order require distinct-order logic. |
| `Product` | `id`, `title`, `handle`, `status`, variant connection | Product catalog | Live catalog differs from Budget/S&OP and demo sample labels. |
| `ProductVariant` | `id`, `title`, `sku`, `price`, `inventoryQuantity`, `sellableOnlineQuantity`, `inventoryItem` | SKU/pack identity, price, current stock | Gift-card variants have no SKU; pack variant is the saleable unit. |
| `InventoryItem` | `id`, `sku`, `tracked`, `unitCost`, `inventoryLevels` | Cost completeness and inventory linkage | One active chocolate SKU has no cost; historical cost effectiveness is not established. |
| `InventoryLevel` | `id`, `isActive`, `updatedAt`, `location`, `quantities(names: ...)` | Current inventory per location | Officially supports states including `available`, `incoming`, `committed`, `damaged`, `on_hand`, `reserved`, and `safety_stock`; only recorded states should be shown. See [InventoryLevel](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryLevel). |
| `Location` | `id`, `name`, `isActive`, fulfillment/inventory status | Warehouse/location filter | YBYD exists only as an inactive location. |
| `Customer` | `id`, `createdAt`, `numberOfOrders`, `amountSpent`, `lastOrder` | Recent/customer-detail support | No verified direct `firstOrder` field; full identity history still requires detailed order backfill or ShopifyQL aggregates. |
| `currentAppInstallation.accessScopes` | `handle` | Permission audit | Contains many write scopes and lacks `read_all_orders`. |

## 6. Metric feasibility matrix

| Dashboard metric/feature | Status | Exact Shopify path | Required calculation or rule | Limitation/alternative |
|---|---|---|---|---|
| Gross sales | Available | ShopifyQL `sales.gross_sales` | Use canonical Shopify output | Definition includes pending, canceled, and unpaid orders; test/deleted orders excluded by Shopify reports. Business acceptance still required. |
| Discounts | Available | ShopifyQL `sales.discounts` | Respect provider sign; never subtract twice | Returned as negative in audited results. |
| Returns/sales reversals | Available | ShopifyQL `sales.returns`; detailed `Refund.createdAt`/amount | Approve whether KPI is physical returns or all sales reversals | Connector help still mentions `sales_reversals`, but that column failed; current store accepted `returns`. |
| Net sales | Available | ShopifyQL `sales.net_sales` | Prefer canonical output | Reconciliation must normalize negative discount/return signs. |
| Shipping | Available | ShopifyQL `sales.shipping_charges`; order shipping totals | Prefer canonical aggregate | Define whether shown separately or included only in total sales. |
| Taxes | Available | ShopifyQL `sales.taxes`; order tax totals | Prefer canonical aggregate | Define display policy. |
| Total sales | Available | ShopifyQL `sales.total_sales` | Prefer canonical output | Includes sales components per Shopify definition. |
| Orders | Available | ShopifyQL `sales.orders` | Use canonical aggregate; count distinct order IDs in detailed views | Grouped product rows must not be summed because one order can contain multiple products. |
| AOV | Available | ShopifyQL `sales.average_order_value` | Canonical formula `(gross sales - discounts) / orders` before post-order adjustments | Use Shopify's direct metric to avoid local disagreement. See [Shopify sales report definitions](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report). |
| Revenue trend | Available | ShopifyQL sales metrics + `TIMESERIES` | Bucket in approved dashboard timezone | Source store already uses Eastern time; preserve configurable timezone. |
| Revenue comparison | Available | ShopifyQL `COMPARE TO previous_period` or two equivalent queries | Exact comparison type requires approval | Target/budget comparison is not supplied by Shopify. |
| Product/variant/SKU sales | Available | ShopifyQL product/variant/SKU dimensions | Filter/classify `line_type` | Blank product/SKU rows and adjustments must not be attributed to a product. |
| Units sold | Available | `net_items_sold` by product/variant/SKU | Only merchandise `line_type=product`; decide reversal treatment | Blank product bucket contained 78 net units and needs investigation. |
| Product mix | Available after definition | Product/variant net sales or units | Choose revenue basis or unit basis | Do not mix both bases in one percentage. |
| New customers | Available as an aggregate classification | Group `orders/customers` by `new_or_returning_customer='New'` | Use Shopify's classification | Direct `FROM customers SHOW new_customers` failed on this store/API surface. |
| Returning customers/rate | Available | ShopifyQL returning metrics and classification | Use Shopify metric definition | One blank classification row exists and must be disclosed/excluded from split percentages. |
| Customer geography | Available as aggregate billing geography | `billing_country`, `billing_region` | PII-safe aggregation only | Billing geography may differ from shipping/residence; label it accurately. |
| Session geography | Available | `sessions.session_country` | Aggregate only | Measures visits, not purchasers. |
| Purchase-time heatmap | Available | `day_of_week`, `hour_of_day`, `orders` | Normalize/report weekday encoding and timezone | Use aggregate query; no detailed-history permission needed. |
| Basic web funnel | Available | ShopifyQL sessions metrics | Define funnel labels exactly as Shopify reports them | This is Shopify web behavior, not GA4 and not all offline orders. |
| Active customer count | Partially available | ShopifyQL customers/orders by period or detailed orders | Approve “active” definition | Customer-level export/drill-down is history-limited. |
| Cohorts | Partially available | ShopifyQL has first-purchase dimensions; detailed cohort tables require verified approach | Define cohort and retention basis | Use aggregate ShopifyQL if it can reproduce approved table; otherwise obtain `read_all_orders`/export. |
| Realized CLV | Partially available | ShopifyQL all-time spend/first-purchase dimensions or detailed history | Define revenue vs contribution CLV and population | Detailed drill-down and cost-based CLV remain blocked. |
| RFM | Partially available | Customer/order aggregates or detailed history | Approve recency/frequency/monetary bands | Full 12-month customer-level dataset not currently accessible. |
| Product pairs | Partially available | Detailed `Order.lineItems` | Define minimum support/confidence; exclude fees/gift cards as approved | Requires historical backfill for complete 12-month result. |
| Shopify sales channel | Available at native level | `sales_channel` | Map only explicit verified values | Current native values are Online Store, Draft Orders, Faire, and Shopify Mobile. |
| Requested business channels | Partially available | `sales_channel`, `sourceName`, tags, discount codes, referrer fields | Requires approved deterministic mapping | Cannot currently split TikTok, Instagram, ShopMy, events, and cafés reliably. |
| Fulfilled/shipped/delivered counts | Available as aggregates | ShopifyQL `fulfillments` metrics | Prefer canonical aggregate | Detailed delivery timestamps are incomplete. |
| Fulfillment backlog | Partially available | Detailed `Order.displayFulfillmentStatus`, timestamps, fulfillment fields | Approve age/count threshold | Recent window is accessible; full older backlog history/age may require permission. |
| Current Shopify inventory | Available for active inventory levels | `InventoryLevel.quantities` by `Location`/SKU | Define which quantity state is displayed | Does not represent combined SNAPL/YBYD inventory. |
| Sell-through | Partially available | ShopifyQL inventory metrics | Use Shopify canonical metric or approve another formula | Historical output includes legacy/inactive product rows and a large blank product bucket. |
| Inventory value | Partially available | Current quantity × effective approved unit cost | Approve valuation basis/effective dates | Cost missing for Smooth 4-Pack; costs are pack-level; Budget reconciliation pending. |
| Shopify gross margin | Partially available, not certifiable | ShopifyQL cost/gross-profit metrics | Only valid on cost-covered merchandise | Audited 12-month result: $3,648.72 net sales with costs vs $10,956.82 without costs, plus adjustments. The reported -2.2% margin covers only the cost-recorded subset and must not be shown as company margin. |
| Low-inventory alert | Available after rule | Current `available` by SKU/location | Approve threshold and whether committed/incoming affects risk | Current zero availability can be displayed; alert status cannot be invented. |
| Inventory runway/reorder | Missing from Shopify alone | Units sold + current inventory are partial inputs | Requires lead time, safety buffer, incoming units, full locations, depletions | Audit S&OP and other operational sources. |
| Forecast/target/budget | Missing from Shopify | None | Join to approved external plan | Audit Budget and S&OP. |
| Financial runway/expenses | Missing from Shopify | None | Requires actual finance/cash source | Budget assumptions are not actual cash. |
| Paid CAC/ROAS | Missing from Shopify alone | Attribution/referrer is incomplete | Requires ad spend + attribution policy | Audit ad platforms or maintained spend sheet if approved. |

## 7. Data-quality findings that affect design and calculation

### 7.1 Native sales channels are narrower than the requested taxonomy

The last-12-month ShopifyQL result exposes exactly these `sales_channel` values:

| Shopify channel | Orders in audited query | Mapping readiness |
|---|---:|---|
| Online Store | 74 | Can map to Website/DTC only with an attribution caveat. |
| Draft Orders | 69 | Unclassified until tags or another rule prove the business channel. |
| Faire: Sell Wholesale | 29 | Straightforward candidate for Wholesale/Faire. |
| Shopify Mobile for iPhone | 2 | Unclassified/internal source unless a rule is approved. |

No distinct native rows were returned for TikTok Shop, Instagram Shop, ShopMy/Affiliate, events/pop-ups, or in-store/cafés.

Referral analysis cannot fill the gap by itself: 118 of 174 ShopifyQL order rows had blank referrer source/name. Unmapped orders must remain in an `Unclassified` bucket while still being included in company totals.

### 7.2 Non-product sales and marketplace fee lines

The last-12-month product query contained:

- A `sale_adjustment` row with $1,548 net sales and no order/product/SKU.
- A blank-product `product` row with $188.29 net sales, 35 grouped orders, and 78 net units.
- Recent Faire orders containing negative-price fee lines such as `FAIRE-COMMISSION` and `FAIRE-PAYMENT-PROCESSING-FEE`, with no linked Shopify product or variant.

Therefore:

- Product units must include only approved merchandise product lines.
- Marketplace fee lines must not be counted as product units.
- Product-group order counts must not be summed across rows.
- Blank product/SKU and adjustment amounts must be separately reconciled before any “all product revenue” visualization is certified.

### 7.3 Historical inventory includes legacy catalog records

The inventory ShopifyQL result returned 13 rows, including current products, gift-card variants, legacy wholesale product titles, old case variants, and a blank product row. The blank row showed 1,647 starting units and 181 ending units.

This proves Shopify has useful historical inventory analytics, but the historical product catalog is not equivalent to the current active catalog. A sell-through chart must use stable product/variant IDs where possible and define how legacy/deleted/replaced SKUs are handled.

### 7.4 Cost coverage is insufficient

The last-12-month ShopifyQL cost query returned:

- Net sales: $16,153.54.
- Net sales with a recorded cost: $3,648.72.
- Net sales without a recorded cost: $10,956.82.
- Cost of goods sold: $3,730.10.
- Shopify gross profit: -$81.38.
- Shopify gross margin: -2.2%.

The reported gross profit/margin is calculated only where cost exists and excludes substantial no-cost sales; adjustments explain the remaining difference between total net sales and the two coverage buckets. It is not a valid company-wide margin KPI. Missing/effective costs must be resolved and reconciled to the Budget/S&OP workbooks.

### 7.5 Fulfillment timestamps are incomplete and non-unique per order

Recent order samples contained delivered, in-transit, estimated-delivery, and not-delivered states, but not every fulfillment populated every timestamp. Some Faire orders had multiple fulfillment records and locations.

Use ShopifyQL aggregate counts for executive status trends. Any detailed lead-time or on-time-delivery metric requires a completeness audit, distinct-order logic, and an approved promised-delivery definition.

## 8. Why earlier assumptions about Shopify were only partly correct

The previous planning assumed several metrics were available because Shopify generally exposes relevant objects or reports. That was directionally correct but insufficient for production feasibility.

The fresh audit distinguishes four separate questions:

1. **Does Shopify define the field or report?** Often yes.
2. **Does the current connector expose it?** Usually for verified aggregates, but not all documented aliases work.
3. **Does the current app have the required permission/history?** No for full detailed order history because `read_all_orders` is absent.
4. **Does ZACAO's store actually populate complete, correctly classified data?** Not for all costs, locations, channels, referrers, fulfillment timestamps, or active-vs-historical SKU mappings.

Examples:

- `returns` worked in ShopifyQL while the connector's example `sales_reversals` failed as an unknown column. Connector help can lag the live schema.
- `FROM customers SHOW new_customers` failed, while the supported `sales.new_or_returning_customer` dimension produced a usable aggregate new/returning split.
- Inventory exists, but only SNAPL is populated for active product variants; YBYD is not an active populated location.
- Cost fields exist, but cost coverage is too incomplete for a certified margin.

The limitation is therefore not simply “Shopify cannot provide it.” Each blocked metric has a specific permission, source-population, history, definition, or cross-source dependency.

## 9. Recommended Shopify-backed V1 boundary

### Reliable Core Shopify modules

- Revenue KPI cards and trends using canonical ShopifyQL metrics.
- Orders and AOV.
- Product/variant/SKU sales and merchandise units, with explicit line-type and blank-SKU controls.
- Native sales-channel reporting plus an Unclassified queue.
- New/returning aggregate split and returning-customer rate.
- Billing-region and session-country geography.
- Shopify website funnel and conversion rate.
- Purchase weekday/hour heatmap.
- Aggregate fulfillment counts.
- Current Shopify/SNAPL inventory with source/location labels.
- Source freshness, history coverage, cost completeness, unmapped channel, blank product, and reconciliation warnings.

### Conditional or partial Shopify modules

- Detailed customer cohorts, realized LTV, RFM, customer-risk segmentation, and repeat intervals.
- Frequently bought-together products.
- Complete detailed order/customer/product drill-down and export for the rolling 12 months.
- Complete channel taxonomy.
- Sell-through across historical/legacy catalog items.
- Gross margin and inventory value.
- Fulfillment lead time and on-time delivery.
- Inventory runway, stockout date, and reorder date.

### Not supplied by Shopify

- Budget/target/forecast inputs.
- Full warehouse, lot, FEFO, production, and incoming-stock planning.
- Actual expenses, cash, burn, and runway.
- Paid-media spend and reliable blended CAC/ROAS.
- Social, ambassador, affiliate, growth-pipeline, grant, sponsorship, and Fairafric rebate records.

## 10. Required decisions and remediation

1. Approve the Shopify revenue/order policy after reviewing Shopify's canonical definitions. Shopify documents gross sales, discounts, sales reversals/returns, net sales, shipping, taxes, total sales, orders, and AOV in its [sales report definitions](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report).
2. Choose the detailed-history path: approve `read_all_orders`, provide a controlled historical order export, or use both in priority order.
3. Approve the handling of blank product/SKU rows, sale adjustments, gift cards, Faire commission/payment-processing lines, and legacy product records.
4. Approve a deterministic channel mapping and retain `Unclassified` for unmatched orders.
5. Decide whether billing geography is acceptable for customer geography or whether shipping geography/detail is required.
6. Define alert thresholds for low inventory, conversion decline, refund increase, and fulfillment backlog.
7. Reconcile active Shopify product/variant/SKU identifiers to the five-SKU Budget/S&OP model.
8. Complete and version effective SKU cost data before enabling margin or inventory-value metrics.
9. Use a new least-privilege production Shopify credential; do not reuse the broad write-enabled audit connection.

## 11. Preliminary database implication—not a final decision

This audit improves the case for a simple no-database Shopify path for many aggregate charts: ShopifyQL can directly return rolling 12-month revenue, customer, funnel, geography, timing, channel, fulfillment, product, and inventory aggregates.

It does not yet prove that the entire V1 can operate reliably without persistent storage because:

- Full detailed history may need an export/backfill.
- Cross-source Budget, S&OP, and Klaviyo calculations are not yet audited.
- Editable workbooks may overwrite historical snapshots.
- The dashboard must survive temporary connector/API failures and retain a last-known-valid result if that behavior is required.
- Data-quality/reconciliation history may require persistence.

The database decision remains **Requires verification** until the Klaviyo and workbook audits are complete. No authentication database is required, and no database implementation is authorized now.

## 12. Audit status

| Audit area | Status |
|---|---|
| Shopify aggregate revenue/customer/session/fulfillment access | Completed |
| Product, variant, SKU, cost, location, and inventory access | Completed |
| Current permission and detailed-history audit | Completed |
| Channel/referrer completeness audit | Completed |
| Metric-level feasibility mapping | Completed |
| Business-definition approval | Pending human decision |
| Historical backfill path | Pending human decision/access |
| Cross-source SKU/cost reconciliation | Pending Budget and S&OP audits |

The next sequential source audit is Klaviyo.
