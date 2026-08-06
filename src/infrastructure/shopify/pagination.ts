export interface ShopifyPage<T> {
  readonly nodes: readonly T[];
  readonly pageInfo: {
    readonly hasNextPage: boolean;
    readonly endCursor: string | null;
  };
}

export interface PaginatedShopifyResult<T> {
  readonly records: readonly T[];
  readonly truncated: boolean;
  readonly pagesRead: number;
}

export async function collectShopifyPages<T>(input: {
  fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<ShopifyPage<T>>;
  maxPages: number;
  signal?: AbortSignal;
}): Promise<PaginatedShopifyResult<T>> {
  if (!Number.isInteger(input.maxPages) || input.maxPages < 1 || input.maxPages > 100) {
    throw new Error("maxPages must be an integer between 1 and 100");
  }

  const records: T[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageNumber = 1; pageNumber <= input.maxPages; pageNumber += 1) {
    if (input.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const page = await input.fetchPage(cursor, input.signal);
    records.push(...page.nodes);

    if (!page.pageInfo.hasNextPage) {
      return { records, truncated: false, pagesRead: pageNumber };
    }
    const nextCursor = page.pageInfo.endCursor;
    if (!nextCursor || cursors.has(nextCursor)) {
      throw new Error("Shopify pagination returned a missing or repeated cursor");
    }
    cursors.add(nextCursor);
    cursor = nextCursor;
  }

  return { records, truncated: true, pagesRead: input.maxPages };
}
