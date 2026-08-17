import type { DateRange, SourceStatus } from "@/src/domain/contracts";

export interface MetricServiceContext {
  readonly environment: "test" | "production";
  readonly dataPeriod: DateRange;
  readonly sourceStatuses: readonly SourceStatus[];
}

export interface CustomerClassificationFact {
  readonly classification: "new" | "returning" | "unclassified";
  readonly customers: number;
}

export interface CustomerClassificationSummary {
  readonly rows: readonly CustomerClassificationFact[];
  readonly returningRateBasisPoints: number | null;
}

export interface ShopifyFunnelFact {
  readonly sessions: number;
  readonly visitors: number;
  readonly cartAdditions: number;
  readonly reachedCheckout: number;
  readonly completedCheckout: number;
  readonly conversionRateBasisPoints: number;
}

export interface ShopifySessionEngagementFact {
  readonly averageSessionDurationSeconds: number;
}

export interface TrafficAttributionFact {
  readonly source: string;
  readonly sessions: number;
}

export interface AffiliateSessionFact {
  readonly utmSource: string | null;
  readonly utmCampaign: string | null;
  readonly utmContent: string | null;
  readonly sessions: number;
}

export interface AffiliateSalesFact {
  readonly discountCode: string;
  readonly orders: number;
  readonly netSalesMinorUnits: number;
}

export interface CustomerCityFact {
  readonly city: string;
  readonly region: string | null;
  readonly customers: number;
}

export interface ProductUnitsFact {
  readonly period: string;
  readonly product: string;
  readonly variant: string | null;
  readonly sku: string | null;
  readonly merchandise: boolean;
  readonly units: number;
}

export interface CatalogVariantFact {
  readonly productId: string;
  readonly productTitle: string;
  readonly productStatus: string;
  readonly variantId: string;
  readonly variantTitle: string;
  readonly sku: string | null;
  readonly priceMinorUnits: number;
  readonly activeOrSold: boolean;
  readonly unitCostMinorUnits: number | null;
}

export interface InventoryFact {
  readonly locationId: string;
  readonly locationName: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly sku: string | null;
  readonly quantityName: string;
  readonly quantity: number;
  readonly updatedAt: string;
}

export interface RefundOrderFact {
  readonly createdAt: string;
  readonly test: boolean;
  readonly cancelledAt: string | null;
  readonly refundCount: number;
}

/** Canonical ShopifyQL sales aggregates for one period — provider values only. */
export interface ShopifySalesTotalsFact {
  readonly orders: number;
  readonly grossSalesMinorUnits: number;
  readonly discountsMinorUnits: number;
  readonly returnsMinorUnits: number;
  readonly netSalesMinorUnits: number;
  readonly shippingChargesMinorUnits: number;
  readonly taxesMinorUnits: number;
  readonly totalSalesMinorUnits: number;
  readonly averageOrderValueMinorUnits: number;
}

export interface ShopifySalesTrendPoint {
  readonly period: string;
  readonly netSalesMinorUnits: number;
}

export interface PurchaseTimingFact {
  readonly dayOfWeek: string;
  readonly hourOfDay: string;
  readonly orders: number;
}

export interface BillingGeographyFact {
  readonly country: string;
  readonly region: string | null;
  readonly orders: number;
  readonly totalSalesMinorUnits: number;
}

export interface ProductSalesFact {
  readonly product: string;
  readonly variant: string | null;
  readonly sku: string | null;
  readonly merchandise: boolean;
  readonly netSalesMinorUnits: number;
}

/**
 * One order, reduced to the fields approved for on-screen display.
 *
 * Deliberately narrow. Order-level Shopify data carries names, emails, phone
 * numbers and addresses; none of them appear here, and none are fetched — the
 * orders query requests `customer { id }` only. Widening this shape is a
 * privacy decision, not a formatting one.
 */
export interface DetailedOrderFact {
  readonly orderDate: string;
  readonly channel: string;
  readonly amountMinorUnits: number;
  readonly quantity: number | null;
}

export interface NativeChannelFact {
  readonly channel: string;
  readonly orders: number;
  readonly netSalesMinorUnits: number;
  readonly totalSalesMinorUnits: number;
  readonly averageOrderValueMinorUnits: number | null;
}

export interface FulfillmentTrendFact {
  readonly period: string;
  readonly ordersFulfilled: number;
  readonly ordersShipped: number;
  readonly ordersDelivered: number;
}

export interface KlaviyoPerformanceFact {
  readonly recipients: number | null;
  readonly delivered: number | null;
  readonly deliveryRateBasisPoints: number | null;
  readonly opensUnique: number | null;
  readonly openRateBasisPoints: number | null;
  readonly clicksUnique: number | null;
  readonly clickRateBasisPoints: number | null;
  readonly clickToOpenRateBasisPoints: number | null;
  readonly bounced: number | null;
  readonly bounceRateBasisPoints: number | null;
  readonly unsubscribesUnique: number | null;
  readonly unsubscribeRateBasisPoints: number | null;
  readonly spamComplaints: number | null;
  readonly spamComplaintRateBasisPoints: number | null;
  readonly conversions: number | null;
  readonly conversionValueMinorUnits: number | null;
  readonly revenuePerRecipientMinorUnits: number | null;
}

export interface KlaviyoPerformanceRow extends KlaviyoPerformanceFact {
  readonly id: string;
  readonly name: string;
  readonly channel: "email" | "sms";
}

