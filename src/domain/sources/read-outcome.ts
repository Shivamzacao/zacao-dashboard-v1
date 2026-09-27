/**
 * The result of reading one dataset from one source, with every non-success
 * named. A failed or unauthorized read must never be mistaken for "no rows":
 * an empty array means the source answered and genuinely had nothing.
 */
export type SourceReadOutcome<T> =
  /** The source answered. `data` may be empty; `truncated` says it is partial. */
  | { readonly status: "ok"; readonly data: T; readonly truncated: boolean }
  /** The source answered but holds no records for the request. */
  | { readonly status: "no_data"; readonly data: T }
  /** The request failed (network, timeout, throttling, provider error). */
  | { readonly status: "failed"; readonly reason: string; readonly retryable: boolean }
  /** Credentials were rejected or a scope is missing. */
  | { readonly status: "not_authorized"; readonly reason: string }
  /** Supported in principle, not built yet. */
  | { readonly status: "not_implemented"; readonly reason: string }
  /** The source does not hold this data at all (e.g. ad spend in Shopify). */
  | { readonly status: "not_available_from_source"; readonly reason: string };

export type SourceReadStatus = SourceReadOutcome<unknown>["status"];

export function isUsableOutcome<T>(
  outcome: SourceReadOutcome<T>,
): outcome is Extract<SourceReadOutcome<T>, { status: "ok" | "no_data" }> {
  return outcome.status === "ok" || outcome.status === "no_data";
}
