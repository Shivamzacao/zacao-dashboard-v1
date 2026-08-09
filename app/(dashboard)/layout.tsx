import { Suspense } from "react";
import { connection } from "next/server";

import { backendApiService } from "@/src/infrastructure/api/handlers";
import { DashboardShellClient } from "@/src/presentation/components/dashboard-shell.client";
import { LoadingApplicationShell } from "@/src/presentation/components/loading-application-shell";
import { phase2FixtureProvider } from "@/src/presentation/providers/fixture-dashboard-provider";
import { dateInTimeZone } from "@/src/domain/utilities/time";

import type { IsoDate } from "@/src/domain/contracts";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const liveMode = process.env["ZACAO_DATA_MODE"] === "live";
  const supportedFilters = liveMode
    ? backendApiService.supportedFilters
    : phase2FixtureProvider.getShellContext().supportedFilters;
  const today = dateInTimeZone(new Date(), "America/New_York") as IsoDate;

  return (
    <Suspense fallback={<LoadingApplicationShell />}>
      <DashboardShellClient
        supportedFilters={supportedFilters}
        today={today}
        dataMode={liveMode ? "live" : "fixture"}
      >
        {children}
      </DashboardShellClient>
    </Suspense>
  );
}
