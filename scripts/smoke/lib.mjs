// Shared helpers for read-only live smoke probes.
// Rules: bounded requests, no mutations, never print tokens or PII row values.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    throw new Error(".env.local not found; smoke probes require local credentials");
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    env[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return env;
}

export async function mintShopifyToken(env) {
  const response = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.SHOPIFY_CLIENT_ID,
      client_secret: env.SHOPIFY_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) {
    throw new Error(`token mint failed: HTTP ${response.status}`);
  }
  return response.json();
}

export async function shopifyGraphQl(env, token, query, variables = {}) {
  const version = env.SHOPIFY_ADMIN_API_VERSION;
  const response = await fetch(
    `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/${version}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (!response.ok) {
    throw new Error(`graphql failed: HTTP ${response.status}`);
  }
  return response.json();
}

export async function klaviyoGet(env, path) {
  const response = await fetch(`https://a.klaviyo.com${path}`, {
    headers: {
      Authorization: `Klaviyo-API-Key ${env.KLAVIYO_PRIVATE_API_KEY}`,
      revision: env.KLAVIYO_API_REVISION,
      accept: "application/vnd.api+json",
    },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
