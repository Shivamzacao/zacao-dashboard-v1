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
}): {
  readonly minorUnits: number;
  readonly rowsCounted: number;
  readonly rowsExcluded: number;
  /** Months (`YYYY-MM`) that recorded in-scope spend, for the coverage test. */
  readonly monthsWithSpend: ReadonlySet<string>;
} {
  const amounts = [];
  const monthsWithSpend = new Set<string>();
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
    monthsWithSpend.add(date.slice(0, 7));
  }
  return {
    minorUnits: amounts.length === 0 ? 0 : addUsd(amounts).minorUnits,
    rowsCounted: amounts.length,
    rowsExcluded,
    monthsWithSpend,
  };
}

/**
 * Share of the counted first-time customers who were acquired in a month that recorded
 * in-scope paid spend. Null when there are no customers to divide by.
 *
 * This is the honesty check on a period-scoped CAC ratio. One July spend row divided by
 * twelve months of customers yields a flattering number that says nothing about
 * acquisition cost, because eleven of those months bought no advertising. Coverage
 * detects exactly that: it reads 1.0 for a July-only period and 0.04 for a trailing
 * year, so the ratio can be withheld rather than published as if it meant something.
 */
export function spendCoverage(input: {
  readonly monthsWithSpend: ReadonlySet<string>;
  readonly countsByMonth: ReadonlyMap<string, number>;
  readonly customerCount: number;
}): number | null {
  if (input.customerCount <= 0) return null;
  let covered = 0;
  for (const [month, count] of input.countsByMonth) {
    if (input.monthsWithSpend.has(month)) covered += count;
  }
  return covered / input.customerCount;
}

/**
 * Coverage floor for publishing the ratio.
 *
 * Set so the one period whose spend actually explains its customers publishes, while a
 * widened window whose extra customers arrived in unfunded months does not. It is a
 * threshold on data completeness, not on the ratio's value — a bad ratio computed over
 * well-covered months is exactly the number the reader needs to see.
 */
export const LTV_CAC_MIN_SPEND_COVERAGE = 0.8;

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
  return assembleBlendedCac({
    context: input.context,
    spend: calculateInScopePaidSpend({ rows: input.spendRows, startDate, endDate }),
    customers: calculateFirstTimeCustomers({
      records: input.orderRecords,
      ...(input.channelMapping ? { channelMapping: input.channelMapping } : {}),
      startDate,
      endDate,
      ...(input.channels ? { channels: input.channels } : {}),
    }),
    ...(input.sourceWarnings ? { sourceWarnings: input.sourceWarnings } : {}),
    ...(input.spendSourceReadable === undefined
      ? {}
      : { spendSourceReadable: input.spendSourceReadable }),
  });
}

/**
 * The CAC view model, from already-computed inputs.
 *
 * Split out so `buildPaidAcquisitionViews` can hand the same spend and customer results
 * to both this and the ratio without walking order history twice.
 */
