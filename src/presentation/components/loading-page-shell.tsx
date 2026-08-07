export function LoadingPageShell() {
  return (
    <main className="dashboard-content" aria-label="Loading dashboard section">
      <div className="skeleton skeleton-eyebrow" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-description" />
      <div className="skeleton skeleton-readiness" />
      <span className="sr-only">Loading dashboard section</span>
    </main>
  );
}
