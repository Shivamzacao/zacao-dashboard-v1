// Probes every ShopifyQL dataset clause used by the dashboard against the live API.
// Read-only. Prints column names/dataTypes and row counts only (no PII values).
// With --capture, writes sanitized full responses for non-PII datasets to
// tests/infrastructure/shopify/fixtures/shopifyql-live.json for mapper tests.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal, mintShopifyToken, shopifyGraphQl } from "./lib.mjs";

const DATASETS = {
  sales_trend:
    "FROM sales SHOW orders, gross_sales, discounts, returns, net_sales, shipping_charges, taxes, total_sales, average_order_value TIMESERIES month",
  product_sales: "FROM sales SHOW gross_sales, net_sales, orders GROUP BY product_title",
  product_line_classification:
    "FROM sales SHOW net_sales, orders, net_items_sold GROUP BY line_type, product_title, product_variant_title, product_variant_sku",
  new_returning_customers: "FROM sales SHOW orders, customers GROUP BY new_or_returning_customer",
  returning_customer_rate:
    "FROM sales SHOW returning_customers, customers, returning_customer_rate TIMESERIES month",
  web_funnel:
    "FROM sessions SHOW sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate TIMESERIES month",
  session_geography: "FROM sessions SHOW sessions GROUP BY session_country",
  traffic_attribution:
    "FROM sessions SHOW sessions WHERE human_or_bot_session = 'human' GROUP BY referrer_source",
  affiliate_sessions:
    "FROM sessions SHOW sessions WHERE human_or_bot_session = 'human' GROUP BY utm_source, utm_campaign, utm_content",
  affiliate_sales:
    "FROM sales SHOW orders, net_sales WHERE discount_code IS NOT NULL GROUP BY discount_code",
  billing_geography: "FROM sales SHOW orders, total_sales GROUP BY billing_country, billing_region",
  purchase_time: "FROM sales SHOW orders GROUP BY day_of_week, hour_of_day",
  native_channels: "FROM sales SHOW orders, net_sales, total_sales GROUP BY sales_channel",
  referrers:
    "FROM sales SHOW orders, total_sales GROUP BY order_referrer_source, order_referrer_name",
  fulfillment_trend:
    "FROM fulfillments SHOW orders_fulfilled, orders_shipped, orders_delivered TIMESERIES month",
  inventory_history:
    "FROM inventory SHOW starting_inventory_units, ending_inventory_units, inventory_units_sold, sell_through_rate GROUP BY product_title, product_variant_title",
  cost_coverage:
    "FROM sales SHOW net_sales, cost_of_goods_sold, gross_profit, gross_margin, net_sales_with_cost_recorded, net_sales_without_cost_recorded",
};

// Datasets whose row values are aggregates safe to commit as fixtures (no customer PII).
const CAPTURE_SAFE = new Set([
  "sales_trend",
  "product_sales",
  "product_line_classification",
  "new_returning_customers",
  "returning_customer_rate",
  "web_funnel",
  "purchase_time",
  "native_channels",
  "fulfillment_trend",
  "inventory_history",
  "cost_coverage",
]);

const QUERY = `
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

const capture = process.argv.includes("--capture");
const env = loadEnvLocal();
const { access_token: token } = await mintShopifyToken(env);
const since = "SINCE -365d UNTIL today";

const captured = {};
let failures = 0;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function runDataset(clause) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const body = await shopifyGraphQl(env, token, QUERY, { query: `${clause} ${since}` });
    const rateLimited = body.errors?.some((e) => /rate limited/i.test(e.message ?? ""));
    if (!rateLimited) return body;
    await sleep(20_000);
  }
  return { errors: [{ message: "rate limited after retries" }] };
}

for (const [name, clause] of Object.entries(DATASETS)) {
  const body = await runDataset(clause);
  if (body.errors) {
    failures += 1;
    console.log(`✗ ${name}: GRAPHQL ERROR ${JSON.stringify(body.errors[0]?.message)}`);
    continue;
  }
  const payload = body.data?.shopifyqlQuery;
  const parseErrors = payload?.parseErrors ?? [];
  if (parseErrors.length > 0) {
    failures += 1;
    console.log(`✗ ${name}: PARSE ERRORS ${JSON.stringify(parseErrors)}`);
    continue;
  }
  const columns = payload?.tableData?.columns ?? [];
  const rows = payload?.tableData?.rows ?? [];
  console.log(
    `✓ ${name}: ${rows.length} rows; columns: ${columns
      .map((c) => `${c.name}:${c.dataType}`)
      .join(", ")}`,
  );
  if (capture && CAPTURE_SAFE.has(name)) {
    captured[name] = payload;
  }
}

if (capture) {
  const dir = resolve(process.cwd(), "tests/infrastructure/shopify/fixtures");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "shopifyql-live.json"), `${JSON.stringify(captured, null, 2)}\n`);
  console.log(`captured ${Object.keys(captured).length} dataset payloads to fixtures`);
}

console.log(failures === 0 ? "ALL DATASETS OK" : `${failures} dataset(s) failed`);
process.exit(failures === 0 ? 0 : 1);
