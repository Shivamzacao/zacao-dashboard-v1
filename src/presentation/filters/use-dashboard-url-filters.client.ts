"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useTransition } from "react";
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

  // The controls read their value from the URL, which only settles once the
  // server has re-rendered the page. Optimistic state lets a selection show up
  // on the current frame, and `pending` stays true for the whole navigation so
  // the shell can say the numbers are still being fetched.
  const [optimisticState, applyOptimisticState] = useOptimistic(state);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (rawQuery !== state.query) {
      router.replace(pathname + "?" + state.query, { scroll: false });
    }
  }, [pathname, rawQuery, router, state.query]);

  const push = useCallback(
    (patch: Partial<DashboardFilters>) => {
      // Patch the optimistic state, not the committed one: a second change made
      // while the first navigation is still in flight must build on it rather
      // than silently drop it.
      const next = updateFilterState(optimisticState, patch, supported, today);
      if (next.query === optimisticState.query) return;
      startTransition(() => {
        applyOptimisticState(next);
        router.push(pathname + "?" + next.query, { scroll: false });
      });
    },
    [applyOptimisticState, optimisticState, pathname, router, supported, today],
  );

  const selectPreset = useCallback(
    (preset: DateRangePreset) => push(dateRangeForPreset(preset, today)),
    [push, today],
  );

  return { state: optimisticState, push, selectPreset, pending };
}
