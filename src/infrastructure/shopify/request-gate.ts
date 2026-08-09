/**
 * Caps how many requests may be in flight against a single Shopify surface.
 *
 * ShopifyQL rate-limits well below the GraphQL cost budget: a burst of four
 * concurrent analytics queries is throttled far more often than the same
 * queries issued a couple at a time. Serialising slightly costs a few hundred
 * milliseconds per page and avoids retry backoff that costs seconds.
 */
export class RequestGate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError("Request gate limit must be a positive integer");
    }
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      // Release exactly one waiter per completion so `active` can never
      // exceed the limit, however many callers are queued.
      this.waiting.shift()?.();
    }
  }
}
