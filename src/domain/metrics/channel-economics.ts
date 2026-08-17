/**
 * Per-channel selling economics: what a bar sells for, and what the channel
 * takes before the money reaches ZACAO.
 *
 * The workbook carries this on the visible `COGS & Targets` tab under "CHANNEL
 * ECONOMICS AND REVENUE MIX TARGETS". That tab is human-formatted — its header
 * row is row 14, not row 1 — so it has no hidden normalized contract tab and the
 * Sheets reader cannot consume it. Until one exists, the rates live here as the
 * effective-dated configuration table the business-logic specification asks for
 * (§4.2, "create explicit channel_terms and supplier_terms configuration tables
 * with effective dates and validation").
 *
 * IMPORTANT: most of these rates are PLACEHOLDERS, not approved figures. Only a
 * rate carrying `approved: true` was supplied by ZACAO. Every channel whose rate
 * is unapproved makes the margin derived from it provisional, and that has to
 * reach the reader — see CHANNEL_FEES_PROVISIONAL in revenue-channels.ts. Do not
 * silently promote a placeholder to approved; replace the number and the source
 * note together.
 */

/** Blended landed cost of one bar, in USD. */
export interface ChannelEconomics {
  /** Selling price of one bar on this channel, USD. */
  readonly pricePerBarUsd: number;
  /** Fulfillment cost per *order*, USD — per shipment, never per bar. */
  readonly fulfillmentPerOrderUsd: number;
  /** Channel take rate applied to net revenue, as a fraction (0.08 = 8%). */
  readonly variableFeeRate: number;
  /** Flat processing charge per order, USD. */
  readonly flatFeePerOrderUsd: number;
  /** Whether ZACAO has approved these rates, as opposed to a working guess. */
  readonly approved: boolean;
  /** Why the number is what it is. Shown to engineers, not to the dashboard. */
  readonly note: string;
}

/**
 * Blended landed COGS per bar, from the workbook's operating defaults.
 *
 * Per-channel revenue facts carry no unit counts, so a true SKU-mix COGS cannot
 * be built here. The specification permits the blended cost only as an
 * explicitly labelled fallback (§7, "use blended cost only as an explicitly
 * labelled fallback when SKU mix is unavailable"), which is what
 * MARGIN_ESTIMATED_FROM_BLENDED_COGS discloses.
 */
/**
 * @deprecated Superseded in principle by DEC-020 and not yet rewired.
 *
 * This is SKU-02's stored `total_unit_cost_usd`, which DEC-020 established omits
 * `packaging_usd` — so it understates landed cost by roughly 9c and disagrees with
 * `finance.effective_cogs`, which recomputes from components. It is left in place
 * deliberately: replacing it means threading a real cost through
 * `channelContributionMarginBasisPoints` and every caller, and a channel margin
 * built on a wrong constant should not be swapped for one that silently changes
 * without ZACAO seeing the movement first.
 */
export const BLENDED_LANDED_COGS_PER_BAR_USD = 2.494;

/**
 * Keyed by the dashboard's canonical channel taxonomy, which does not match the
 * workbook's channel labels — "Website / DTC" there is "DTC — Site" here. The
 * mapping is applied when transcribing, so a workbook rename does not silently
 * drop a channel's economics; it leaves it absent, and absent means no margin.
 */
