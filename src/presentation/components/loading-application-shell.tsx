export function LoadingApplicationShell() {
  return (
    <div className="dashboard-shell" aria-label="Loading dashboard">
      <aside className="dashboard-sidebar loading-sidebar" aria-hidden="true">
        <div className="skeleton skeleton-brand" />
        <div className="skeleton skeleton-workspace" />
        <div className="skeleton-navigation">
          {Array.from({ length: 9 }, (_, index) => (
            <div className="skeleton skeleton-navigation-row" key={index} />
          ))}
        </div>
      </aside>
      <div className="dashboard-main">
        <div className="dashboard-topbar loading-topbar" />
        <main className="dashboard-content">
          <div className="skeleton skeleton-eyebrow" />
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-description" />
          <div className="skeleton skeleton-readiness" />
        </main>
      </div>
      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}
