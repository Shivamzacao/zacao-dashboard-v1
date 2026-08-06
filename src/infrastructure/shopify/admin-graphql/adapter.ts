import { z } from "zod";

import type { DateRange } from "@/src/domain/contracts/date-range";

import type { ShopifyGraphQlClient } from "../client";
import { buildShopifyHistory, type ShopifyHistory } from "../history";
import { normalizeOrder, normalizeProduct } from "../normalization";
import { collectShopifyPages } from "../pagination";
import {
  ACCESS_SCOPES_QUERY,
  CUSTOMERS_QUERY,
  LOCATIONS_QUERY,
  ORDERS_QUERY,
  PRODUCTS_QUERY,
  SHOP_QUERY,
} from "./queries";

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const connectionSchema = z.object({ nodes: z.array(z.unknown()), pageInfo: pageInfoSchema });
const shopSchema = z.object({
  name: z.string(),
  currencyCode: z.string(),
  ianaTimezone: z.string(),
  plan: z.object({ displayName: z.string() }),
});
const scopeSchema = z.object({ handle: z.string() });
const locationSchema = z.object({ id: z.string(), name: z.string(), isActive: z.boolean() });
const customerSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  numberOfOrders: z.string(),
  amountSpent: z.object({ amount: z.string(), currencyCode: z.string() }),
  lastOrder: z
    .object({ id: z.string(), createdAt: z.string().datetime({ offset: true }) })
    .nullable(),
});

export interface ShopifyDetailedReadResult<T> {
  readonly records: readonly T[];
  readonly history: ShopifyHistory;
  readonly truncated: boolean;
}

export class ShopifyAdminAdapter {
  constructor(
    private readonly client: ShopifyGraphQlClient,
    private readonly pageSize = 100,
    private readonly maxPages = 20,
  ) {}

  async readShop(signal?: AbortSignal) {
    const result = await this.client.execute<{ shop: unknown }>({
      document: SHOP_QUERY,
      ...(signal ? { signal } : {}),
    });
    return shopSchema.parse(result.data.shop);
  }

  async readAccessScopes(signal?: AbortSignal): Promise<readonly string[]> {
    const result = await this.client.execute<{ currentAppInstallation: { accessScopes: unknown } }>(
      {
        document: ACCESS_SCOPES_QUERY,
        ...(signal ? { signal } : {}),
      },
    );
    return z
      .array(scopeSchema)
      .parse(result.data.currentAppInstallation.accessScopes)
      .map(({ handle }) => handle);
  }

  readProducts(input: { dateRange: DateRange; hasReadAllOrders: boolean; signal?: AbortSignal }) {
    return this.readConnection({
      document: PRODUCTS_QUERY,
      root: "products",
      dateRange: input.dateRange,
      hasReadAllOrders: input.hasReadAllOrders,
      normalize: normalizeProduct,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  readLocations(input: { dateRange: DateRange; hasReadAllOrders: boolean; signal?: AbortSignal }) {
    return this.readConnection({
      document: LOCATIONS_QUERY,
      root: "locations",
      dateRange: input.dateRange,
      hasReadAllOrders: input.hasReadAllOrders,
      normalize: (value) => locationSchema.parse(value),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  readOrders(input: { dateRange: DateRange; hasReadAllOrders: boolean; signal?: AbortSignal }) {
    return this.readConnection({
      document: ORDERS_QUERY,
      root: "orders",
      dateRange: input.dateRange,
      hasReadAllOrders: input.hasReadAllOrders,
      normalize: normalizeOrder,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  readCustomers(input: { dateRange: DateRange; hasReadAllOrders: boolean; signal?: AbortSignal }) {
    return this.readConnection({
      document: CUSTOMERS_QUERY,
      root: "customers",
      dateRange: input.dateRange,
      hasReadAllOrders: input.hasReadAllOrders,
      normalize: (value) => customerSchema.parse(value),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  private async readConnection<T>(input: {
    document: string;
    root: string;
    dateRange: DateRange;
    hasReadAllOrders: boolean;
    normalize: (value: unknown) => T;
    signal?: AbortSignal;
  }): Promise<ShopifyDetailedReadResult<T>> {
    const pages = await collectShopifyPages({
      maxPages: this.maxPages,
      ...(input.signal ? { signal: input.signal } : {}),
      fetchPage: async (cursor, signal) => {
        const result = await this.client.execute<Record<string, unknown>>({
          document: input.document,
          variables: { first: this.pageSize, after: cursor },
          ...(signal ? { signal } : {}),
        });
        return connectionSchema.parse(result.data[input.root]);
      },
    });
    const earliestCreatedAt = pages.records
      .map(
        (record) =>
          z.object({ createdAt: z.string().optional() }).passthrough().parse(record).createdAt,
      )
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    return {
      records: pages.records.map(input.normalize),
      truncated: pages.truncated,
      history: buildShopifyHistory({
        mode: "detailed",
        requestedStartDate: input.dateRange.startDate,
        requestedEndDate: input.dateRange.endDate,
        earliestDetailedRecordAt: earliestCreatedAt ?? null,
        hasReadAllOrders: input.hasReadAllOrders,
        detailedRangeVerified:
          !pages.truncated &&
          Boolean(earliestCreatedAt && earliestCreatedAt.slice(0, 10) <= input.dateRange.startDate),
      }),
    };
  }
}
