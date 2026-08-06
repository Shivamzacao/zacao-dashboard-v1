import type { DashboardFilters, SourceStatus } from "@/src/domain/contracts";

export type ShopifyCapability =
  "sales" | "sessions" | "customers" | "catalog" | "inventory" | "fulfillment";

export interface ShopifyReadRequest {
  readonly capability: ShopifyCapability;
  readonly filters: DashboardFilters;
}

export interface ShopifyReadResult {
  readonly records: readonly unknown[];
  readonly sourceStatus: SourceStatus;
}

export interface ShopifyPort {
  read(request: ShopifyReadRequest): Promise<ShopifyReadResult>;
}
