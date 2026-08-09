import { z } from "zod";

import type { DateRange } from "@/src/domain/contracts/date-range";

import type { ShopifyGraphQlClient } from "../client";
import { buildShopifyHistory, type ShopifyHistory } from "../history";
import { RequestGate } from "../request-gate";
import {
  buildShopifyQlQuery,
  SHOPIFYQL_QUERY,
  type ShopifyQlDataset,
  type ShopifyQlGrain,
} from "./queries";

const tableResponseSchema = z.object({
  shopifyqlQuery: z.object({
    tableData: z
      .object({
        columns: z.array(z.object({ name: z.string(), dataType: z.string() })),
        rows: z.array(z.record(z.string(), z.unknown())),
      })
      .nullable(),
    parseErrors: z.array(z.string()).nullable().optional(),
  }),
});

export interface ShopifyQlReadResult {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly columns: readonly {
    readonly name: string;
    readonly dataType: string;
  }[];
  readonly history: ShopifyHistory;
  readonly requestId: string | null;
}

/**
 * A dashboard page fans out several datasets at once, and contributors add
 * their own parallel reads on top. Two in flight keeps pages responsive while
 * staying under the ShopifyQL analytics quota.
 */
const DEFAULT_SHOPIFYQL_CONCURRENCY = 2;

export class ShopifyQlAdapter {
  private readonly gate: RequestGate;

  constructor(
    private readonly client: ShopifyGraphQlClient,
    concurrency: number = DEFAULT_SHOPIFYQL_CONCURRENCY,
  ) {
    this.gate = new RequestGate(concurrency);
  }

  async read(input: {
    dataset: ShopifyQlDataset;
    dateRange: DateRange;
    grain?: ShopifyQlGrain;
    signal?: AbortSignal;
  }): Promise<ShopifyQlReadResult> {
    const query = buildShopifyQlQuery(input);
    const result = await this.gate.run(() =>
      this.client.execute<unknown>({
        document: SHOPIFYQL_QUERY,
        variables: { query },
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    );
    const parsed = tableResponseSchema.parse(result.data);
    const parseErrors = parsed.shopifyqlQuery.parseErrors ?? [];
    if (parseErrors.length > 0) {
      throw new Error("ShopifyQL rejected the audited dataset query");
    }
    if (parsed.shopifyqlQuery.tableData === null) {
      throw new Error("ShopifyQL returned no table data for the audited dataset query");
    }
    return {
      rows: parsed.shopifyqlQuery.tableData.rows,
      columns: parsed.shopifyqlQuery.tableData.columns,
      history: buildShopifyHistory({
        mode: "aggregate",
        requestedStartDate: input.dateRange.startDate,
        requestedEndDate: input.dateRange.endDate,
        earliestDetailedRecordAt: null,
        hasReadAllOrders: false,
        detailedRangeVerified: false,
      }),
      requestId: result.requestId,
    };
  }
}
