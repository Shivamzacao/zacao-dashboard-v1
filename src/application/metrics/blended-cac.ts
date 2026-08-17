import type { MetricViewModel } from "@/src/application/view-models";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";
import { usdFromDecimalNumber } from "@/src/domain/metrics/calculations";
import { addUsd, divideAndRound, usd } from "@/src/domain/utilities/money";

import { calculateFirstTimeCustomers } from "./customer-ltv";
import type { MetricServiceContext } from "./types";
import { createMetricViewModel } from "./view-model";

/**
 * Paid-Media Blended CAC, Shopify Customers Only (DEC-019).
 *
 *   in-scope paid media spend in the period ÷ unique Shopify customers whose first
 *   order falls in the same period
 *
 * The two halves come from different systems and neither can validate the other, so
 * every structural limit of the join is disclosed rather than absorbed. This is not a
 * company-wide CAC and must never be presented as one.
 *
 * Deliberately NOT campaign-attributed: it uses all in-scope spend against all
 * first-time Shopify customers in the same window, which is why it needs no attribution
 * model and no attribution window. Campaign-level Paid CAC (`marketing.paid_cac`) is the
 * attributed metric and remains separate.
 */

/**
 * Platforms whose spend is excluded from the numerator.
 *
 * The denominator counts Shopify customers only, so spend that acquires customers
 * Shopify never sees would inflate the numerator against a population it did not
 * produce. `amazon_ads` acquires Amazon buyers; `klaviyo` is retention tooling billed
 * as spend, not acquisition media.
 */
const EXCLUDED_PLATFORMS: ReadonlySet<string> = new Set(["amazon_ads", "klaviyo"]);

/**
 * The provenance of the number, in one place.
 *
 * A later change will persist these alongside every CAC result as audit metadata. Until
 * then they are the single source for the metric's disclosure text, so the prose cannot
 * drift between the catalog, the warnings and whatever consumes them next.
 */
export const BLENDED_CAC_DEFINITION = Object.freeze({
  definition:
    "In-scope paid media spend in the reporting period divided by unique Shopify customers whose first order occurred in the same period.",
  spendScope:
    "Paid media only, excluding amazon_ads and klaviyo. Excludes affiliate commissions, agency fees, events, gifting and other go-to-market costs.",
  customerPopulation:
    "Unique Shopify customers with a qualifying first order in the period. Excludes manually reported external-channel customers, which cannot be deduplicated.",
  attributionSource: "Not applicable — not campaign-attributed.",
  attributionModel: null,
  attributionWindow: null,
});

/** Structural truths about the join. Every one of these is always true, so all ship. */
const STRUCTURAL_WARNINGS: readonly string[] = [
  // Wholesale/Faire, Amazon, TikTok Shop and in-store customers are not in the count.
  "BLENDED_CAC_SHOPIFY_ONLY_DENOMINATOR",
  // Affiliate commissions, agency fees, events and gifting are not in the numerator.
  "BLENDED_CAC_PAID_MEDIA_SPEND_ONLY",
  // Never present this as a company-wide CAC.
  "BLENDED_CAC_NOT_COMPANY_WIDE",
  // Records the approved platform filter, so a reader can tell what the total omits.
  "BLENDED_CAC_SCOPE_EXCLUDES_AMAZON_KLAVIYO",
  // Shopify order mapping drops orders with no customer id, so guest first-time buyers
  // never reach the denominator and CAC is overstated to that extent. Unconditional:
  // those rows are gone upstream, so their absence cannot be detected here.
  "BLENDED_CAC_GUEST_CHECKOUTS_EXCLUDED",
];

