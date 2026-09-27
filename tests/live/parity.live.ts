/**
 * Live Sheets-vs-Shopify parity and historical order reconciliation.
 *
 *   pnpm parity:live            # needs SHOPIFY_* and GOOGLE_* in the environment
 *
 * Read-only. Writes one JSON report outside the repository (PARITY_REPORT_DIR,
 * default: the OS temp directory). Reports contain SKUs, location names,
 * order names and aggregates — never customer data.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it } from "vitest";

import { reconcile, type ReconciliationReport } from "@/src/application/reconciliation/reconcile";
import { reportingDate } from "@/src/application/reconciliation/tab-comparers";
import { businessConfiguration } from "@/src/infrastructure/config/business-config";
import { loadSheetsApiConfigurationOrNull } from "@/src/infrastructure/sheets-api/config";
import { SheetsApiClient } from "@/src/infrastructure/sheets-api/client";
import {
  paddedCreatedAtWindow,
  ShopifyAdminAdapter,
} from "@/src/infrastructure/shopify/admin-graphql/adapter";
import {
  canonicalVariantsFromProducts,
  VariantIdentityRegistry,
} from "@/src/infrastructure/shopify/catalog-identity";
import { ShopifyGraphQlClient } from "@/src/infrastructure/shopify/client";
import { ShopifyCommerceReader } from "@/src/infrastructure/shopify/commerce-reader";
import {
  createShopifyRuntime,
  loadShopifyRuntimeSettingsOrNull,
} from "@/src/infrastructure/shopify/runtime";
import { ShopifyQlAdapter } from "@/src/infrastructure/shopify/shopifyql/adapter";
import { ConsoleLogger } from "@/src/infrastructure/logging";
import { ParityLedger } from "@/src/infrastructure/sources/parity-ledger";
import { ParityTabSource } from "@/src/infrastructure/sources/parity-tab-source";

const REQUIRED_SHOPIFY = [
  "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "SHOPIFY_ADMIN_API_VERSION",
];
const REQUIRED_GOOGLE = ["GOOGLE_PROJECT_ID", "GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"];
const missing = (names: readonly string[]) => names.filter((name) => !process.env[name]);

const DAY = 86_400_000;
const today = reportingDate(new Date().toISOString());
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const previousMonth = (() => {
  const start = monthStart(shift(monthStart(today), -1));
  return { label: "previous_month", startDate: start, endDate: shift(monthStart(today), -1) };
})();
const PERIODS = [
  { label: "last_7_days", startDate: shift(today, -6), endDate: today },
  { label: "last_30_days", startDate: shift(today, -29), endDate: today },
  { label: "last_90_days", startDate: shift(today, -89), endDate: today },
  previousMonth,
  { label: "current_month", startDate: monthStart(today), endDate: today },
  { label: "all_history", startDate: "2023-01-01", endDate: today },
];

describe("live parity (opt-in)", () => {
  it("reconciles Sheets vs Shopify and ShopifyQL vs Admin orders", async () => {
    const blocked = [...missing(REQUIRED_SHOPIFY), ...missing(REQUIRED_GOOGLE)];
    if (missing(REQUIRED_SHOPIFY).length > 0) {
      // Not a pass: the run could not happen. Fail loudly with the exact gap.
      throw new Error(`BLOCKED: missing environment variables: ${blocked.join(", ")}`);
    }

    const settings = loadShopifyRuntimeSettingsOrNull();
    if (!settings) throw new Error("BLOCKED: Shopify settings did not load from the environment");
    const runtime = await createShopifyRuntime(settings);
    const client = new ShopifyGraphQlClient(runtime.configuration, runtime.accessToken, {
      maxThrottleWaitMs: businessConfiguration.shopify.analyticsMaxThrottleWaitMs,
    });
    const admin = new ShopifyAdminAdapter(client, {
      pageSize: businessConfiguration.shopify.orders.pageSize,
      maxPages: businessConfiguration.shopify.catalog.maxPages,
      orderMaxPages: businessConfiguration.shopify.orders.maxPages,
    });
    const shopifyql = new ShopifyQlAdapter(client, 1);
    const hasReadAllOrders = runtime.configuration.grantedScopes.includes("read_all_orders");
    const reader = new ShopifyCommerceReader(admin, hasReadAllOrders);

    const reports: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      grantedScopes: runtime.configuration.grantedScopes,
      blocked,
    };

    // 1. Sheets vs Shopify, per replaceable tab (only when Google is configured).
    const sheetsConfig =
      missing(REQUIRED_GOOGLE).length === 0 ? loadSheetsApiConfigurationOrNull("executive") : null;
    if (sheetsConfig) {
      const ledger = new ParityLedger();
      const parity = new ParityTabSource(new SheetsApiClient(sheetsConfig), {
        mode: "parallel",
        ledger,
        logger: new ConsoleLogger(),
        now: () => new Date(),
        reader: async () => reader,
      });
      await parity.compareNow("migrated", [
        "SKU_Master",
        "Location_Master",
        "Inventory_Snapshots",
        "Warehouse_Fulfillment",
      ]);
      reports["sheetsVsShopify"] = ledger.latest();
    } else {
      reports["sheetsVsShopify"] = `BLOCKED: missing ${missing(REQUIRED_GOOGLE).join(", ")}`;
    }

    // 2. Historical order reconciliation: the dashboard's current source
    //    (ShopifyQL, provider-computed) vs the migrated Admin read (C-2/C-3/C-4).
    const catalog = await admin.readProducts({
      dateRange: { startDate: today, endDate: today },
      hasReadAllOrders,
    });
    const registry = new VariantIdentityRegistry(canonicalVariantsFromProducts(catalog.records));
    const historical: Record<string, ReconciliationReport | string> = {};
    for (const period of PERIODS) {
      const [ql, orders] = await Promise.all([
        shopifyql.read({ dataset: "product_line_classification", dateRange: period }),
        admin.readOrders({
          dateRange: period,
          hasReadAllOrders,
          createdAt: paddedCreatedAtWindow(period),
        }),
      ]);
      const inPeriod = orders.records.filter((order) => {
        const day = reportingDate(order.processedAt ?? order.createdAt);
        return !order.test && day >= period.startDate && day <= period.endDate;
      });
      const adminUnits = new Map<string, number>();
      let feeLines = 0;
      for (const order of inPeriod) {
        for (const line of order.lineItems ?? []) {
          if (line.lineClass === "fee") {
            feeLines += 1;
            continue;
          }
          const sku = registry.resolveLine(line).sku ?? "UNRESOLVED";
          adminUnits.set(sku, (adminUnits.get(sku) ?? 0) + line.currentQuantity);
        }
      }
      const qlUnits = ql.rows
        .filter((row) => row["line_type"] === "product")
        .map((row) => ({
          sku:
            typeof row["product_variant_sku"] === "string"
              ? row["product_variant_sku"]
              : "UNRESOLVED",
          units: Number(row["net_items_sold"] ?? 0),
        }));
      historical[period.label] = reconcile({
        dataset: `units_by_sku:${period.label}`,
        oldSource: "shopifyql:product_line_classification(net_items_sold)",
        newSource: "shopify_admin:orders.lineItems(currentQuantity, product+custom)",
        oldRows: qlUnits,
        newRows: [...adminUnits].map(([sku, units]) => ({ sku, units })),
        oldKey: (row) => row.sku,
        newKey: (row) => row.sku,
        fields: [{ name: "units", old: (row) => row.units, new: (row) => row.units, total: true }],
        notes: [
          `${period.startDate}..${period.endDate}; Admin side dated by processedAt in America/New_York, test orders excluded`,
          `Admin fee lines excluded: ${feeLines}; Admin truncated: ${orders.truncated}`,
          "ShopifyQL nets returns into net_items_sold; Admin currentQuantity nets refund/edit removals — the definitions are close, not identical.",
        ],
      });
    }
    reports["historicalOrders"] = historical;

    const directory = process.env["PARITY_REPORT_DIR"] ?? tmpdir();
    await mkdir(directory, { recursive: true });
    const path = join(directory, `zacao-parity-${Date.now()}.json`);
    await writeFile(path, JSON.stringify(reports, null, 2));
    console.info(`Parity report written to ${path}`);
  });
});
