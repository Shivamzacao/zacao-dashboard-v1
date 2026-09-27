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

/**
 * Hard ceiling on pages for any single connection read. Cursor pagination
 * normally ends on `hasNextPage: false`; this bound only exists so a provider
 * fault can never loop forever. Reaching it is reported as `truncated`, never
 * swallowed.
 */
export const MAX_SHOPIFY_PAGES = 2_000;

export async function collectShopifyPages<T>(input: {
  fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<ShopifyPage<T>>;
  maxPages: number;
  signal?: AbortSignal;
}): Promise<PaginatedShopifyResult<T>> {
  if (
    !Number.isInteger(input.maxPages) ||
    input.maxPages < 1 ||
    input.maxPages > MAX_SHOPIFY_PAGES
  ) {
    throw new Error(`maxPages must be an integer between 1 and ${MAX_SHOPIFY_PAGES}`);
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
