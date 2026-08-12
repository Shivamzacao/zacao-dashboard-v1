import { z } from "zod";

import type { KlaviyoClient } from "./client";

const jsonApiPageSchema = z.object({
  data: z.array(z.unknown()),
  links: z.object({ next: z.string().url().nullable() }).optional(),
});

export async function collectKlaviyoPages(input: {
  client: KlaviyoClient;
  initialPath: string;
  maxPages: number;
  signal?: AbortSignal;
}) {
  const records: unknown[] = [];
  const result = await visitKlaviyoPages({
    ...input,
    visit: (record) => records.push(record),
  });
  return { records, ...result } as const;
}

/**
 * Visits one bounded page at a time so PII-bearing resources such as profiles
 * can be reduced immediately instead of accumulated in memory.
 */
export async function visitKlaviyoPages(input: {
  client: KlaviyoClient;
  initialPath: string;
  maxPages: number;
  visit: (record: unknown) => void;
  signal?: AbortSignal;
}) {
  if (!Number.isInteger(input.maxPages) || input.maxPages < 1 || input.maxPages > 100) {
    throw new Error("maxPages must be an integer between 1 and 100");
  }
  const seen = new Set<string>();
  let next: string | null = input.initialPath;

  for (let page = 1; page <= input.maxPages && next; page += 1) {
    if (input.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (seen.has(next)) throw new Error("Klaviyo pagination returned a repeated next link");
    seen.add(next);
    const result = await input.client.get<unknown>(next, input.signal);
    const parsed = jsonApiPageSchema.parse(result.body);
    parsed.data.forEach(input.visit);
    next = parsed.links?.next ?? null;
    if (!next) return { truncated: false, pagesRead: page } as const;
  }
  return { truncated: next !== null, pagesRead: input.maxPages } as const;
}