function text(record: SheetRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(record: SheetRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * In-scope paid media spend for the period, in USD minor units.
 *
 * Two divergences from `buildPaidCacMetric` that are intentional:
 *
 *  - Rows with no `new_customers_acquired` still count. That metric skips them to keep
 *    its own numerator and denominator matched; here the denominator comes from Shopify,
 *    so dropping the spend would understate the cost of acquisition.
 *  - `cac_usd` is never read. It is an `IFERROR(..., 0)` sheet formula, so a blank
 *    attributed-customer count reads as a real $0 — see the contract note on
 *    Marketing_Spend. The value is recomputed here instead.
 */
export function calculateInScopePaidSpend(input: {
  readonly rows: readonly SheetRecord[];
  readonly startDate: string;
  readonly endDate: string;
}): { readonly minorUnits: number; readonly rowsCounted: number; readonly rowsExcluded: number } {
  const amounts = [];
  let rowsExcluded = 0;
  for (const row of input.rows) {
    const date = text(row, "date");
    if (!date || date < input.startDate || date > input.endDate) continue;
    const platform = text(row, "platform")?.toLocaleLowerCase("en-US");
    if (platform && EXCLUDED_PLATFORMS.has(platform)) {
      rowsExcluded += 1;
      continue;
    }
    const spend = number(row, "spend_usd");
    if (spend === null) continue;
    amounts.push(usdFromDecimalNumber(spend));
  }
  return {
    minorUnits: amounts.length === 0 ? 0 : addUsd(amounts).minorUnits,
    rowsCounted: amounts.length,
    rowsExcluded,
  };
}

function withState(
  sources: readonly SourceStatus[],
  state: SourceStatus["state"] | null,
  warningCodes: readonly string[],
): readonly SourceStatus[] {
  return sources.map((source) =>
    state === null
      ? source
      : {
          ...source,
          state,
          completeness: state === "partial" ? "partial" : source.completeness,
          warningCodes: [...new Set([...source.warningCodes, ...warningCodes])],
        },
  );
}

export function buildBlendedCacMetric(input: {
  readonly context: MetricServiceContext;
  readonly spendRows: readonly SheetRecord[];
  readonly orderRecords: readonly SheetRecord[];
  readonly channelMapping?: readonly SheetRecord[];
  readonly channels?: readonly string[];
  readonly sourceWarnings?: readonly string[];
  /**
   * False when the workbook could not be read at all. An unreadable numerator is not
   * zero spend, and the two must not produce the same sentence.
   */
  readonly spendSourceReadable?: boolean;
}): MetricViewModel {
  const { startDate, endDate } = input.context.dataPeriod;
  const spend = calculateInScopePaidSpend({ rows: input.spendRows, startDate, endDate });
  const customers = calculateFirstTimeCustomers({
    records: input.orderRecords,
    ...(input.channelMapping ? { channelMapping: input.channelMapping } : {}),
    startDate,
    endDate,
    ...(input.channels ? { channels: input.channels } : {}),
  });

  const spendUnreadable = input.spendSourceReadable === false;
  const sourceWarnings = input.sourceWarnings ?? [];
  // Truncated history pushes a long-standing customer's derived first_order_date later,
  // which can land them inside the period and overstate the denominator — making CAC
  // look better than it is. That direction of error needs saying out loud.
  const historyIncomplete = sourceWarnings.some(
    (code) =>
      code === "SHOPIFY_ORDER_HISTORY_TRUNCATED" || code === "SHOPIFY_DETAILED_HISTORY_PARTIAL",
  );
  const warnings = [
    ...sourceWarnings,
    ...STRUCTURAL_WARNINGS,
    ...(historyIncomplete ? ["BLENDED_CAC_DENOMINATOR_MAY_BE_OVERSTATED"] : []),
    ...(spendUnreadable ? ["BLENDED_CAC_SPEND_SOURCE_UNREADABLE"] : []),
    ...(customers.excludedInconsistentRows > 0
      ? [`BLENDED_CAC_EXCLUDED_INCONSISTENT_FIRST_ORDER:${customers.excludedInconsistentRows}`]
      : []),
  ];

  // Null, never zero. A missing side is not a $0 acquisition cost, and either half being
  // absent makes the ratio meaningless rather than small.
  const publishable = !spendUnreadable && spend.minorUnits > 0 && customers.count > 0;
  const unavailableReason = spendUnreadable
    ? "Marketing_Spend could not be read, so the spend numerator is unknown."
    : spend.minorUnits <= 0
      ? "No in-scope paid media spend in the selected period."
      : "Paid media spend ran, but no Shopify customer placed a first order in this period.";

  return createMetricViewModel({
    metricKey: "marketing.cac",
    environment: input.context.environment,
    dataPeriod: input.context.dataPeriod,
    sources: withState(
      input.context.sourceStatuses,
      historyIncomplete || customers.excludedInconsistentRows > 0 ? "partial" : null,
      warnings,
    ),
    value: publishable
      ? { kind: "money", value: usd(divideAndRound(spend.minorUnits, customers.count)) }
      : null,
    warnings,
    ...(publishable ? {} : { dataPendingReason: unavailableReason }),
  });
}
