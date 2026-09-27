import type { ReconciliationReport } from "@/src/application/reconciliation/reconcile";
import type { SourceReadStatus } from "@/src/domain/sources/read-outcome";

export type ParityEntry =
  | {
      readonly dataset: string;
      readonly checkedAt: string;
      readonly outcome: "compared";
      readonly report: ReconciliationReport;
    }
  | {
      readonly dataset: string;
      readonly checkedAt: string;
      readonly outcome: "skipped";
      /** Why no comparison ran (a side was unreadable, not configured, …). */
      readonly reason: string;
      readonly status?: SourceReadStatus;
    };

/**
 * In-process record of the latest parity result per dataset. It is evidence
 * for a human certifying a migration step, not a data source: nothing reads
 * it to decide what the dashboard shows.
 */
export class ParityLedger {
  private readonly entries = new Map<string, ParityEntry>();

  record(entry: ParityEntry): void {
    this.entries.set(entry.dataset, entry);
  }

  latest(): readonly ParityEntry[] {
    return [...this.entries.values()].sort((left, right) =>
      left.dataset.localeCompare(right.dataset),
    );
  }

  lastCheckedAt(dataset: string): string | null {
    return this.entries.get(dataset)?.checkedAt ?? null;
  }
}
