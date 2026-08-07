import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <main className="dashboard-content">
      <section className="route-state-card">
        <p className="page-eyebrow">Not found</p>
        <h1>This dashboard section is not approved for V1.</h1>
        <p>Choose one of the approved intelligence sections from the navigation.</p>
        <Link className="state-action" href="/executive">
          Go to Executive health
        </Link>
      </section>
    </main>
  );
}
