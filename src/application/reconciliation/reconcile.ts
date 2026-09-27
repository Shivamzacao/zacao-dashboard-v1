/**
 * Generic old-vs-new reconciliation for the Sheets → API migration.
 *
 * Neither side is presumed correct. The report only states where the two
 * sources agree and where they differ; resolving a difference is a human
 * decision recorded in docs/migration/RECONCILIATION_LOG.md.
 */

export type ComparableValue = string | number | boolean | null;

export interface ReconciliationField<Old, New> {
  readonly name: string;
  readonly old: (row: Old) => ComparableValue;
  readonly new: (row: New) => ComparableValue;
  /** Absolute tolerance for numeric fields. Defaults to exact equality. */
  readonly tolerance?: number;
  /** Whether the field is summed into the report's totals. */
  readonly total?: boolean;
}

export interface ReconciliationInput<Old, New> {
  readonly dataset: string;
  readonly oldSource: string;
  readonly newSource: string;
  readonly oldRows: readonly Old[];
  readonly newRows: readonly New[];
  readonly oldKey: (row: Old) => string | null;
  readonly newKey: (row: New) => string | null;
  readonly fields: readonly ReconciliationField<Old, New>[];
  /** Context a reader needs to interpret the result (units, as-of times, caveats). */
  readonly notes?: readonly string[];
}

export interface FieldDifference {
  readonly key: string;
  readonly field: string;
  readonly oldValue: ComparableValue;
  readonly newValue: ComparableValue;
  /** new − old for numbers; null otherwise. */
  readonly delta: number | null;
}

export interface FieldTotal {
  readonly field: string;
  readonly old: number;
  readonly new: number;
  readonly delta: number;
}

export interface ReconciliationReport {
  readonly dataset: string;
  readonly oldSource: string;
  readonly newSource: string;
  readonly status: "match" | "mismatch";
  readonly oldCount: number;
  readonly newCount: number;
  readonly matchedKeys: number;
  readonly onlyInOld: readonly string[];
  readonly onlyInNew: readonly string[];
  readonly unkeyedOld: number;
  readonly unkeyedNew: number;
  readonly duplicateKeysOld: readonly string[];
  readonly duplicateKeysNew: readonly string[];
  readonly differences: readonly FieldDifference[];
  readonly totals: readonly FieldTotal[];
  readonly notes: readonly string[];
}

function index<T>(rows: readonly T[], keyOf: (row: T) => string | null) {
  const byKey = new Map<string, T[]>();
  let unkeyed = 0;
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null || key === "") {
      unkeyed += 1;
      continue;
    }
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  const duplicates = [...byKey].filter(([, group]) => group.length > 1).map(([key]) => key);
  return { byKey, unkeyed, duplicates };
}

function equal(left: ComparableValue, right: ComparableValue, tolerance = 0): boolean {
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) <= tolerance;
  }
  return left === right;
}

const numeric = (value: ComparableValue): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function reconcile<Old, New>(input: ReconciliationInput<Old, New>): ReconciliationReport {
  const old = index(input.oldRows, input.oldKey);
  const next = index(input.newRows, input.newKey);
  const onlyInOld = [...old.byKey.keys()].filter((key) => !next.byKey.has(key)).sort();
  const onlyInNew = [...next.byKey.keys()].filter((key) => !old.byKey.has(key)).sort();
  const shared = [...old.byKey.keys()].filter((key) => next.byKey.has(key)).sort();

  const differences: FieldDifference[] = [];
  for (const key of shared) {
    // Duplicated keys are reported separately and compared on their first row
    // only; their totals still include every row.
    const oldRow = old.byKey.get(key)?.[0];
    const newRow = next.byKey.get(key)?.[0];
    if (oldRow === undefined || newRow === undefined) continue;
    for (const field of input.fields) {
      const oldValue = field.old(oldRow);
      const newValue = field.new(newRow);
      if (!equal(oldValue, newValue, field.tolerance)) {
        differences.push({
          key,
          field: field.name,
          oldValue,
          newValue,
          delta:
            typeof oldValue === "number" && typeof newValue === "number"
              ? newValue - oldValue
              : null,
        });
      }
    }
  }

  const totals = input.fields
    .filter((field) => field.total)
    .map((field) => {
      const oldTotal = input.oldRows.reduce((sum, row) => sum + numeric(field.old(row)), 0);
      const newTotal = input.newRows.reduce((sum, row) => sum + numeric(field.new(row)), 0);
      return { field: field.name, old: oldTotal, new: newTotal, delta: newTotal - oldTotal };
    });

  const clean =
    onlyInOld.length === 0 &&
    onlyInNew.length === 0 &&
    old.unkeyed === 0 &&
    next.unkeyed === 0 &&
    old.duplicates.length === 0 &&
    next.duplicates.length === 0 &&
    differences.length === 0 &&
    totals.every(({ delta }) => Math.abs(delta) < 1e-9);

  return {
    dataset: input.dataset,
    oldSource: input.oldSource,
    newSource: input.newSource,
    status: clean ? "match" : "mismatch",
    oldCount: input.oldRows.length,
    newCount: input.newRows.length,
    matchedKeys: shared.length,
    onlyInOld,
    onlyInNew,
    unkeyedOld: old.unkeyed,
    unkeyedNew: next.unkeyed,
    duplicateKeysOld: old.duplicates,
    duplicateKeysNew: next.duplicates,
    differences,
    totals,
    notes: input.notes ?? [],
  };
}
