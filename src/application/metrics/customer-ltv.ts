import {
  metricTableViewModelSchema,
  type MetricTableViewModel,
  type MetricViewModel,
} from "@/src/application/view-models";
import type { SheetRecord } from "@/src/application/ports/sheets-tabs";
import type { SourceStatus } from "@/src/domain/contracts";

import type {
  CustomerLtvCohortResult,
  LtvHorizon,
  LtvReconciliationDiagnostic,
  MetricServiceContext,
  RealizedLtvResult,
  SalesActualRow,
} from "./types";
import { createMetricViewModel } from "./view-model";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_STATUSES = new Set([
  "paid",
  "confirmed",
  "partially_refunded",
  "refunded",
  "cancelled",
  "unpaid",
]);
const QUALIFYING_STATUSES = new Set(["paid", "confirmed", "partially_refunded"]);
const HORIZONS = ["30d", "60d", "90d", "180d", "lifetime"] as const satisfies readonly LtvHorizon[];
const HORIZON_DAYS: Readonly<Record<Exclude<LtvHorizon, "lifetime">, number>> = {
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "180d": 180,
};

function text(record: SheetRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(record: SheetRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function customerIdentity(record: SheetRecord): string | null {
  const customerId = text(record, "customer_id");
  if (customerId) return `shopify:${customerId}`;
  const email = text(record, "normalized_email")?.toLocaleLowerCase("en-US");
  return email ? `email:${email}` : null;
}

function minorUnits(value: number): number {
  return Math.round(value * 100);
}

function validDate(value: string | null): value is string {
  if (!value || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function daysBetween(start: string, end: string): number {
  return Math.floor(
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function monthEnd(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, value ?? 0, 0)).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function trailingCohortMonths(endDate: string): ReadonlySet<string> {
  const result = new Set<string>();
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  for (let index = 11; index >= 0; index -= 1) {
    const value = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - index, 1));
    result.add(value.toISOString().slice(0, 7));
  }
  return result;
}

function channelMappings(
  records: readonly SheetRecord[],
  endDate: string,
): ReadonlyMap<string, string> {
  return new Map(
    records.flatMap((record) => {
      const source = text(record, "source_channel_or_name");
      const dashboard = text(record, "dashboard_channel");
      const from = text(record, "effective_from");
      const to = text(record, "effective_to");
      const active = text(record, "status") === "active";
      return source && dashboard && active && (!from || from <= endDate) && (!to || to >= endDate)
        ? [[source.toLocaleLowerCase("en-US"), dashboard] as const]
        : [];
    }),
  );
}

interface ParsedRow {
  readonly row: SalesActualRow;
  readonly rowNumber: number;
  readonly mappedChannel: string | null;
}

function parseRows(input: {
  readonly records: readonly SheetRecord[];
  readonly channelMapping: readonly SheetRecord[];
  readonly endDate: string;
  readonly channels: readonly string[];
}): {
  readonly rows: readonly ParsedRow[];
  readonly diagnostics: readonly LtvReconciliationDiagnostic[];
} {
  const diagnostics: LtvReconciliationDiagnostic[] = [];
  const parsed: ParsedRow[] = [];
  const seen = new Set<string>();
  const mappings = channelMappings(input.channelMapping, input.endDate);

  for (const [index, record] of input.records.entries()) {
    const rowNumber = index + 2;
    const orderId = text(record, "order_id");
    const customerId = customerIdentity(record);
    const orderDate = text(record, "order_date");
    const firstOrderDate = text(record, "first_order_date");
    const currency = text(record, "currency");
    const orderStatus = text(record, "order_status");
    const acquisitionChannel = text(record, "acquisition_channel") ?? "Unclassified";
    const dataAsOf = text(record, "data_as_of");
    const gross = number(record, "gross_product_sales_usd");
    const discounts = number(record, "discounts_usd");
    const refunds = number(record, "refunds_returns_usd");
    const cancellations = number(record, "cancellations_usd");
    const suppliedNet = number(record, "net_product_revenue_usd");
    const isTest = text(record, "is_test") === "yes";
    const isSample = text(record, "is_sample") === "yes";
    const reject = (reason: LtvReconciliationDiagnostic["reason"]) =>
      diagnostics.push({ rowNumber, orderId, reason });

    if (!orderId || !validDate(orderDate) || !validDate(firstOrderDate) || !validDate(dataAsOf)) {
      reject("malformed_date");
      continue;
    }
    if (seen.has(orderId)) {
      reject("duplicate_order");
      continue;
    }
    seen.add(orderId);
    if (!customerId) {
      reject("missing_customer");
      continue;
    }
    if (isTest) {
      reject("test_order");
      continue;
    }
    if (isSample) {
      reject("sample_order");
      continue;
    }
    if (currency !== "USD") {
      reject("non_usd");
      continue;
    }
    if (!orderStatus || !SUPPORTED_STATUSES.has(orderStatus)) {
      reject("unsupported_status");
      continue;
    }
    if ([gross, discounts, refunds, cancellations, suppliedNet].some((value) => value === null)) {
      reject("net_revenue_mismatch");
      continue;
    }
    if ((gross ?? 0) <= 0) {
      reject("zero_value_order");
      continue;
    }
    if ((discounts ?? 0) < 0 || (refunds ?? 0) < 0 || (cancellations ?? 0) < 0) {
      reject("negative_deduction");
      continue;
    }
    const recomputed = minorUnits(
      (gross ?? 0) - (discounts ?? 0) - (refunds ?? 0) - (cancellations ?? 0),
    );
    if (Math.abs(recomputed - minorUnits(suppliedNet ?? 0)) > 1) {
      reject("net_revenue_mismatch");
      continue;
    }
    if (orderDate > input.endDate) {
      reject("after_cutoff");
      continue;
    }

    const mappedChannel = mappings.get(acquisitionChannel.toLocaleLowerCase("en-US")) ?? null;
    if (!mappedChannel) diagnostics.push({ rowNumber, orderId, reason: "unmapped_channel" });
    if (input.channels.length > 0 && (!mappedChannel || !input.channels.includes(mappedChannel))) {
      reject("channel_filtered");
      continue;
    }
    parsed.push({
      row: {
        orderId,
        customerId,
        orderDate,
        firstOrderDate,
        grossProductSalesMinorUnits: minorUnits(gross ?? 0),
        discountsMinorUnits: minorUnits(discounts ?? 0),
        refundsReturnsMinorUnits: minorUnits(refunds ?? 0),
        cancellationsMinorUnits: minorUnits(cancellations ?? 0),
        netProductRevenueMinorUnits: recomputed,
        orderStatus: orderStatus as SalesActualRow["orderStatus"],
        acquisitionChannel,
        currency: "USD",
        isTest,
        dataAsOf,
      },
      rowNumber,
      mappedChannel,
    });
  }

  const firstDates = new Map<string, Set<string>>();
  for (const item of parsed) {
    const dates = firstDates.get(item.row.customerId ?? "") ?? new Set<string>();
    dates.add(item.row.firstOrderDate);
    firstDates.set(item.row.customerId ?? "", dates);
  }
  const inconsistent = new Set(
    [...firstDates.entries()].filter(([, dates]) => dates.size !== 1).map(([customer]) => customer),
  );
  const consistent = parsed.filter((item) => {
    if (!inconsistent.has(item.row.customerId ?? "")) return true;
    diagnostics.push({
      rowNumber: item.rowNumber,
      orderId: item.row.orderId,
      reason: "inconsistent_first_order_date",
    });
    return false;
  });
  const firstQualifying = new Map<string, string>();
  for (const item of consistent) {
    if (!QUALIFYING_STATUSES.has(item.row.orderStatus)) continue;
    const customer = item.row.customerId ?? "";
    const current = firstQualifying.get(customer);
    if (!current || item.row.orderDate < current) firstQualifying.set(customer, item.row.orderDate);
  }
  const incomplete = new Set(
    consistent.flatMap((item) => {
      const first = firstQualifying.get(item.row.customerId ?? "");
      return first && first !== item.row.firstOrderDate ? [item.row.customerId ?? ""] : [];
    }),
  );
  const rows = consistent.filter((item) => {
    if (!incomplete.has(item.row.customerId ?? "")) return true;
    diagnostics.push({
      rowNumber: item.rowNumber,
      orderId: item.row.orderId,
      reason: "inconsistent_first_order_date",
    });
    return false;
  });
  return { rows, diagnostics };
}

function averageMinorUnits(total: number, customers: number): number | null {
  return customers > 0 ? Math.round(total / customers) : null;
}

export function calculateRealizedLtv(input: {
  readonly records: readonly SheetRecord[];
  readonly channelMapping?: readonly SheetRecord[];
  readonly endDate: string;
  readonly channels?: readonly string[];
}): RealizedLtvResult {
  const parsed = parseRows({
    records: input.records,
    channelMapping: input.channelMapping ?? [],
    endDate: input.endDate,
    channels: input.channels ?? [],
  });
  const eligibleCustomers = new Set(
    parsed.rows.flatMap((item) =>
      QUALIFYING_STATUSES.has(item.row.orderStatus) ? [item.row.customerId] : [],
    ),
  );
  const included = parsed.rows.filter(
    (item) =>
      QUALIFYING_STATUSES.has(item.row.orderStatus) && eligibleCustomers.has(item.row.customerId),
  );
  const headlineRevenue = included.reduce(
    (total, item) => total + item.row.netProductRevenueMinorUnits,
    0,
  );
  const trailing = trailingCohortMonths(input.endDate);
  const excludedRows = new Set(
    parsed.diagnostics
      .filter(({ reason }) => reason !== "unmapped_channel")
      .map(({ rowNumber }) => rowNumber),
  ).size;
  const byMonth = new Map<string, ParsedRow[]>();
  for (const item of included) {
    const month = item.row.firstOrderDate.slice(0, 7);
    if (!trailing.has(month)) continue;
    byMonth.set(month, [...(byMonth.get(month) ?? []), item]);
  }

  const cohorts: CustomerLtvCohortResult[] = [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cohortMonth, rows]) => {
      const customers = new Set(rows.map((item) => item.row.customerId));
      const maturity = Object.fromEntries(
        Object.entries(HORIZON_DAYS).map(([horizon, days]) => [
          horizon,
          addDays(monthEnd(cohortMonth), days - 1) <= input.endDate,
        ]),
      ) as CustomerLtvCohortResult["maturity"];
      const values = Object.fromEntries(
        HORIZONS.map((horizon) => {
          if (horizon !== "lifetime" && !maturity[horizon]) return [horizon, null];
          const days = horizon === "lifetime" ? null : HORIZON_DAYS[horizon];
          const revenue = rows.reduce((total, item) => {
            const age = daysBetween(item.row.firstOrderDate, item.row.orderDate);
            return age >= 0 && (days === null || age < days)
              ? total + item.row.netProductRevenueMinorUnits
              : total;
          }, 0);
          return [horizon, averageMinorUnits(revenue, customers.size)];
        }),
      ) as unknown as CustomerLtvCohortResult["ltvMinorUnits"];
      return {
        cohortMonth,
        customerCount: customers.size,
        ltvMinorUnits: values,
        maturity,
        excludedRows,
      };
    });

  const warningReasons = [...new Set(parsed.diagnostics.map(({ reason }) => reason))];
  return {
    headlineMinorUnits: averageMinorUnits(headlineRevenue, eligibleCustomers.size),
    eligibleCustomers: eligibleCustomers.size,
    cohorts,
    diagnostics: parsed.diagnostics,
    warnings: warningReasons.map((reason) =>
      reason === "unmapped_channel"
        ? "LTV_UNMAPPED_CHANNEL"
        : `LTV_EXCLUDED_${reason.toUpperCase()}`,
    ),
  };
}

/**
 * Distinct customers whose first order falls inside an arbitrary reporting period.
 *
 * This is the denominator of Paid-Media Blended CAC (DEC-019), and it is deliberately
 * not expressible with the existing cohort helpers: `calculateRealizedLtv` buckets by
 * a fixed trailing twelve months and `calculateActiveCustomers` by a fixed trailing
 * ninety days on `order_date`. Neither honours `dataPeriod.startDate`, and neither
 * keys on `first_order_date`.
 *
 * `parseRows` does the work that matters. Beyond the per-row guards it drops every row
 * of any customer whose `first_order_date` is internally inconsistent, or later than
 * their earliest qualifying order — a customer placed in the wrong month is exactly the
 * failure a period-scoped acquisition count cannot absorb, so those customers are
 * excluded and counted rather than guessed at.
 *
 * `customers.new_count` is not a substitute: it is a ShopifyQL provider classification
 * that can count one person as both new and returning within a period.
 */
export function calculateFirstTimeCustomers(input: {
  readonly records: readonly SheetRecord[];
  readonly channelMapping?: readonly SheetRecord[];
  readonly startDate: string;
  readonly endDate: string;
  readonly channels?: readonly string[];
}): {
  readonly count: number;
  /**
   * Counted customers grouped by acquisition month (`YYYY-MM` of `first_order_date`).
   *
   * Lets a caller ask whether the customers it is counting were acquired in months that
   * recorded any paid spend — the coverage test that keeps a period-scoped CAC ratio
   * from dividing one month of spend by a year of customers.
   */
  readonly countsByMonth: ReadonlyMap<string, number>;
  readonly excludedInconsistentRows: number;
  readonly excludedRows: number;
} {
  const parsed = parseRows({
    records: input.records,
    channelMapping: input.channelMapping ?? [],
    endDate: input.endDate,
    channels: input.channels ?? [],
  });
  // Only a qualifying order establishes acquisition, matching how `first_order_date`
  // is derived upstream and how `calculateRealizedLtv` picks its eligible customers.
  //
  // Keyed by customer rather than collected as a plain set of ids, because the month
  // tally has to count each customer once. The consistency guard in `parseRows` has
  // already ensured one `first_order_date` per customer, so the last write cannot
  // disagree with the first.
  const acquisitionMonth = new Map<string, string>();
  for (const item of parsed.rows) {
    if (
      !QUALIFYING_STATUSES.has(item.row.orderStatus) ||
      item.row.firstOrderDate < input.startDate ||
      item.row.firstOrderDate > input.endDate
    ) {
      continue;
    }
    acquisitionMonth.set(item.row.customerId ?? "", item.row.firstOrderDate.slice(0, 7));
  }
  const countsByMonth = new Map<string, number>();
  for (const month of acquisitionMonth.values()) {
    countsByMonth.set(month, (countsByMonth.get(month) ?? 0) + 1);
  }
  const excludedInconsistentRows = new Set(
    parsed.diagnostics
      .filter(({ reason }) => reason === "inconsistent_first_order_date")
      .map(({ rowNumber }) => rowNumber),
  ).size;
  const excludedRows = new Set(
    parsed.diagnostics
      // An unmapped channel is a labelling gap, not a rejected row — the row still
      // counted, so reporting it as an exclusion would overstate the loss.
      .filter(({ reason }) => reason !== "unmapped_channel")
      .map(({ rowNumber }) => rowNumber),
  ).size;
  return { count: acquisitionMonth.size, countsByMonth, excludedInconsistentRows, excludedRows };
}

export function calculateActiveCustomers(input: {
  readonly records: readonly SheetRecord[];
  readonly endDate: string;
}): {
  readonly count: number;
  readonly excludedWithoutIdentity: number;
  readonly malformedRows: number;
} {
  const startDate = addDays(input.endDate, -89);
  const customers = new Set<string>();
  let excludedWithoutIdentity = 0;
  let malformedRows = 0;

  for (const record of input.records) {
    const orderDate = text(record, "order_date");
    if (!validDate(orderDate)) {
      malformedRows += 1;
      continue;
    }
    if (orderDate < startDate || orderDate > input.endDate) continue;
    const identity = customerIdentity(record);
    if (!identity) {
      excludedWithoutIdentity += 1;
      continue;
    }
    const status = text(record, "order_status");
    const gross = number(record, "gross_product_sales_usd");
    const net = number(record, "net_product_revenue_usd");
    if (
      !status ||
      !QUALIFYING_STATUSES.has(status) ||
      text(record, "is_test") === "yes" ||
      text(record, "is_sample") === "yes" ||
      gross === null ||
      net === null ||
      gross <= 0 ||
      net <= 0
    ) {
      continue;
    }
    customers.add(identity);
  }

  return { count: customers.size, excludedWithoutIdentity, malformedRows };
}

export function buildActiveCustomersMetric(input: {
  readonly context: MetricServiceContext;
  readonly records: readonly SheetRecord[];
  readonly sourceWarnings?: readonly string[];
}): MetricViewModel {
  const result = calculateActiveCustomers({
    records: input.records,
    endDate: input.context.dataPeriod.endDate,
  });
  const warnings = [
    ...(input.sourceWarnings ?? []),
    ...(result.excludedWithoutIdentity > 0
      ? [`ACTIVE_CUSTOMERS_MISSING_IDENTITY:${result.excludedWithoutIdentity}`]
      : []),
    ...(result.malformedRows > 0
      ? [`ACTIVE_CUSTOMERS_MALFORMED_ROWS:${result.malformedRows}`]
      : []),
  ];
  return createMetricViewModel({
    metricKey: "customers.active",
    environment: input.context.environment,
    dataPeriod: input.context.dataPeriod,
    sources: input.context.sourceStatuses,
    value: input.records.length === 0 ? null : { kind: "count", value: result.count },
    warnings,
    ...(input.records.length === 0
      ? { dataPendingReason: "Sales_Actuals has no order rows for the approved 90-day window." }
      : {}),
  });
}

function metricSources(
  context: MetricServiceContext,
  state: SourceStatus["state"] | null,
  warningCodes: readonly string[],
): readonly SourceStatus[] {
  return context.sourceStatuses.map((source) =>
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

/**
 * Smallest matured cohort a 90-day LTV may be published from.
 *
 * The metric exists to be divided by acquisition cost, and at this store's volume a
 * mean over a handful of customers swings tens of percent when one person reorders.
 * A ratio that unstable is worse than an absent one, so below the floor the value is
 * withheld rather than shown with a caveat. Between the floor and COHORT_THIN the
 * value publishes but still carries the warning.
 */
const LTV_90D_MIN_CUSTOMERS = 30;
const LTV_90D_THIN_CUSTOMERS = 100;

/** Shopify order history replaced the Sales_Actuals tab this once read (PR #65). */
const NO_ELIGIBLE_ROWS = "Shopify order history has no runtime-eligible rows.";

/**
 * Customer-weighted mean of the 90-day cohort LTVs that `calculateRealizedLtv`
 * already produced. Only cohorts whose 90-day window has fully elapsed count, and
 * they are weighted by cohort size so a small young cohort cannot outvote a large
 * one — a plain mean of cohort means would do exactly that.
 */
function ltv90dFromCohorts(cohorts: RealizedLtvResult["cohorts"]): {
  readonly minorUnits: number | null;
  readonly customers: number;
} {
  const matured = cohorts.filter(
    (cohort) => cohort.maturity["90d"] && cohort.ltvMinorUnits["90d"] !== null,
  );
  const customers = matured.reduce((total, cohort) => total + cohort.customerCount, 0);
  if (customers === 0) return { minorUnits: null, customers: 0 };
  const revenue = matured.reduce(
    (total, cohort) => total + (cohort.ltvMinorUnits["90d"] ?? 0) * cohort.customerCount,
    0,
  );
  return { minorUnits: Math.round(revenue / customers), customers };
}

export function buildRealizedLtvViews(input: {
  readonly context: MetricServiceContext;
  readonly records: readonly SheetRecord[];
  readonly channelMapping: readonly SheetRecord[];
  readonly channels: readonly string[];
  readonly sourceWarnings?: readonly string[];
}): {
  readonly metric: MetricViewModel;
  readonly ltv90d: MetricViewModel;
  readonly cohorts: MetricTableViewModel;
} {
  const missing = input.records.length === 0;
  const result = calculateRealizedLtv({
    records: input.records,
    channelMapping: input.channelMapping,
    endDate: input.context.dataPeriod.endDate,
    channels: input.channels,
  });
  const invalidReasons = new Set<LtvReconciliationDiagnostic["reason"]>([
    "duplicate_order",
    "missing_customer",
    "test_order",
    "sample_order",
    "non_usd",
    "unsupported_status",
    "malformed_date",
    "negative_deduction",
    "net_revenue_mismatch",
    "inconsistent_first_order_date",
  ]);
  const invalidRows = new Set(
    result.diagnostics
      .filter(({ reason }) => invalidReasons.has(reason))
      .map(({ rowNumber }) => rowNumber),
  );
  const invalid = input.records.length > 0 && invalidRows.size >= input.records.length;
  const partial = invalidRows.size > 0 && invalidRows.size < input.records.length;
  const warningCodes = [
    ...(input.sourceWarnings ?? []),
    ...result.warnings,
    ...(missing ? ["LTV_SOURCE_ROWS_REQUIRED"] : []),
  ];
  const sources = metricSources(
    input.context,
    invalid ? "invalid" : partial && result.eligibleCustomers > 0 ? "partial" : null,
    warningCodes,
  );
  const metric = createMetricViewModel({
    metricKey: "customers.realized_ltv",
    environment: input.context.environment,
    dataPeriod: input.context.dataPeriod,
    sources,
    value:
      result.headlineMinorUnits === null
        ? null
        : { kind: "money", value: { currency: "USD", minorUnits: result.headlineMinorUnits } },
    warnings: warningCodes,
    ...(missing ? { dataPendingReason: NO_ELIGIBLE_ROWS } : {}),
  });
  const cohortMetric = createMetricViewModel({
    metricKey: "customers.realized_ltv_cohorts",
    environment: input.context.environment,
    dataPeriod: input.context.dataPeriod,
    sources,
    value:
      result.cohorts.length === 0
        ? null
        : { kind: "money", value: { currency: "USD", minorUnits: result.headlineMinorUnits ?? 0 } },
    warnings: warningCodes,
    ...(missing ? { dataPendingReason: NO_ELIGIBLE_ROWS } : {}),
  });
  const ltv90dResult = ltv90dFromCohorts(result.cohorts);
  const ltv90dThin = ltv90dResult.customers < LTV_90D_THIN_CUSTOMERS;
  const ltv90dPublishable =
    ltv90dResult.minorUnits !== null && ltv90dResult.customers >= LTV_90D_MIN_CUSTOMERS;
  const ltv90dWarnings = [
    ...warningCodes,
    ...(ltv90dPublishable && !ltv90dThin ? [] : ["LTV_COHORT_INSUFFICIENT_90D"]),
  ];
  const ltv90d = createMetricViewModel({
    metricKey: "customers.ltv_90d",
    environment: input.context.environment,
    dataPeriod: input.context.dataPeriod,
    // A thin-but-publishable base is genuinely partial data, so the source says so
    // rather than leaving the warning as the only signal.
    sources: metricSources(
      input.context,
      invalid ? "invalid" : ltv90dPublishable && ltv90dThin ? "partial" : null,
      ltv90dWarnings,
    ),
    value: ltv90dPublishable
      ? { kind: "money", value: { currency: "USD", minorUnits: ltv90dResult.minorUnits ?? 0 } }
      : null,
    warnings: ltv90dWarnings,
    ...(ltv90dPublishable
      ? {}
      : {
          dataPendingReason: missing
            ? NO_ELIGIBLE_ROWS
            : `Matured 90-day cohorts cover ${ltv90dResult.customers} customers; ${LTV_90D_MIN_CUSTOMERS} are required.`,
        }),
  });
  return {
    metric,
    ltv90d,
    cohorts: metricTableViewModelSchema.parse({
      metric: cohortMetric,
      columns: [
        "cohortMonth",
        "customerCount",
        "ltv30dMinorUnits",
        "ltv60dMinorUnits",
        "ltv90dMinorUnits",
        "ltv180dMinorUnits",
        "lifetimeLtvMinorUnits",
        "mature30d",
        "mature60d",
        "mature90d",
        "mature180d",
        "excludedRows",
      ],
      rows: result.cohorts.map((cohort) => ({
        cohortMonth: cohort.cohortMonth,
        customerCount: cohort.customerCount,
        ltv30dMinorUnits: cohort.ltvMinorUnits["30d"],
        ltv60dMinorUnits: cohort.ltvMinorUnits["60d"],
        ltv90dMinorUnits: cohort.ltvMinorUnits["90d"],
        ltv180dMinorUnits: cohort.ltvMinorUnits["180d"],
        lifetimeLtvMinorUnits: cohort.ltvMinorUnits.lifetime,
        mature30d: cohort.maturity["30d"],
        mature60d: cohort.maturity["60d"],
        mature90d: cohort.maturity["90d"],
        mature180d: cohort.maturity["180d"],
        excludedRows: cohort.excludedRows,
      })),
    }),
  };
}