export interface KlaviyoSmsFact {
  readonly sent: number | null;
  readonly deliveredOrReceived: number | null;
  readonly clicked: number | null;
  readonly failed: number | null;
  readonly unsubscribed: number | null;
  readonly measurementLabel: "report_send_date" | "event_time";
}

export interface KlaviyoTrendPoint {
  readonly period: string;
  readonly count: number | null;
}

export interface KlaviyoEngagementPoint {
  readonly period: string;
  readonly opens: number | null;
  readonly clicks: number | null;
}

export interface KlaviyoDemographicFact {
  readonly totalProfiles: number;
  readonly declaredAgeProfiles: number;
  readonly invalidAgeProfiles: number;
  readonly ageBands: readonly Readonly<{ label: string; profiles: number }>[];
  readonly genders: readonly Readonly<{ label: string; profiles: number }>[];
  readonly truncated: boolean;
}

export type ManualMetricCell = string | number | boolean | null;
export type ManualMetricRecord = Readonly<Record<string, ManualMetricCell>>;

export interface ManualWorkbookFacts {
  readonly tabs: Readonly<{
    Depletions: { readonly records: readonly ManualMetricRecord[] };
    Finance_Actuals: { readonly records: readonly ManualMetricRecord[] };
    Marketing_Spend: { readonly records: readonly ManualMetricRecord[] };
    Partner_Performance: { readonly records: readonly ManualMetricRecord[] };
    Growth_Pipeline: { readonly records: readonly ManualMetricRecord[] };
    Social_Metrics: { readonly records: readonly ManualMetricRecord[] };
  }>;
}

export interface HistoryCompletenessFact {
  readonly mode: "aggregate" | "detailed";
  readonly completeness: "complete" | "partial";
  readonly requestedStartDate: string;
  readonly requestedEndDate: string;
  readonly earliestDetailedRecordAt: string | null;
  readonly warningCodes: readonly string[];
}

export interface SopInspectionFact {
  readonly worksheetNames: readonly string[];
  readonly nonEmptyCellCount: number;
  readonly formulaCount: number;
  readonly formulaErrorCells: readonly string[];
  readonly placeholderCellCount: number;
}

export interface CombinedInventoryFact {
  readonly asOfDate: string;
  readonly warehouse: string;
  readonly sku: string;
  readonly quantity: number;
}

export interface InventoryLotFact {
  readonly asOfDate: string;
  readonly warehouse: string;
  readonly sku: string;
  readonly lotCode: string;
  readonly bestByDate: string | null;
  readonly quantityRemaining: number;
  readonly status: string | null;
}

export interface ForecastVarianceFact {
  readonly period: string;
  readonly sku: string;
  readonly channel: string;
  readonly forecastUnits: number;
  readonly actualUnits: number;
}

export interface WeeklyProductUnitsFact {
  readonly weekStart: string;
  readonly shopifySku: string | null;
  readonly sourceChannel: string;
  readonly merchandise: boolean;
  readonly units: number;
}

export type LtvHorizon = "30d" | "60d" | "90d" | "180d" | "lifetime";

export interface SalesActualRow {
  readonly orderId: string;
  readonly customerId: string | null;
  readonly orderDate: string;
  readonly firstOrderDate: string;
  readonly grossProductSalesMinorUnits: number;
  readonly discountsMinorUnits: number;
  readonly refundsReturnsMinorUnits: number;
  readonly cancellationsMinorUnits: number;
  readonly netProductRevenueMinorUnits: number;
  readonly orderStatus:
    "paid" | "confirmed" | "partially_refunded" | "refunded" | "cancelled" | "unpaid";
  readonly acquisitionChannel: string;
  readonly currency: "USD";
  readonly isTest: boolean;
  readonly dataAsOf: string;
}

export interface LtvReconciliationDiagnostic {
  readonly rowNumber: number;
  readonly orderId: string | null;
  readonly reason:
    | "duplicate_order"
    | "missing_customer"
    | "test_order"
    | "sample_order"
    | "zero_value_order"
    | "non_usd"
    | "unsupported_status"
    | "malformed_date"
    | "negative_deduction"
    | "net_revenue_mismatch"
    | "inconsistent_first_order_date"
    | "after_cutoff"
    | "unmapped_channel"
    | "channel_filtered";
}

export interface CustomerLtvCohortResult {
  readonly cohortMonth: string;
  readonly customerCount: number;
  readonly ltvMinorUnits: Readonly<Record<LtvHorizon, number | null>>;
  readonly maturity: Readonly<Record<Exclude<LtvHorizon, "lifetime">, boolean>>;
  readonly excludedRows: number;
}

export interface RealizedLtvResult {
  readonly headlineMinorUnits: number | null;
  readonly eligibleCustomers: number;
  readonly cohorts: readonly CustomerLtvCohortResult[];
  readonly diagnostics: readonly LtvReconciliationDiagnostic[];
  readonly warnings: readonly string[];
}

export interface ProductionIncomingFact {
  readonly poNumber: string;
  readonly poLine: string;
  readonly sku: string;
  readonly destinationWarehouse: string;
  readonly status: string;
  readonly expectedArrivalDate: string | null;
  readonly incomingUnits: number;
  readonly incomingValueMinorUnits?: number | null;
  readonly freightMinorUnits?: number | null;
  readonly unitsReceived: number | null;
}

export interface CashPositionFact {
  readonly date: string;
  readonly account: string;
  readonly balanceMinorUnits: number;
  readonly restrictedCashMinorUnits: number | null;
}

export interface PlanActualFact {
  readonly scopeKey: string;
  readonly planMinorUnits: number;
  readonly actualMinorUnits: number;
}
