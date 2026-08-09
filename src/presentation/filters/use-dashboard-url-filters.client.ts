"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  dateRangeForPreset,
  parseFrontendFilterState,
  updateFilterState,
} from "./url-filter-state";

import type { FilterOptions } from "@/src/application/api";
import type { DashboardFilters, IsoDate } from "@/src/domain/contracts";
import type { DateRangePreset } from "./url-filter-state";

export function useDashboardUrlFilters(supported: FilterOptions, today: IsoDate) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const state = useMemo(
    () => parseFrontendFilterState(new URLSearchParams(rawQuery), supported, today),
    [rawQuery, supported, today],
  );

  useEffect(() => {
    if (rawQuery !== state.query) {
      router.replace(pathname + "?" + state.query, { scroll: false });
    }
  }, [pathname, rawQuery, router, state.query]);

  const push = useCallback(
    (patch: Partial<DashboardFilters>) => {
      const next = updateFilterState(state, patch, supported, today);
      router.push(pathname + "?" + next.query, { scroll: false });
    },
    [pathname, router, state, supported, today],
  );

  const selectPreset = useCallback(
    (preset: DateRangePreset) => push(dateRangeForPreset(preset, today)),
    [push, today],
  );

  return { state, push, selectPreset };
}
