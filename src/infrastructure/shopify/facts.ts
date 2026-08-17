import { z } from "zod";

import type {
  BillingGeographyFact,
  AffiliateSalesFact,
  AffiliateSessionFact,
  CatalogVariantFact,
  CustomerClassificationSummary,
  CustomerCityFact,
  FulfillmentTrendFact,
  InventoryFact,
  NativeChannelFact,
  ProductSalesFact,
  ProductUnitsFact,
  PurchaseTimingFact,
  ReturningCustomerRateFact,
  ShopifyFunnelFact,
  ShopifySessionEngagementFact,
  ShopifySalesTotalsFact,
  ShopifySalesTrendPoint,
  TrafficAttributionFact,
  WeeklyProductUnitsFact,
} from "@/src/application/metrics/types";
import { BLANK_PRODUCT_TITLE } from "@/src/application/metrics/sku-labels";
import { ratioToBasisPoints } from "@/src/domain/utilities/money";

import type { normalizeOrder, normalizeProduct } from "./normalization";

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

function isProviderZero(value: unknown): boolean {
  if (typeof value === "number") return value === 0;
  if (typeof value !== "string") return false;
  return /^-?0+(?:\.0+)?$/.test(value.trim());
}

function isNoActivityMeasure(value: unknown): boolean {
  return value === null || isProviderZero(value);
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
  return { rows: facts };
}

/**
 * Shopify's own returning-customer rate, passed through untouched.
 *
 * This used to be derived here as returning / (new + returning) from the grouped
 * classification rows. That is wrong: one customer can appear in *both* groups
 * inside a period — a first purchase followed by a repeat — so summing the groups
 * double-counts them in the denominator and deflates the rate. The provider figure
 * accounts for the overlap and no local division can.
 *
 * `customers` on this dataset is the ungrouped distinct total, which is what makes
 * that overlap detectable downstream.
 */
