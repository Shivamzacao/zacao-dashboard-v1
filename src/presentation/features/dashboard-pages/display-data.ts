import type { MetricDisplayValue } from "@/src/application/view-models";
import type {
  ChartDatum,
  DisplayComparison,
  DisplayState,
  SourceIndicatorModel,
} from "@/src/presentation/components/dashboard/display-contracts";

export type DisplayTableRow = Record<string, string | number | boolean | null>;

/**
 * The single data shape every dashboard page renders from. Phase 2 fixtures
 * and the live Phase 3 view-model mapper both narrow to this contract, so
 * feature components never know which mode produced their data.
 */
export interface DashboardPageDisplayData {
  readonly environment: "test" | "production";
  readonly synthetic: boolean;
  readonly currentValues: Readonly<Record<string, MetricDisplayValue>>;
  readonly chartData: Readonly<Record<string, readonly ChartDatum[]>>;
  readonly rowsByDataset: Readonly<Record<string, readonly DisplayTableRow[]>>;
  readonly sources: readonly SourceIndicatorModel[];
  /** Live readiness per metric key; absent in fixture mode (catalog-derived). */
  readonly states?: Readonly<Record<string, DisplayState>>;
  /** Live unavailable/blocked explanations per metric key. */
  readonly stateReasons?: Readonly<Record<string, string>>;
  /** Live previous-period/previous-year comparison per metric key. */
  readonly comparisonValues?: Readonly<Record<string, DisplayComparison>>;
}
