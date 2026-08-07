# Phase 2 Frontend Checklist

| Subphase | Objective                                     | Status                           | Gate dependency                        |
| -------- | --------------------------------------------- | -------------------------------- | -------------------------------------- |
| F0       | Visual contract audit and frontend scope lock | Approved                         | B7 approved under sequencing amendment |
| F1       | Frontend foundation and application shell     | Approved                         | Explicit F0 approval                   |
| F2       | Reusable dashboard component library          | Gate complete; awaiting approval | Explicit F1 approval                   |
| F3       | Complete page implementation                  | Not started                      | Explicit F2 approval                   |
| F4       | Frontend hardening and optimization           | Not started                      | Explicit F3 approval                   |
| F5       | Full frontend certification                   | Not started                      | Explicit F4 approval                   |

## F0 checklist

| Item                                                  | Status    | Evidence                                        |
| ----------------------------------------------------- | --------- | ----------------------------------------------- |
| Locate and render exact approved demo                 | Completed | Approved live demo URL in F0 visual contract    |
| Classify every route and visual component             | Completed | `docs/architecture/F0_VISUAL_CONTRACT.md`       |
| Map all data-bearing elements to B7/readiness/removal | Completed | `docs/architecture/F0_FRONTEND_TRACEABILITY.md` |
| Extract exact implementation tokens                   | Completed | `docs/architecture/F0_DESIGN_TOKENS.md`         |
| Capture desktop/tablet baselines                      | Completed | 18 files and screenshot manifest                |
| Define Operations from existing patterns              | Completed | F0 visual contract                              |
| Identify unsupported auth/admin/write UI              | Completed | F0 visual contract and traceability             |
| Record focused accessibility baseline                 | Completed | F0 visual contract                              |
| Obtain explicit approval before F1                    | Completed | ZACAO F0 approval                               |

## F1 checklist

| Item                                                      | Status            | Evidence                                                 |
| --------------------------------------------------------- | ----------------- | -------------------------------------------------------- |
| Implement frozen design tokens and shell geometry         | Completed         | app/globals.css                                          |
| Implement nine approved routes and responsive navigation  | Completed         | src/presentation/shell/routes.ts, App Router route       |
| Implement URL-backed B7 filter allowlist                  | Completed         | src/presentation/filters/                                |
| Validate frozen B7 TEST fixtures at provider boundary     | Completed         | src/presentation/providers/fixture-dashboard-provider.ts |
| Implement loading, error, not-found, and freshness shells | Completed         | App Router special files and presentation components     |
| Pass keyboard, focus, responsive, and WCAG checks         | Completed         | Focused Vitest and Playwright suites                     |
| Add desktop and tablet visual baselines                   | Completed         | Playwright snapshot directory                            |
| Obtain explicit approval before F2                        | Completed         | ZACAO F1 approval                                        |

## F2 checklist

| Item                                                    | Status            | Evidence                                          |
| ------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| Implement typed provider-neutral component families     | Completed         | `src/presentation/components/dashboard/`          |
| Implement all approved reusable chart wrappers          | Completed         | `charts.client.tsx`                               |
| Cover truthful readiness and unavailable states         | Completed         | `state-surface.tsx`, synthetic fixture matrix     |
| Verify extremes, null/zero, tables, drawer, and exports | Completed         | Focused F2 Vitest suite                           |
| Pass accessibility, reflow, reduced-motion checks       | Completed         | Focused F2 Playwright suite                       |
| Freeze desktop and tablet visual baselines              | Completed         | F2 snapshot directory and visual-regression report |
| Preserve B7 and architecture boundaries                 | Completed         | Boundary check and F2 gate report                 |
| Obtain explicit approval before F3                      | Requires approval | F2 gate report                                    |
