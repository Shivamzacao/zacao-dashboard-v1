import { z } from "zod";

import type {
  BillingGeographyFact,
  CatalogVariantFact,
  CustomerClassificationSummary,
  FulfillmentTrendFact,
  InventoryFact,
  NativeChannelFact,
  ProductSalesFact,
  ProductUnitsFact,
  PurchaseTimingFact,
  ShopifyFunnelFact,
  ShopifySalesTotalsFact,
  ShopifySalesTrendPoint,
} from "@/src/application/metrics/types";
import { ratioToBasisPoints } from "@/src/domain/utilities/money";

import type { normalizeProduct } from "./normalization";

type ShopifyQlRow = Readonly<Record<string, unknown>>;
type NormalizedProduct = ReturnType<typeof normalizeProduct>;

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * ShopifyQL returns every value as a decimal string. Money and rates may carry
 * more fractional digits than their display unit, so conversion is done with
 * string/bigint arithmetic — never binary floating point.
 */
function parseDecimalScaled(raw: string, scale: number, label: string): number {
  const match = DECIMAL_PATTERN.exec(raw.trim());
  if (!match) {
    throw new Error(`ShopifyQL ${label} value is not a plain decimal`);
  }
  const [, sign, whole, fraction = ""] = match;
  const scaledFraction = fraction.padEnd(scale + 1, "0");
  const kept = BigInt(whole + scaledFraction.slice(0, scale));
  const roundUp = Number(scaledFraction[scale] ?? "0") >= 5;
  const magnitude = kept + (roundUp ? 1n : 0n);
  const result = Number(sign === "-" ? -magnitude : magnitude);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`ShopifyQL ${label} value exceeds the safe integer range`);
  }
  return result;
}

export function parseShopifyQlCount(value: unknown, label = "count"): number {
  const raw = typeof value === "number" ? String(value) : z.string().parse(value);
  return parseDecimalScaled(raw, 0, label);
}

export function parseShopifyQlMoneyMinorUnits(value: unknown, label = "money"): number {
  const raw = typeof value === "number" ? String(value) : z.string().parse(value);
  return parseDecimalScaled(raw, 2, label);
}

export function parseShopifyQlRateBasisPoints(value: unknown, label = "rate"): number {
  const raw = typeof value === "number" ? String(value) : z.string().parse(value);
  return parseDecimalScaled(raw, 4, label);
}

function requireColumn(row: ShopifyQlRow, column: string): unknown {
  if (!(column in row)) {
    throw new Error(`ShopifyQL response is missing the required column: ${column}`);
  }
  return row[column];
}

function optionalText(value: unknown): string | null {
  const parsed = z.string().nullable().optional().parse(value);
  const trimmed = parsed?.trim();
  return trimmed ? trimmed : null;
}

export function mapCustomerClassificationSummary(
  rows: readonly ShopifyQlRow[],
): CustomerClassificationSummary {
  const facts = rows.map((row) => {
    const label = optionalText(requireColumn(row, "new_or_returning_customer"))?.toLowerCase();
    const classification =
      label === "new"
        ? ("new" as const)
        : label === "returning"
          ? ("returning" as const)
          : ("unclassified" as const);
    return {
      classification,
      customers: parseShopifyQlCount(requireColumn(row, "customers"), "customers"),
    };
  });
  const returning = facts
    .filter(({ classification }) => classification === "returning")
    .reduce((total, { customers }) => total + customers, 0);
  const classified = facts
    .filter(({ classification }) => classification !== "unclassified")
    .reduce((total, { customers }) => total + customers, 0);
  return {
    rows: facts,
    returningRateBasisPoints: ratioToBasisPoints(returning, classified),
  };
}

export function mapShopifyFunnelFact(rows: readonly ShopifyQlRow[]): ShopifyFunnelFact | null {
  if (rows.length === 0) return null;
  const sum = (column: string) =>
    rows.reduce((total, row) => total + parseShopifyQlCount(requireColumn(row, column), column), 0);
  const sessions = sum("sessions");
  const completedCheckout = sum("sessions_that_completed_checkout");
  const conversionRateBasisPoints = ratioToBasisPoints(completedCheckout, sessions);
  if (conversionRateBasisPoints === null) return null;
  return {
    sessions,
    visitors: sum("online_store_visitors"),
    cartAdditions: sum("sessions_with_cart_additions"),
    reachedCheckout: sum("sessions_that_reached_checkout"),
    completedCheckout,
    conversionRateBasisPoints,
  };
}

