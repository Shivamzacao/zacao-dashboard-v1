import { ShellIcon } from "./shell-icon";

import type { DashboardRouteDefinition } from "@/src/presentation/shell/routes";

export function FixtureReadinessShell({ route }: { readonly route: DashboardRouteDefinition }) {
  return (
    <section className="fixture-readiness-shell" aria-labelledby="fixture-readiness-title">
      <span className="fixture-readiness-icon">
        <ShellIcon name="source" />
      </span>
      <div>
        <p className="fixture-readiness-kicker">
          {route.availability === "conditional" ? "Conditional V1" : "Frontend foundation"}
        </p>
        <h2 id="fixture-readiness-title">Synthetic TEST fixture is active</h2>
        <p>
          This shell is validated against the frozen B7 contract. No production source is connected
          during Phase 2.
        </p>
      </div>
    </section>
  );
}