export const CHANNEL_ECONOMICS: Readonly<Record<string, ChannelEconomics>> = Object.freeze({
  "DTC — Site": {
    pricePerBarUsd: 8.99,
    fulfillmentPerOrderUsd: 7.96,
    // PLACEHOLDER. The workbook records no DTC fee at all, but Shopify Payments
    // charges on every order, so a zero would overstate margin rather than
    // merely leave it unknown.
    variableFeeRate: 0.029,
    flatFeePerOrderUsd: 0.3,
    approved: false,
    note: "PLACEHOLDER: standard Shopify Payments 2.9% + $0.30. Workbook records no DTC fee. Price/bar and fulfillment are confirmed.",
  },
  "DTC — Affiliate": {
    pricePerBarUsd: 8.99,
    fulfillmentPerOrderUsd: 7.96,
    variableFeeRate: 0.15,
    flatFeePerOrderUsd: 0.3,
    approved: false,
    note: "PLACEHOLDER: no workbook row exists for this channel. Assumes ShopMy-equivalent commission plus payment processing.",
  },
  ShopMy: {
    pricePerBarUsd: 8.99,
    fulfillmentPerOrderUsd: 7.96,
    variableFeeRate: 0.15,
    flatFeePerOrderUsd: 0,
    approved: false,
    note: 'PLACEHOLDER: typical creator-affiliate commission. Workbook says "Commission rate remains to be confirmed."',
  },
  "TikTok Shop": {
    pricePerBarUsd: 8.99,
    fulfillmentPerOrderUsd: 7.96,
    // The only rate ZACAO has actually supplied. The workbook states it twice —
    // Variable Fee % 0.08 and Other Fees / Bar 0.7192, which is 8% of the $8.99
    // price. Applying both would charge the same platform fee twice, so the rate
    // is taken once, as a percentage.
    variableFeeRate: 0.08,
    flatFeePerOrderUsd: 0,
    approved: true,
    note: 'CONFIRMED: workbook COGS & Targets row 17, "Platform fee is 8% of MSRP."',
  },
  "IG Shop": {
    pricePerBarUsd: 8.99,
    fulfillmentPerOrderUsd: 7.96,
    variableFeeRate: 0.05,
    flatFeePerOrderUsd: 0,
    approved: false,
    note: 'PLACEHOLDER: typical Meta commerce plus processing. Workbook says "Use actual Meta commerce and processing fees when active."',
  },
  "Wholesale / Faire": {
    pricePerBarUsd: 4.5,
    fulfillmentPerOrderUsd: 0,
    variableFeeRate: 0.15,
    flatFeePerOrderUsd: 0,
    approved: false,
    note: "PLACEHOLDER: Faire new-customer commission. Workbook price is a $4.10–$4.95 midpoint, itself unconfirmed.",
  },
  "In-store — Cafés": {
    pricePerBarUsd: 4.5,
    fulfillmentPerOrderUsd: 0,
    variableFeeRate: 0,
    flatFeePerOrderUsd: 0,
    approved: false,
    note: 'Zero fee is the workbook value, but the price "uses wholesale midpoint until account-specific pricing is available."',
  },
  "In-store — Distribution": {
    pricePerBarUsd: 4.55,
    fulfillmentPerOrderUsd: 0,
    variableFeeRate: 0,
    flatFeePerOrderUsd: 0,
    approved: false,
    note: "PLACEHOLDER: no workbook row. Uses the $4.55 distributor price, which the guide flags as conflicting with a second source quoting ~15% below $4.50.",
  },
  "Events / Pop-ups": {
    pricePerBarUsd: 8.99,
    fulfillmentPerOrderUsd: 0,
    variableFeeRate: 0,
    flatFeePerOrderUsd: 0,
    approved: false,
    note: 'Zero fee is the workbook value; it says "Enter event-specific fees in actuals if material."',
  },
  // "Unclassified" is deliberately absent. Revenue that could not be mapped to a
  // channel has no known price or take rate, so its margin stays unavailable
  // rather than being charged some blended guess.
});

export function channelEconomics(channel: string): ChannelEconomics | null {
  return CHANNEL_ECONOMICS[channel] ?? null;
}

export interface ChannelMarginInput {
  readonly channel: string;
  readonly revenueMinorUnits: number;
  readonly orders: number;
}

export interface ChannelMarginResult {
  /** Contribution margin in basis points, or null when it cannot be derived. */
  readonly basisPoints: number | null;
  /**
   * Contribution margin in USD minor units, or null alongside `basisPoints`.
   * Callers aggregate these to blend a company-wide rate; re-averaging the
   * basis points instead would weight a tiny channel like a large one.
   */
  readonly marginMinorUnits: number | null;
  /** True when the rates used were not approved by ZACAO. */
  readonly provisional: boolean;
}

/**
 * Contribution margin for one channel, in basis points.
 *
 *   (net revenue − estimated landed COGS − channel fees − fulfillment) / net revenue
 *
 * Bars are inferred from revenue and the channel's price per bar, because the
 * per-channel revenue facts carry no unit counts. That makes the COGS term an
 * estimate, not a measurement, which is why every result here is disclosed
 * rather than presented as certified.
 *
 * Returns null rather than zero whenever an input is missing or revenue is zero:
 * a missing denominator is not a 0% margin (specification §2, safe_divide).
 */
export function channelContributionMarginBasisPoints(
  input: ChannelMarginInput,
): ChannelMarginResult {
  const economics = channelEconomics(input.channel);
  if (!economics) return { basisPoints: null, marginMinorUnits: null, provisional: false };
  if (input.revenueMinorUnits <= 0 || economics.pricePerBarUsd <= 0) {
    return { basisPoints: null, marginMinorUnits: null, provisional: !economics.approved };
  }

  const revenueUsd = input.revenueMinorUnits / 100;
  const estimatedBars = revenueUsd / economics.pricePerBarUsd;
  const cogsUsd = estimatedBars * BLENDED_LANDED_COGS_PER_BAR_USD;
  const feesUsd =
    revenueUsd * economics.variableFeeRate + input.orders * economics.flatFeePerOrderUsd;
  const fulfillmentUsd = input.orders * economics.fulfillmentPerOrderUsd;

  const marginMinorUnits = Math.round((revenueUsd - cogsUsd - feesUsd - fulfillmentUsd) * 100);
  const basisPoints = Math.round((marginMinorUnits / input.revenueMinorUnits) * 10_000);
  return { basisPoints, marginMinorUnits, provisional: !economics.approved };
}
