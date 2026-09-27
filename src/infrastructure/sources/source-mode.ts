/**
 * Central source-selection mode for the Sheets → API migration. This is the
 * only switch; no dataset reads the environment itself.
 *
 * - `legacy` (default): Google Sheets exactly as before the migration.
 * - `parallel`: Sheets stay authoritative; the API side is read in the
 *   background and reconciled against them (see parity-tab-source.ts).
 * - `api`: serve API data for tabs that have passed parity. No tab has been
 *   certified yet (docs/migration/MIGRATION_STATUS.md), so today this behaves
 *   like `parallel` and says so in the logs rather than serving unverified data.
 */
export type SourceMode = "legacy" | "parallel" | "api";

export const SOURCE_MODE_ENV = "ZACAO_SOURCE_MODE";

export interface SourceModeSetting {
  readonly mode: SourceMode;
  /** Set when the configured value was invalid and the safe default was used. */
  readonly invalidValue: string | null;
}

export function parseSourceMode(value: string | undefined): SourceModeSetting {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return { mode: "legacy", invalidValue: null };
  if (normalized === "legacy" || normalized === "parallel" || normalized === "api") {
    return { mode: normalized, invalidValue: null };
  }
  return { mode: "legacy", invalidValue: value ?? null };
}