function assembleBlendedCac(input: {
  readonly context: MetricServiceContext;
  readonly spend: ReturnType<typeof calculateInScopePaidSpend>;
  readonly customers: ReturnType<typeof calculateFirstTimeCustomers>;
  readonly sourceWarnings?: readonly string[];
  readonly spendSourceReadable?: boolean;
}): MetricViewModel {
  const { spend, customers } = input;
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

function moneyMinorUnits(metric: MetricViewModel): number | null {
  return metric.value?.kind === "money" ? metric.value.value.minorUnits : null;
}

/**
 * 90-Day LTV : Paid-Media Blended CAC (DEC-021).
 *
 * Both halves come from metrics that are already published and already gated, so this
 * reads their values rather than recomputing either. A null on either side means the
 * ratio is absent, never zero.
 *
 * The scope is APPROXIMATE and that is disclosed on every result. The LTV numerator is a
 * customer-weighted mean over acquisition cohorts whose 90 days have fully elapsed —
 * months that ended well before the selected period — while the CAC denominator covers
 * the selected period itself. DEC-018 asks for an identical scope on both sides; a truly
 * scope-matched ratio is not yet computable, because no paid spend has been recorded in
 * any month whose cohort has matured. Until it is, the ratio is published as an
 * approximation with a coverage floor rather than withheld entirely.
 *
 * The value is stored as the ratio in HUNDREDTHS, not in basis points, despite the
 * `rate_basis_points` value kind: the KPI formatter renders `value / 100` followed by
 * " : 1". Using `ratioToBasisPoints` here would render the card 100x too high.
 */
export function buildLtvToCacMetric(input: {
  readonly context: MetricServiceContext;
  readonly ltv90d: MetricViewModel;
  readonly blendedCac: MetricViewModel;
  readonly coverage: number | null;
  readonly sourceWarnings?: readonly string[];
}): MetricViewModel {
  const ltvMinorUnits = moneyMinorUnits(input.ltv90d);
  const cacMinorUnits = moneyMinorUnits(input.blendedCac);
  const coverageSufficient =
    input.coverage !== null && input.coverage >= LTV_CAC_MIN_SPEND_COVERAGE;
  const publishable =
    ltvMinorUnits !== null && cacMinorUnits !== null && cacMinorUnits > 0 && coverageSufficient;

  const coveragePercent = Math.round((input.coverage ?? 0) * 100);
  // Deduplicated on the way in. Both inputs already carry the shared Shopify source
  // codes, and `createMetricViewModel` concatenates metric warnings with every source's
  // codes without deduping — so an undeduped list here reaches the payload three times
  // over.
  const warnings = [
    ...new Set([
      ...(input.sourceWarnings ?? []),
      // Inherit both inputs' disclosures. A reader of the ratio needs every limit that
      // applies to either half, and re-deriving them here would let the two drift.
      ...input.ltv90d.warnings,
      ...input.blendedCac.warnings,
      // LTV counts matured cohorts, CAC counts the selected period. Never presented as
      // the identical-scope ratio DEC-018 describes.
      "LTV_CAC_PERIOD_SCOPE_APPROXIMATE",
      ...(publishable || coverageSufficient
        ? []
        : [`LTV_CAC_SPEND_COVERAGE_THIN:${coveragePercent}`]),
    ]),
  ];

  const unavailableReason =
    ltvMinorUnits === null
      ? "The 90-day LTV base is too thin to publish a ratio."
      : cacMinorUnits === null || cacMinorUnits <= 0
        ? (input.blendedCac.unavailableReason ??
          "Paid-Media Blended CAC is unavailable for this period.")
        : `Only ${coveragePercent}% of this period's first-time customers fall in months with recorded paid spend, so the ratio would not be comparable.`;

  return createMetricViewModel({
    metricKey: "marketing.ltv_cac",
    environment: input.context.environment,
    dataPeriod: input.context.dataPeriod,
    // Never `current`. The two sides describe different windows, so even a fully
    // covered, fully populated ratio is partial by construction.
    //
    // No extra codes are pushed onto the sources: the disclosures above are the
    // metric's, not any one source's, and each source already carries its own. Adding
    // them here would re-emit the whole list once per source in the payload.
    sources: withState(input.context.sourceStatuses, "partial", []),
    value: publishable
      ? {
          kind: "rate_basis_points",
          // Hundredths, not basis points — see the note above.
          value: divideAndRound((ltvMinorUnits ?? 0) * 100, cacMinorUnits ?? 1),
        }
      : null,
    warnings,
    ...(publishable ? {} : { dataPendingReason: unavailableReason }),
  });
}

/**
 * Blended CAC and its LTV ratio, sharing one pass over the source data.
 *
 * The ratio needs the same spend total and first-time-customer tally the CAC does, and
 * `calculateFirstTimeCustomers` walks full Shopify order history — so computing them
 * once here rather than twice is the difference between one parse and two on every
 * uncached request.
 */
export function buildPaidAcquisitionViews(input: {
  readonly context: MetricServiceContext;
  readonly spendRows: readonly SheetRecord[];
  readonly orderRecords: readonly SheetRecord[];
  readonly ltv90d: MetricViewModel;
  readonly channelMapping?: readonly SheetRecord[];
  readonly channels?: readonly string[];
  readonly sourceWarnings?: readonly string[];
  readonly spendSourceReadable?: boolean;
}): { readonly cac: MetricViewModel; readonly ltvCac: MetricViewModel } {
  const { startDate, endDate } = input.context.dataPeriod;
  const spend = calculateInScopePaidSpend({ rows: input.spendRows, startDate, endDate });
  const customers = calculateFirstTimeCustomers({
    records: input.orderRecords,
    ...(input.channelMapping ? { channelMapping: input.channelMapping } : {}),
    startDate,
    endDate,
    ...(input.channels ? { channels: input.channels } : {}),
  });
  const cac = assembleBlendedCac({
    context: input.context,
    spend,
    customers,
    ...(input.sourceWarnings ? { sourceWarnings: input.sourceWarnings } : {}),
    ...(input.spendSourceReadable === undefined
      ? {}
      : { spendSourceReadable: input.spendSourceReadable }),
  });
  const ltvCac = buildLtvToCacMetric({
    context: input.context,
    ltv90d: input.ltv90d,
    blendedCac: cac,
    coverage: spendCoverage({
      monthsWithSpend: spend.monthsWithSpend,
      countsByMonth: customers.countsByMonth,
      customerCount: customers.count,
    }),
  });
  return { cac, ltvCac };
}
