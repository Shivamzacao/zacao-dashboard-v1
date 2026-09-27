import { describe, expect, it, vi } from "vitest";

import {
  buildOrderSearchQuery,
  paddedCreatedAtWindow,
  ShopifyAdminAdapter,
} from "@/src/infrastructure/shopify/admin-graphql/adapter";
import type { ShopifyGraphQlClient } from "@/src/infrastructure/shopify/client";

import { rawOrder } from "./order-fixture";

type ExecuteInput = Parameters<ShopifyGraphQlClient["execute"]>[0];

/** A fake client serving `total` orders newest-first in pages of the requested size. */
function pagedClient(total: number) {
  const orders = Array.from({ length: total }, (_, index) =>
    rawOrder({
      id: `gid://shopify/Order/${total - index}`,
      createdAt: new Date(Date.parse("2026-09-01T12:00:00Z") - index * 3_600_000).toISOString(),
    }),
  );
  const execute = vi.fn(async (input: ExecuteInput) => {
    const variables = input.variables as { first: number; after: string | null; query?: string };
    const offset = variables.after ? Number(variables.after) : 0;
    const nodes = orders.slice(offset, offset + variables.first);
    const next = offset + nodes.length;
    return {
      data: {
        orders: {
          nodes,
          pageInfo: { hasNextPage: next < orders.length, endCursor: String(next) },
        },
      },
      requestId: null,
      throttleStatus: null,
    };
  });
  return { client: { execute } as unknown as ShopifyGraphQlClient, execute };
}

describe("Shopify order search window (C-2)", () => {
  it("builds a validated created_at search clause", () => {
    expect(
      buildOrderSearchQuery({ from: "2026-08-31T00:00:00.000Z", to: "2026-10-02T00:00:00.000Z" }),
    ).toBe("created_at:>='2026-08-31T00:00:00.000Z' AND created_at:<'2026-10-02T00:00:00.000Z'");
    expect(buildOrderSearchQuery({})).toBeNull();
    expect(() => buildOrderSearchQuery({ from: "2026-08-31' OR test:true" })).toThrow();
  });

  it("pads the period so every calendar day in any time zone is fetched", () => {
    expect(paddedCreatedAtWindow({ startDate: "2026-09-01", endDate: "2026-09-30" })).toEqual({
      from: "2026-08-31T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z",
    });
  });
});

describe("Shopify order pagination (C-2)", () => {
  it("reads past the old 500-order cap and passes the search window to Shopify", async () => {
    const { client, execute } = pagedClient(620);
    const adapter = new ShopifyAdminAdapter(client, {
      pageSize: 25,
      maxPages: 20,
      orderMaxPages: 400,
    });
    const window = paddedCreatedAtWindow({ startDate: "2026-01-01", endDate: "2026-09-30" });
    const result = await adapter.readOrders({
      dateRange: { startDate: "2026-01-01", endDate: "2026-09-30" },
      hasReadAllOrders: true,
      createdAt: window,
    });

    expect(result.records).toHaveLength(620);
    expect(result.truncated).toBe(false);
    expect(execute).toHaveBeenCalledTimes(25);
    const variables = execute.mock.calls[0]?.[0].variables as { query?: string };
    expect(variables.query).toBe(buildOrderSearchQuery(window));
    // A filtered read that was not truncated covers its window by construction,
    // even though no order falls on the window's first day.
    expect(result.history.completeness).toBe("complete");
  });

  it("reports truncation explicitly when the page ceiling is reached", async () => {
    const { client } = pagedClient(120);
    const adapter = new ShopifyAdminAdapter(client, { pageSize: 25, orderMaxPages: 2 });
    const result = await adapter.readOrders({
      dateRange: { startDate: "2026-01-01", endDate: "2026-09-30" },
      hasReadAllOrders: true,
      createdAt: { from: "2025-12-31T00:00:00.000Z" },
    });
    expect(result.records).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(result.history.completeness).toBe("partial");
    expect(result.history.warningCodes).toContain("SHOPIFY_DETAILED_HISTORY_PARTIAL");
  });

  it("keeps the positional constructor used by existing callers", async () => {
    const { client, execute } = pagedClient(30);
    const adapter = new ShopifyAdminAdapter(client, 10, 2);
    const result = await adapter.readOrders({
      dateRange: { startDate: "2026-01-01", endDate: "2026-09-30" },
      hasReadAllOrders: true,
    });
    expect(result.records).toHaveLength(20);
    expect(result.truncated).toBe(true);
    const variables = execute.mock.calls[0]?.[0].variables as { query?: string };
    expect(variables.query).toBeUndefined();
  });
});
