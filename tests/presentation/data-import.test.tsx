// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataImportView } from "@/src/presentation/features/data-import/data-import.client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function tabReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tab: "Marketing_Spend",
    populatedRows: 3,
    acceptedRows: 2,
    excludedRows: 1,
    issues: [],
    ...overrides,
  };
}

function envelope(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function selectWorkbook() {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04]) as BlobPart], "workbook.xlsx");
}

describe("Data import view", () => {
  it("previews a workbook and preselects sheets that have savable rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        filename: "workbook.xlsx",
        workbookState: "partial",
        populatedRows: 4,
        acceptedRows: 2,
        storeConfigured: true,
        tabs: [
          tabReport(),
          tabReport({
            tab: "Growth_Pipeline",
            populatedRows: 1,
            acceptedRows: 0,
            excludedRows: 0,
            issues: [
              {
                code: "INVALID_ENUM",
                tab: "Growth_Pipeline",
                row: 2,
                column: "stage",
                message: "Invalid stage",
              },
            ],
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DataImportView initialHistory={[]} initialStoreConfigured={true} />);
    await userEvent.upload(screen.getByLabelText("Workbook file"), selectWorkbook());

    await waitFor(() => expect(screen.getByLabelText("Save Marketing_Spend")).toBeTruthy());
    // Savable sheet is preselected; the empty one is disabled and unchecked.
    expect(screen.getByLabelText<HTMLInputElement>("Save Marketing_Spend").checked).toBe(true);
    const blocked = screen.getByLabelText<HTMLInputElement>("Save Growth_Pipeline");
    expect(blocked.checked).toBe(false);
    expect(blocked.disabled).toBe(true);
    // Validation issues are surfaced with their row and column.
    expect(screen.getByRole("table", { name: "Growth_Pipeline validation issues" })).toBeTruthy();
    expect(screen.getByText("INVALID_ENUM")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save 1 sheet(s)" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/imports/preview", expect.anything());
  });

  it("commits selected sheets and reports the commit-time result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          filename: "workbook.xlsx",
          workbookState: "ready",
          populatedRows: 3,
          acceptedRows: 2,
          storeConfigured: true,
          tabs: [tabReport()],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          uploadId: "0f0f0f0f-1111-2222-3333-444444444444",
          filename: "workbook.xlsx",
          workbookState: "ready",
          savedTabs: [{ tab: "Marketing_Spend", batchId: "batch-1", rowCount: 2 }],
          rejectedTabs: [],
          tabs: [tabReport()],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          storeConfigured: true,
          batches: [
            {
              batchId: "batch-1",
              uploadId: "0f0f0f0f-1111-2222-3333-444444444444",
              tab: "Marketing_Spend",
              filename: "workbook.xlsx",
              uploadedAt: "2026-08-08T12:00:00.000Z",
              rowCount: 2,
              issueCount: 0,
              workbookState: "ready",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DataImportView initialHistory={[]} initialStoreConfigured={true} />);
    await userEvent.upload(screen.getByLabelText("Workbook file"), selectWorkbook());
    await waitFor(() => expect(screen.getByRole("button", { name: /Save 1 sheet/ })).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: /Save 1 sheet/ }));

    await waitFor(() => expect(screen.getByText(/1 sheet\(s\) saved/)).toBeTruthy());
    expect(screen.getByText(/Marketing_Spend \(2\)/)).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/imports/commit", expect.anything());
    // History refreshes from the server after a successful save.
    expect(screen.getByRole("table", { name: "Import history" })).toBeTruthy();
  });

  it("blocks saving and explains when the database is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelope({
          filename: "workbook.xlsx",
          workbookState: "ready",
          populatedRows: 3,
          acceptedRows: 2,
          storeConfigured: false,
          tabs: [tabReport()],
        }),
      ),
    );
    render(<DataImportView initialHistory={[]} initialStoreConfigured={false} />);
    expect(screen.getByText("Database not connected")).toBeTruthy();
    await userEvent.upload(screen.getByLabelText("Workbook file"), selectWorkbook());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save 1 sheet/ }).hasAttribute("disabled")).toBe(
        true,
      ),
    );
  });

  it("surfaces server problem details when a upload is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Invalid request",
            detail: "Only .xlsx workbooks are accepted",
            errors: [{ path: "file", message: "Only .xlsx workbooks are accepted" }],
          }),
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    render(<DataImportView initialHistory={[]} initialStoreConfigured={true} />);
    await userEvent.upload(screen.getByLabelText("Workbook file"), selectWorkbook());
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("Only .xlsx workbooks are accepted")).toBeTruthy();
  });
});