export function mapProductUnitsFacts(
  rows: readonly ShopifyQlRow[],
  periodLabel: string,
): readonly ProductUnitsFact[] {
  return rows.map((row) => ({
    period: periodLabel,
    product: optionalText(requireColumn(row, "product_title")) ?? "(blank product)",
    variant: optionalText(requireColumn(row, "product_variant_title")),
    sku: optionalText(requireColumn(row, "product_variant_sku")),
    merchandise: optionalText(requireColumn(row, "line_type"))?.toLowerCase() === "product",
    units: parseShopifyQlCount(requireColumn(row, "net_items_sold"), "net_items_sold"),
  }));
}

/** DEC-015: canonical provider aggregates for one period, passed through. */
export function mapSalesTotalsFact(rows: readonly ShopifyQlRow[]): ShopifySalesTotalsFact | null {
  const row = rows[0];
  if (!row) return null;
  if (rows.length > 1) {
    throw new Error("ShopifyQL sales totals must be a single aggregate row");
  }
  return {
    orders: parseShopifyQlCount(requireColumn(row, "orders"), "orders"),
    grossSalesMinorUnits: parseShopifyQlMoneyMinorUnits(
      requireColumn(row, "gross_sales"),
      "gross_sales",
    ),
    discountsMinorUnits: parseShopifyQlMoneyMinorUnits(
      requireColumn(row, "discounts"),
      "discounts",
    ),
    returnsMinorUnits: parseShopifyQlMoneyMinorUnits(requireColumn(row, "returns"), "returns"),
    netSalesMinorUnits: parseShopifyQlMoneyMinorUnits(requireColumn(row, "net_sales"), "net_sales"),
    shippingChargesMinorUnits: parseShopifyQlMoneyMinorUnits(
      requireColumn(row, "shipping_charges"),
      "shipping_charges",
    ),
    taxesMinorUnits: parseShopifyQlMoneyMinorUnits(requireColumn(row, "taxes"), "taxes"),
    totalSalesMinorUnits: parseShopifyQlMoneyMinorUnits(
      requireColumn(row, "total_sales"),
      "total_sales",
    ),
    averageOrderValueMinorUnits: parseShopifyQlMoneyMinorUnits(
      requireColumn(row, "average_order_value"),
      "average_order_value",
    ),
  };
}

export function mapSalesTrendPoints(
  rows: readonly ShopifyQlRow[],
  periodColumn = "month",
): readonly ShopifySalesTrendPoint[] {
  return rows.map((row) => ({
    period: String(requireColumn(row, periodColumn)),
    netSalesMinorUnits: parseShopifyQlMoneyMinorUnits(requireColumn(row, "net_sales"), "net_sales"),
  }));
}

/**
 * ShopifyQL's documented `day_of_week` schema returns the weekday name
 * ("Monday".."Sunday"), but live accounts have been observed returning a
 * numeric day code instead. Accept either: names pass through unchanged,
 * numeric codes are translated to a name so the purchase-timing heatmap never
 * shows a bare digit as a row label.
 *
 * The numeric convention (0 = Sunday .. 6 = Saturday, matching JS
 * `Date.getDay()`) is not confirmed against a live account — verify against
 * real order timestamps once live Shopify access is available, and correct
 * `WEEKDAY_BY_NUMBER` below if the mapping is off by a day.
 */
const WEEKDAY_BY_NUMBER = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const WEEKDAY_NAMES = new Set<string>(WEEKDAY_BY_NUMBER);

function normalizeDayOfWeek(value: string): string {
  const trimmed = value.trim();
  if (WEEKDAY_NAMES.has(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) % WEEKDAY_BY_NUMBER.length;
    return WEEKDAY_BY_NUMBER[index] ?? trimmed;
  }
  return trimmed;
}

