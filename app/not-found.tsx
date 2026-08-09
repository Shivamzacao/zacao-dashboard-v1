import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone-state">
      <p className="page-eyebrow">Not found</p>
      <h1>This dashboard section does not exist.</h1>
      <p>Use an approved V1 destination from the dashboard navigation.</p>
      <Link className="state-action" href="/executive">
        Go to Executive health
      </Link>
    </main>
  );
}
