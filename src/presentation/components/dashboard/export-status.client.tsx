"use client";

export type ExportState = "idle" | "requesting" | "success" | "failure" | "unsupported";

export function ExportStatus({
  state,
  onRequest,
}: {
  readonly state: ExportState;
  readonly onRequest?: () => void;
}) {
  const copy = {
    idle: "Export CSV",
    requesting: "Preparing CSV…",
    success: "CSV ready",
    failure: "Export failed",
    unsupported: "Export unavailable",
  }[state];
  return (
    <div
      className={`export-status export-${state}`}
      role={state === "failure" ? "alert" : "status"}
    >
      <button
        type="button"
        disabled={state === "requesting" || state === "unsupported"}
        onClick={onRequest}
      >
        {copy}
      </button>
      {state === "success" ? <span>Download completed successfully.</span> : null}
      {state === "failure" ? <span>Try again without changing source data.</span> : null}
    </div>
  );
}
