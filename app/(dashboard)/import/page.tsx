import type { Metadata } from "next";

import { manualWorkbookStore } from "@/src/infrastructure/api";
import {
  DataImportView,
  type HistoryRow,
} from "@/src/presentation/features/data-import/data-import.client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Data import" };

async function loadHistory(): Promise<readonly HistoryRow[]> {
  if (!manualWorkbookStore) return [];
  try {
    const batches = await manualWorkbookStore.recentBatches(50);
    return batches.map((batch) => ({
      uploadedAt: batch.uploadedAt.replace("T", " ").slice(0, 16),
      tab: batch.tab,
      filename: batch.filename,
      rowCount: batch.rowCount,
      issueCount: batch.issueCount,
    }));
  } catch {
    // A store outage must not block the upload flow; history simply shows empty.
    return [];
  }
}

export default async function DataImportPage() {
  const initialHistory = await loadHistory();

  return (
    <main className="dashboard-content">
      <header className="page-heading">
        <div>
          <p className="page-eyebrow">Manual workbook</p>
          <h1>Data import</h1>
          <p className="page-description">
            Upload the ZACAO input workbook, review what validated, and save the sheets you want the
            dashboard to use.
          </p>
        </div>
      </header>
      <DataImportView
        initialHistory={initialHistory}
        initialStoreConfigured={manualWorkbookStore !== null}
      />
    </main>
  );
}