export function mapReturningCustomerRate(rows: readonly ShopifyQlRow[]): ReturningCustomerRateFact {
  const row = rows[0];
  if (!row) return { returningRateBasisPoints: null, distinctCustomers: null };
  const rate = requireColumn(row, "returning_customer_rate");
  const customers = requireColumn(row, "customers");
  const distinctCustomers = customers === null ? null : parseShopifyQlCount(customers, "customers");
  return {
    // A provider zero is a real 0% — a week where nobody came back is an answer, not
    // missing data (spec §9). Only an actual null is "not reported". The exception is
    // an empty population: a rate over zero customers is undefined, not 0%.
    returningRateBasisPoints:
      rate === null || distinctCustomers === 0
        ? null
        : parseShopifyQlRateBasisPoints(rate, "returning_customer_rate"),
    distinctCustomers,
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

export function mapShopifySessionEngagementFact(
  rows: readonly ShopifyQlRow[],
): ShopifySessionEngagementFact | null {
  const row = rows[0];
  if (!row) return null;
  if (rows.length > 1) {
    throw new Error("ShopifyQL session engagement must be a single aggregate row");
  }
  const duration = requireColumn(row, "average_session_duration");
  if (duration === null) return null;
  return {
    averageSessionDurationSeconds: parseShopifyQlCount(duration, "average_session_duration"),
  };
}

export function mapTrafficAttributionFacts(
  rows: readonly ShopifyQlRow[],
): readonly TrafficAttributionFact[] {
  return rows
    .map((row) => ({
      source: optionalText(requireColumn(row, "referrer_source")) ?? "Unclassified",
      sessions: parseShopifyQlCount(requireColumn(row, "sessions"), "sessions"),
    }))
    .sort(
      (left, right) => right.sessions - left.sessions || left.source.localeCompare(right.source),
    );
}

export function mapAffiliateSessionFacts(
  rows: readonly ShopifyQlRow[],
): readonly AffiliateSessionFact[] {
  return rows.map((row) => ({
    utmSource: optionalText(requireColumn(row, "utm_source")),
    utmCampaign: optionalText(requireColumn(row, "utm_campaign")),
    utmContent: optionalText(requireColumn(row, "utm_content")),
    sessions: parseShopifyQlCount(requireColumn(row, "sessions"), "sessions"),
  }));
}

export function mapAffiliateSalesFacts(
  rows: readonly ShopifyQlRow[],
): readonly AffiliateSalesFact[] {
  return rows.flatMap((row) => {
    const discountCode = optionalText(requireColumn(row, "discount_code"));
    if (!discountCode) return [];
    return [
      {
        discountCode,
        orders: parseShopifyQlCount(requireColumn(row, "orders"), "orders"),
        netSalesMinorUnits: parseShopifyQlMoneyMinorUnits(
          requireColumn(row, "net_sales"),
          "net_sales",
        ),
      },
    ];
  });
}

export function mapProductUnitsFacts(
  rows: readonly ShopifyQlRow[],
  periodLabel: string,
): readonly ProductUnitsFact[] {
  return rows.map((row) => ({
    period: periodLabel,
    product: optionalText(requireColumn(row, "product_title")) ?? BLANK_PRODUCT_TITLE,
    variant: optionalText(requireColumn(row, "product_variant_title")),
    sku: optionalText(requireColumn(row, "product_variant_sku")),
    merchandise: optionalText(requireColumn(row, "line_type"))?.toLowerCase() === "product",
    units: parseShopifyQlCount(requireColumn(row, "net_items_sold"), "net_items_sold"),
  }));
}

export function mapWeeklyProductUnitsFacts(
  rows: readonly ShopifyQlRow[],
): readonly WeeklyProductUnitsFact[] {
  return rows.map((row) => ({
    weekStart: String(requireColumn(row, "week")).slice(0, 10),
    shopifySku: optionalText(requireColumn(row, "product_variant_sku")),
    sourceChannel: optionalText(requireColumn(row, "sales_channel")) ?? "Unclassified",
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
  const measureColumns = [
    "orders",
    "gross_sales",
    "discounts",
    "returns",
    "net_sales",
    "shipping_charges",
    "taxes",
    "total_sales",
    "average_order_value",
  ] as const;
  const measures = measureColumns.map((column) => requireColumn(row, column));
  if (measures.some((value) => value === null)) {
    if (measures.every(isNoActivityMeasure)) return null;
    throw new Error("ShopifyQL sales totals returned a partially null aggregate row");
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
  return rows.flatMap((row) => {
    const period = requireColumn(row, periodColumn);
    const netSales = requireColumn(row, "net_sales");
    if (period === null || netSales === null) {
      if (period === null && isNoActivityMeasure(netSales)) return [];
      throw new Error("ShopifyQL sales trend returned a partially null period row");
    }
    return [
      {
        period: String(period),
        netSalesMinorUnits: parseShopifyQlMoneyMinorUnits(netSales, "net_sales"),
      },
    ];
  });
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

export function mapCustomerCityFacts(rows: readonly ShopifyQlRow[]): readonly CustomerCityFact[] {
  return rows
    .flatMap((row) => {
      const city = optionalText(requireColumn(row, "billing_city"));
      if (!city) return [];
      return [
        {
          city,
          region: optionalText(requireColumn(row, "billing_region")),
          customers: parseShopifyQlCount(requireColumn(row, "customers"), "customers"),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.customers - left.customers ||
        `${left.city}:${left.region ?? ""}`.localeCompare(`${right.city}:${right.region ?? ""}`),
    )
    .slice(0, 7);
}

export function mapProductSalesFacts(rows: readonly ShopifyQlRow[]): readonly ProductSalesFact[] {
  return rows.map((row) => ({
    product: optionalText(requireColumn(row, "product_title")) ?? BLANK_PRODUCT_TITLE,
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
    averageOrderValueMinorUnits: isNoActivityMeasure(requireColumn(row, "average_order_value"))
      ? null
      : parseShopifyQlMoneyMinorUnits(
          requireColumn(row, "average_order_value"),
          "average_order_value",
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

/**
 * Shopify financial statuses folded onto the Sales_Actuals contract. Anything
 * unmapped is left out rather than guessed, so the LTV validator rejects it as
 * an unsupported status instead of silently counting it as revenue.
 */
/** Statuses the LTV calculation treats as revenue-bearing (mirrors QUALIFYING_STATUSES). */
const QUALIFYING_LTV_STATUSES = new Set(["paid", "confirmed", "partially_refunded"]);

const ORDER_STATUS_BY_FINANCIAL_STATUS: Readonly<Record<string, string>> = {
  PAID: "paid",
  PARTIALLY_REFUNDED: "partially_refunded",
  REFUNDED: "refunded",
  AUTHORIZED: "confirmed",
  PARTIALLY_PAID: "confirmed",
  PENDING: "unpaid",
  EXPIRED: "unpaid",
  VOIDED: "cancelled",
};

/** New York calendar date for an instant — the reporting boundary in spec §2. */
function reportingDate(instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

const dollars = (money: { readonly minorUnits: number }) => money.minorUnits / 100;

type NormalizedOrder = ReturnType<typeof normalizeOrder>;

/**
 * Projects Shopify orders onto the Sales_Actuals record contract so the certified
 * realized-LTV and active-customer calculations can run against the provider that
 * actually owns commerce actuals (spec §3), rather than a manually maintained tab.
 *
 * `first_order_date` is derived across every order supplied, so callers must pass
 * a customer's full history — a period-scoped read would relabel long-standing
 * customers as new and trip the validator's inconsistent-first-order check.
 *
 * Customer ids stay server-side: every rendered output is an aggregate.
 */
export function mapShopifyLtvRecords(
  orders: readonly NormalizedOrder[],
  dataAsOf: string,
): readonly Readonly<Record<string, string | number>>[] {
  const eligible = orders.filter((order) => order.customerId !== null);
  // Spec §5.4 defines the cohort by the first *qualifying* order, and the LTV
  // validator drops a customer whose stated first order is not their earliest
  // qualifying one. Counting a cancelled or zero-value first purchase here would
  // therefore discard that customer's entire history.
  const firstQualifying = new Map<string, string>();
  const firstAny = new Map<string, string>();
  for (const order of eligible) {
    const customerId = order.customerId as string;
    const date = reportingDate(order.processedAt ?? order.createdAt);
    const earlier = (map: Map<string, string>) => {
      const previous = map.get(customerId);
      if (previous === undefined || date < previous) map.set(customerId, date);
    };
    earlier(firstAny);
    const status = order.cancelledAt
      ? "cancelled"
      : ORDER_STATUS_BY_FINANCIAL_STATUS[order.financialStatus ?? ""];
    if (status && QUALIFYING_LTV_STATUSES.has(status) && !order.test && dollars(order.subtotal) > 0)
      earlier(firstQualifying);
  }
  // A customer with no qualifying order still needs one consistent date across
  // all their rows, or the consistency check drops them for a different reason.
  const firstOrderDate = (customerId: string) =>
    firstQualifying.get(customerId) ?? firstAny.get(customerId);

  return eligible.flatMap((order) => {
    const customerId = order.customerId as string;
    const status = order.cancelledAt
      ? "cancelled"
      : ORDER_STATUS_BY_FINANCIAL_STATUS[order.financialStatus ?? ""];
    if (!status) return [];
    const orderDate = reportingDate(order.processedAt ?? order.createdAt);
    // Merchandise only: subtotal already excludes shipping and tax, and Shopify
    // reports it net of discounts, so discounts are not deducted a second time.
    const gross = dollars(order.subtotal);
    const refunds = dollars(order.refunded);
    // A cancelled order contributes its own value as the cancellation, leaving
    // net at zero rather than counting revenue that never happened.
    const cancellations = order.cancelledAt ? Math.max(0, gross - refunds) : 0;
    const net = gross - refunds - cancellations;
    return [
      {
        order_id: order.id,
        customer_id: customerId,
        order_date: orderDate,
        first_order_date: firstOrderDate(customerId) ?? orderDate,
        gross_product_sales_usd: gross,
        discounts_usd: 0,
        refunds_returns_usd: refunds,
        cancellations_usd: cancellations,
        net_product_revenue_usd: net,
        order_status: status,
        acquisition_channel: order.sourceName,
        currency: "USD",
        is_test: order.test ? "yes" : "no",
        // Required by the validator: the freshness stamp the sheet contract
        // carried per row. Here it is the moment the provider was read.
        data_as_of: dataAsOf,
      },
    ];
  });
}
