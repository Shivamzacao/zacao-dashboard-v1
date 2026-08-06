import type { SourceStatus } from "@/src/domain/contracts/source-status";

import { ShopifyClientError } from "./client";

export function shopifyFailureStatus(error: unknown, checkedAt: string): SourceStatus {
  if (error instanceof ShopifyClientError) {
    const invalid = error.kind === "authentication" || error.kind === "permission";
    return {
      source: "shopify",
      state: invalid ? "invalid" : "unavailable",
      checkedAt,
      lastSuccessfulAt: null,
      dataAsOf: null,
      completeness: "unknown",
      warningCodes: [`SHOPIFY_${error.kind.toUpperCase()}`],
    };
  }
  return {
    source: "shopify",
    state: "error",
    checkedAt,
    lastSuccessfulAt: null,
    dataAsOf: null,
    completeness: "unknown",
    warningCodes: ["SHOPIFY_UNEXPECTED_ERROR"],
  };
}