export function mapPurchaseTimingFacts(
  rows: readonly ShopifyQlRow[],
): readonly PurchaseTimingFact[] {
  return rows.map((row) => ({
    dayOfWeek: normalizeDayOfWeek(String(requireColumn(row, "day_of_week"))),
    hourOfDay: String(requireColumn(row, "hour_of_day")),
    orders: parseShopifyQlCount(requireColumn(row, "orders"), "orders"),
  }));
}

export function mapBillingGeographyFacts(
  rows: readonly ShopifyQlRow[],
): readonly BillingGeographyFact[] {
  return rows.map((row) => ({
    country: optionalText(requireColumn(row, "billing_country")) ?? "Unknown",
    region: optionalText(requireColumn(row, "billing_region")),
    orders: parseShopifyQlCount(requireColumn(row, "orders"), "orders"),
    totalSalesMinorUnits: parseShopifyQlMoneyMinorUnits(
      requireColumn(row, "total_sales"),
      "total_sales",
    ),
  }));
}

export function mapProductSalesFacts(rows: readonly ShopifyQlRow[]): readonly ProductSalesFact[] {
  return rows.map((row) => ({
    product: optionalText(requireColumn(row, "product_title")) ?? "(blank product)",
    variant: optionalText(requireColumn(row, "product_variant_title")),
    sku: optionalText(requireColumn(row, "product_variant_sku")),
    merchandise: optionalText(requireColumn(row, "line_type"))?.toLowerCase() === "product",
    netSalesMinorUnits: parseShopifyQlMoneyMinorUnits(requireColumn(row, "net_sales"), "net_sales"),
  }));
}

/** DEC-016: provider sales_channel values verbatim; blanks → Unclassified. */
export function mapNativeChannelFacts(rows: readonly ShopifyQlRow[]): readonly NativeChannelFact[] {
  return rows.map((row) => ({
    channel: optionalText(requireColumn(row, "sales_channel")) ?? "Unclassified",
    orders: parseShopifyQlCount(requireColumn(row, "orders"), "orders"),
    netSalesMinorUnits: parseShopifyQlMoneyMinorUnits(requireColumn(row, "net_sales"), "net_sales"),
    totalSalesMinorUnits: parseShopifyQlMoneyMinorUnits(
      requireColumn(row, "total_sales"),
      "total_sales",
    ),
  }));
}

export function mapFulfillmentTrendFacts(
  rows: readonly ShopifyQlRow[],
  periodColumn = "month",
): readonly FulfillmentTrendFact[] {
  return rows.map((row) => ({
    period: String(requireColumn(row, periodColumn)),
    ordersFulfilled: parseShopifyQlCount(
      requireColumn(row, "orders_fulfilled"),
      "orders_fulfilled",
    ),
    ordersShipped: parseShopifyQlCount(requireColumn(row, "orders_shipped"), "orders_shipped"),
    ordersDelivered: parseShopifyQlCount(
      requireColumn(row, "orders_delivered"),
      "orders_delivered",
    ),
  }));
}

export function mapCatalogVariantFacts(
  products: readonly NormalizedProduct[],
): readonly CatalogVariantFact[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      productId: product.id,
      productTitle: product.title,
      productStatus: product.status,
      variantId: variant.id,
      variantTitle: variant.title,
      sku: variant.sku,
      priceMinorUnits: variant.price.minorUnits,
      activeOrSold: product.status.toUpperCase() === "ACTIVE",
      unitCostMinorUnits: variant.inventoryItem?.unitCost?.minorUnits ?? null,
    })),
  );
}

export function mapInventoryFacts(
  products: readonly NormalizedProduct[],
): readonly InventoryFact[] {
  return products.flatMap((product) =>
    product.variants.flatMap((variant) => {
      const inventoryItem = variant.inventoryItem;
      if (!inventoryItem || !inventoryItem.tracked) return [];
      return inventoryItem.inventoryLevels.flatMap((level) =>
        Object.entries(level.quantities).map(([quantityName, quantity]) => ({
          locationId: level.location.id,
          locationName: level.location.name,
          productTitle: product.title,
          variantTitle: variant.title,
          sku: inventoryItem.sku ?? variant.sku,
          quantityName,
          quantity,
          updatedAt: level.updatedAt,
        })),
      );
    }),
  );
}
