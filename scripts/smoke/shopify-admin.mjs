// Probes the exact Admin GraphQL documents the adapter uses against the live API.
// Read-only, bounded page sizes, prints node counts only (no PII values).
// With --capture, writes a sanitized products/locations fixture
// (catalog data only — no orders/customers, which contain PII).
// Query documents mirror src/infrastructure/shopify/admin-graphql/queries.ts.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal, mintShopifyToken, shopifyGraphQl } from "./lib.mjs";

// Extract the query documents from the adapter source so the probe cannot drift from it.
const source = readFileSync(
  resolve(process.cwd(), "src/infrastructure/shopify/admin-graphql/queries.ts"),
  "utf8",
);
function extractQuery(constName) {
  const match = source.match(new RegExp(`export const ${constName} = \`([\\s\\S]*?)\`;`));
  if (!match) throw new Error(`could not extract ${constName}`);
  return match[1];
}

const documents = {
  SHOP_QUERY: { query: extractQuery("SHOP_QUERY"), variables: {} },
  ACCESS_SCOPES_QUERY: { query: extractQuery("ACCESS_SCOPES_QUERY"), variables: {} },
  PRODUCTS_QUERY: { query: extractQuery("PRODUCTS_QUERY"), variables: { first: 10 } },
  LOCATIONS_QUERY: { query: extractQuery("LOCATIONS_QUERY"), variables: { first: 10 } },
  ORDERS_QUERY: { query: extractQuery("ORDERS_QUERY"), variables: { first: 5 } },
  CUSTOMERS_QUERY: { query: extractQuery("CUSTOMERS_QUERY"), variables: { first: 5 } },
};

const capture = process.argv.includes("--capture");
const env = loadEnvLocal();
const { access_token: token, scope } = await mintShopifyToken(env);
console.log(`token minted; scopes: ${scope}`);

let failures = 0;
const captured = {};

for (const [name, { query, variables }] of Object.entries(documents)) {
  const body = await shopifyGraphQl(env, token, query, variables);
  if (body.errors) {
    failures += 1;
    console.log(`✗ ${name}: ${JSON.stringify(body.errors.map((e) => e.message))}`);
    continue;
  }
  const root = Object.keys(body.data)[0];
  const value = body.data[root];
  const count = Array.isArray(value?.nodes) ? value.nodes.length : 1;
  console.log(`✓ ${name}: root=${root} nodes=${count}`);
  if (capture && (name === "PRODUCTS_QUERY" || name === "LOCATIONS_QUERY")) {
    captured[name] = body.data;
  }
}

if (capture) {
  const dir = resolve(process.cwd(), "tests/infrastructure/shopify/fixtures");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "admin-live.json"), `${JSON.stringify(captured, null, 2)}\n`);
  console.log(`captured ${Object.keys(captured).length} admin payloads to fixtures`);
}

console.log(failures === 0 ? "ALL ADMIN QUERIES OK" : `${failures} document(s) failed`);
process.exit(failures === 0 ? 0 : 1);
