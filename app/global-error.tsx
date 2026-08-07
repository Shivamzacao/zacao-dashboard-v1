"use client";

export default function GlobalError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="standalone-state">
          <p className="page-eyebrow">Dashboard error</p>
          <h1>We could not load the dashboard.</h1>
          <p>No source data was changed. Try loading the application shell again.</p>
          <button className="state-action" type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
