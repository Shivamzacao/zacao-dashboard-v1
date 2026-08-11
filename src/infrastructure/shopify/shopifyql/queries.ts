import { z } from "zod";

import { dateRangeSchema, type DateRange } from "@/src/domain/contracts/date-range";

export const shopifyQlDatasetSchema = z.enum([
  "sales_totals",
  "sales_trend",
  "product_sales",
  "product_line_classification",
  "product_units_weekly",
  "new_returning_customers",
  "returning_customer_rate",
  "web_funnel",
  "session_geography",
  "billing_geography",
  "purchase_time",
  "native_channels",
  "referrers",
  "fulfillment_trend",
  "inventory_history",
  "cost_coverage",
]);

export type ShopifyQlDataset = z.infer<typeof shopifyQlDatasetSchema>;
export type ShopifyQlGrain = "day" | "week" | "month";

const datasets: Record<ShopifyQlDataset, string> = {
  // Same canonical sales columns as sales_trend, read as one provider
  // aggregate row so totals and AOV are never locally re-derived.
  sales_totals:
    "FROM sales SHOW orders, gross_sales, discounts, returns, net_sales, shipping_charges, taxes, total_sales, average_order_value",
  sales_trend:
    "FROM sales SHOW orders, gross_sales, discounts, returns, net_sales, shipping_charges, taxes, total_sales, average_order_value",
  product_sales: "FROM sales SHOW gross_sales, net_sales, orders GROUP BY product_title",
  product_line_classification:
    "FROM sales SHOW net_sales, orders, net_items_sold GROUP BY line_type, product_title, product_variant_title, product_variant_sku",
  product_units_weekly:
    "FROM sales SHOW net_items_sold GROUP BY line_type, product_variant_sku, sales_channel",
  new_returning_customers: "FROM sales SHOW orders, customers GROUP BY new_or_returning_customer",
  returning_customer_rate:
    "FROM sales SHOW returning_customers, customers, returning_customer_rate",
  web_funnel:
    "FROM sessions SHOW sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate",
  session_geography: "FROM sessions SHOW sessions GROUP BY session_country",
  billing_geography: "FROM sales SHOW orders, total_sales GROUP BY billing_country, billing_region",
  purchase_time: "FROM sales SHOW orders GROUP BY day_of_week, hour_of_day",
  native_channels: "FROM sales SHOW orders, net_sales, total_sales GROUP BY sales_channel",
  referrers:
    "FROM sales SHOW orders, total_sales GROUP BY order_referrer_source, order_referrer_name",
  fulfillment_trend: "FROM fulfillments SHOW orders_fulfilled, orders_shipped, orders_delivered",
  inventory_history:
    "FROM inventory SHOW starting_inventory_units, ending_inventory_units, inventory_units_sold, sell_through_rate GROUP BY product_title, product_variant_title",
  cost_coverage:
    "FROM sales SHOW net_sales, cost_of_goods_sold, gross_profit, gross_margin, net_sales_with_cost_recorded, net_sales_without_cost_recorded",
};

const timeSeriesDatasets = new Set<ShopifyQlDataset>([
  "sales_trend",
  "returning_customer_rate",
  "web_funnel",
  "fulfillment_trend",
  "product_units_weekly",
]);

export function buildShopifyQlQuery(input: {
  dataset: ShopifyQlDataset;
  dateRange: DateRange;
  grain?: ShopifyQlGrain;
}): string {
  const dateRange = dateRangeSchema.parse(input.dateRange);
  const dataset = shopifyQlDatasetSchema.parse(input.dataset);
  const grain = input.grain ?? "month";
  const timeSeries = timeSeriesDatasets.has(dataset) ? ` TIMESERIES ${grain}` : "";

  return `${datasets[dataset]}${timeSeries} SINCE ${dateRange.startDate} UNTIL ${dateRange.endDate}`;
}

export const SHOPIFYQL_QUERY = `
  query ShopifyQl($query: String!) {
    shopifyqlQuery(query: $query) {
      parseErrors
      tableData {
        columns { name dataType }
        rows
      }
    }
  }
`;
