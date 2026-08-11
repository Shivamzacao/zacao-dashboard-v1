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
const SUPPORTED_STATUSES = new Set(["paid", "partially_refunded", "refunded", "cancelled"]);
const QUALIFYING_STATUSES = new Set(["paid", "partially_refunded", "refunded"]);
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
    const customerId = text(record, "customer_id");
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
  const included = parsed.rows.filter((item) => eligibleCustomers.has(item.row.customerId));
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

export function buildRealizedLtvViews(input: {
  readonly context: MetricServiceContext;
  readonly records: readonly SheetRecord[];
  readonly channelMapping: readonly SheetRecord[];
  readonly channels: readonly string[];
  readonly sourceWarnings?: readonly string[];
}): { readonly metric: MetricViewModel; readonly cohorts: MetricTableViewModel } {
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
    ...(missing ? { dataPendingReason: "Sales_Actuals has no runtime-eligible rows." } : {}),
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
    ...(missing ? { dataPendingReason: "Sales_Actuals has no runtime-eligible rows." } : {}),
  });
  return {
    metric,
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
