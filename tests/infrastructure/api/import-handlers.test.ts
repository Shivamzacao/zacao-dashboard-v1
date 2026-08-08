import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  ManualBatchSummary,
  ManualCommitInput,
  ManualWorkbookStore,
} from "@/src/application/ports/manual-workbook";
import { createImportApiHandlers } from "@/src/infrastructure/api/import-handlers";
import { MANUAL_TAB_CONTRACTS } from "@/src/infrastructure/manual-workbook/contracts.generated";

const now = () => new Date("2026-08-08T12:00:00.000Z");

class FakeStore implements ManualWorkbookStore {
  commits: ManualCommitInput[] = [];

  async insertCommit(input: ManualCommitInput) {
    this.commits.push(input);
    return {
      uploadId: "upload-1",
      batches: input.tabs.map((tab, index) => ({
        batchId: `batch-${index + 1}`,
        tab: tab.tab,
        rowCount: tab.records.length,
      })),
    };
  }

  async latestCommittedBatches(): Promise<readonly ManualBatchSummary[]> {
    return [];
  }

  async readTabRecords() {
    return [];
  }

  async recentBatches(): Promise<readonly ManualBatchSummary[]> {
    return [
      {
        batchId: "batch-1",
        uploadId: "upload-1",
        tab: "Marketing_Spend",
        filename: "sample.xlsx",
        uploadedAt: "2026-08-08T11:00:00.000Z",
        rowCount: 2,
        issueCount: 0,
        workbookState: "ready",
      },
    ];
  }
}

let workbookBytes: Uint8Array;

beforeAll(async () => {
  // A full 22-sheet workbook: every contract tab with its exact headers, one
  // valid production row in Marketing_Spend, and one draft row excluded.
  const workbook = new ExcelJS.Workbook();
  for (const [tab, contract] of Object.entries(MANUAL_TAB_CONTRACTS)) {
    const sheet = workbook.addWorksheet(tab);
    sheet.addRow(contract.columns.map(({ header }) => header));
    if (tab === "Marketing_Spend") {
      const byHeader: Record<string, unknown> = {
        record_id: "SPD-001",
        date: "2026-08-01",
        platform: "meta",
        account: "ZACAO Main",
        spend_usd: 180.5,
        source_status: "production",
      };
      sheet.addRow(contract.columns.map(({ header }) => byHeader[header] ?? null));
      sheet.addRow(
        contract.columns.map(({ header }) =>
          header === "record_id"
            ? "SPD-DRAFT"
            : header === "source_status"
              ? "draft"
              : (byHeader[header] ?? null),
        ),
      );
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  workbookBytes = new Uint8Array(buffer as ArrayBuffer);
});

function uploadRequest(url: string, tabs: readonly string[] = []): Request {
  const form = new FormData();
  form.set("file", new File([workbookBytes as BlobPart], "upload.xlsx"));
  for (const tab of tabs) form.append("tabs", tab);
  return new Request(url, { method: "POST", body: form });
}

describe("import API handlers", () => {
  it("previews a workbook without writing anything", async () => {
    const store = new FakeStore();
    const handlers = createImportApiHandlers({ store, now });
    const response = await handlers.preview(
      uploadRequest("http://localhost/api/v1/imports/preview"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // Draft rows are excluded silently (not errors), so the workbook is ready.
    expect(body.data.workbookState).toBe("ready");
    expect(body.data.storeConfigured).toBe(true);
    const marketing = body.data.tabs.find((tab: { tab: string }) => tab.tab === "Marketing_Spend");
    expect(marketing).toMatchObject({ populatedRows: 2, acceptedRows: 1, excludedRows: 1 });
    expect(store.commits).toHaveLength(0);
  });

  it("commits selected savable tabs and rejects empty ones without blanking them", async () => {
    const store = new FakeStore();
    const handlers = createImportApiHandlers({ store, now });
    const response = await handlers.commit(
      uploadRequest("http://localhost/api/v1/imports/commit", [
        "Marketing_Spend",
        "Growth_Pipeline",
      ]),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.savedTabs).toEqual([
      { tab: "Marketing_Spend", batchId: "batch-1", rowCount: 1 },
    ]);
    expect(body.data.rejectedTabs).toEqual([
      { tab: "Growth_Pipeline", reason: "No accepted production rows; saving would blank the tab" },
    ]);
    expect(store.commits).toHaveLength(1);
    expect(store.commits[0]?.tabs[0]?.records[0]).toMatchObject({ record_id: "SPD-001" });
  });

  it("rejects commits without a configured store, unknown tabs, and non-xlsx files", async () => {
    const handlers = createImportApiHandlers({ store: null, now });
    const noStore = await handlers.commit(
      uploadRequest("http://localhost/api/v1/imports/commit", ["Marketing_Spend"]),
    );
    expect(noStore.status).toBe(400);
    expect(JSON.stringify(await noStore.json())).toContain("MANUAL_WORKBOOK_NOT_CONFIGURED");

    const withStore = createImportApiHandlers({ store: new FakeStore(), now });
    const unknownTab = await withStore.commit(
      uploadRequest("http://localhost/api/v1/imports/commit", ["Nonsense_Tab"]),
    );
    expect(unknownTab.status).toBe(400);

    const badForm = new FormData();
    badForm.set("file", new File([new TextEncoder().encode("plain") as BlobPart], "data.csv"));
    const badFile = await withStore.preview(
      new Request("http://localhost/api/v1/imports/preview", { method: "POST", body: badForm }),
    );
    expect(badFile.status).toBe(400);
  });

  it("serves import history and works without a store", async () => {
    const handlers = createImportApiHandlers({ store: new FakeStore(), now });
    const response = await handlers.history(new Request("http://localhost/api/v1/imports"));
    const body = await response.json();
    expect(body.data.storeConfigured).toBe(true);
    expect(body.data.batches[0]).toMatchObject({ tab: "Marketing_Spend", rowCount: 2 });

    const unconfigured = createImportApiHandlers({ store: null, now });
    const emptyBody = await (
      await unconfigured.history(new Request("http://localhost/api/v1/imports"))
    ).json();
    expect(emptyBody.data).toEqual({ storeConfigured: false, batches: [] });
  });
});
