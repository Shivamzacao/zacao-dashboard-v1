import "server-only";

import { z } from "zod";

import {
  MANUAL_WORKBOOK_TABS,
  type ManualWorkbookTab,
} from "@/src/infrastructure/manual-workbook/contracts.generated";
import type { SheetsDashboardPage } from "@/src/application/ports/sheets-tabs";

const DEFAULT_AGGREGATE_URL = "https://flow.sokt.io/func/scriv6LXUyiH";
const DEFAULT_PAGE_URLS: Readonly<Record<SheetsDashboardPage, string>> = {
  insights: "https://flow.sokt.io/func/scrizXhpyoZL",
  product: "https://flow.sokt.io/func/scriFSpXBNz4",
  finance: "https://flow.sokt.io/func/scriCETwQ0tC",
  marketing: "https://flow.sokt.io/func/scri6MeUHDNH",
  growth: "https://flow.sokt.io/func/scrijcFi21hy",
  operations: "https://flow.sokt.io/func/scriRlQcbgmk",
};
const PAGE_KEYS = Object.keys(DEFAULT_PAGE_URLS) as SheetsDashboardPage[];
const urlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Sheets API URLs must use HTTPS",
  });

export interface SheetsApiConfiguration {
  readonly aggregateUrl: string | null;
  readonly pageUrls: Readonly<Partial<Record<SheetsDashboardPage, string>>>;
  readonly tabUrls: Readonly<Partial<Record<ManualWorkbookTab, string>>>;
  readonly timeoutMs: number;
}

export function parseSheetsApiConfiguration(input: {
  readonly aggregateUrl?: string;
  readonly tabUrlsJson?: string;
  readonly pageUrlsJson?: string;
  readonly timeoutMs?: string;
}): SheetsApiConfiguration {
  const aggregateUrl = urlSchema
    .nullable()
    .parse(input.aggregateUrl === "" ? null : (input.aggregateUrl ?? DEFAULT_AGGREGATE_URL));
  let parsed: unknown = {};
  if (input.tabUrlsJson?.trim()) parsed = JSON.parse(input.tabUrlsJson);
  const rawMap = z.record(z.string(), urlSchema).parse(parsed);
  const allowed = new Set<string>(MANUAL_WORKBOOK_TABS);
  const unknown = Object.keys(rawMap).filter((tab) => !allowed.has(tab));
  if (unknown.length)
    throw new Error(`Unknown Sheets API tab configuration: ${unknown.join(", ")}`);
  let parsedPages: unknown = DEFAULT_PAGE_URLS;
  if (input.pageUrlsJson?.trim()) parsedPages = JSON.parse(input.pageUrlsJson);
  const rawPages = z.record(z.string(), urlSchema).parse(parsedPages);
  const allowedPages = new Set<string>(PAGE_KEYS);
  const unknownPages = Object.keys(rawPages).filter((page) => !allowedPages.has(page));
  if (unknownPages.length)
    throw new Error(`Unknown Sheets API page configuration: ${unknownPages.join(", ")}`);
  const timeoutMs = input.timeoutMs === undefined ? 30_000 : Number(input.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error("ZACAO_SHEETS_API_TIMEOUT_MS must be an integer from 1000 to 60000");
  }
  return {
    aggregateUrl,
    pageUrls: rawPages as Partial<Record<SheetsDashboardPage, string>>,
    tabUrls: rawMap as Partial<Record<ManualWorkbookTab, string>>,
    timeoutMs,
  };
}

export function loadSheetsApiConfigurationOrNull(): SheetsApiConfiguration | null {
  const aggregate = process.env["ZACAO_SHEETS_AGGREGATE_API_URL"];
  const tabUrls = process.env["ZACAO_SHEETS_TAB_API_URLS"];
  const pageUrls = process.env["ZACAO_SHEETS_PAGE_API_URLS"];
  if (aggregate === "" && pageUrls === "" && !tabUrls?.trim()) return null;
  return parseSheetsApiConfiguration({
    ...(aggregate === undefined ? {} : { aggregateUrl: aggregate }),
    ...(tabUrls === undefined ? {} : { tabUrlsJson: tabUrls }),
    ...(pageUrls === undefined ? {} : { pageUrlsJson: pageUrls }),
    ...(process.env["ZACAO_SHEETS_API_TIMEOUT_MS"] === undefined
      ? {}
      : { timeoutMs: process.env["ZACAO_SHEETS_API_TIMEOUT_MS"] }),
  });
}
