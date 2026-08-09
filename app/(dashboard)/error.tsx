"use client";

export default function DashboardError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return (
    <main className="dashboard-content">
      <section className="route-state-card" role="alert">
        <p className="page-eyebrow">Unable to load section</p>
        <h1>Something went wrong.</h1>
        <p>No source data was changed. Retry this read-only dashboard section.</p>
        <button className="state-action" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
