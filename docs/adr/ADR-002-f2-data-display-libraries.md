# ADR-002: F2 data-display libraries

Status: Accepted

Date: 2026-08-07

## Problem

F2 requires the chart wrappers and bounded sortable table behavior already fixed by the locked
frontend architecture. Those runtime packages were not yet installed.

## Decision

Use exact versions `recharts@3.10.1` and `@tanstack/react-table@8.21.3`. Recharts is contained
behind provider-neutral wrappers with textual summaries and accessible tables. TanStack Table is
contained behind the typed bounded `DataTable`; B7 remains responsible for production pagination.

No chart type, provider field, business calculation, export format, or backend contract is added.

## Accessibility and compiler treatment

Recharts' visual SVG trees are removed from the accessibility tree because each wrapper supplies a
concise summary and semantic data table. TanStack Table's documented imperative helper API is
excluded from React Compiler memoization at its single call site; all display state remains local.

## Cost, security, and rollback

Both packages are client-side presentation dependencies and add no service, credential, source
access, persistence, or business logic. The lockfile is authoritative. Rollback removes the two
packages and their isolated wrappers if the locked architecture changes.
