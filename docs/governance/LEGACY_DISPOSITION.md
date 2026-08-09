# B0 Legacy Disposition Map

Status: Proposed for ZACAO approval at Gate B0.

## Scope boundary

The implementation repository `/Users/aziz/zacao-dashboard-v1` is intentionally clean. The former workspace `/Users/aziz/zacao-dashboard` remains an untouched historical reference and is not part of the new build. B0 did not copy, delete, refactor, or execute abandoned application code.

## Keep / replace / retire map

| Area | Evidence in clean repository | Disposition | Rule |
|---|---|---|---|
| Locked deliverable, architecture, Google Sheets model, research, and governance | Present and checksum-locked | **Keep** | These control implementation in the documented authority order. |
| Minimal repository settings (`.editorconfig`, `.gitignore`, runtime markers, `.env.example`) | Present; contains no secrets | **Keep** | B1 may extend them only within its authorized foundation scope. |
| Approved demo | Referenced, not copied as application code | **Keep as visual authority** | Frontend implementation waits for Phase 2 and its visual audit. |
| Supabase, database schemas, migrations, Drizzle, RLS | Not present | **Retire / do not import** — superseded in part by DEC-017 (2026-08-08) | Active V1 originally had no primary database. DEC-017 approved a scoped re-entry: a new Supabase Postgres store for versioned manual-workbook imports only (trigger: durable history for manual input data plus user-initiated saves; see ADR-003). No abandoned code was imported; no application login was added; sources remain read-only. |
| Application authentication, users, sessions, roles | Not present | **Retire / do not import** | Active V1 has no application login. Platform-level protection remains an open production decision. |
| Webhooks or source-system mutation handlers | Not present | **Retire / do not import** | Sources are read-only; no write or mutation path may be introduced. |
| Prior Shopify, Klaviyo, Google, Budget, or S&OP connector code | Not present | **Replace when authorized** | B2-B4 create new least-privilege adapters from locked contracts; no old connector is trusted implicitly. |
| Prior frontend pages/components/styles | Not present | **Do not import during Phase 1** | Phase 2 will audit the approved demo and decide any permitted visual reuse. |
| Old build, deployment, database, and CI configuration | Not present | **Replace when authorized** | B1/B8 implement only the approved modular Next.js architecture and CI controls. |
| Historical repository/workspace | Outside clean repository | **Preserve untouched** | It remains non-authoritative evidence; no deletion or cleanup is authorized. |

## Approval consequence

Approval means the clean repository remains the sole implementation location and abandoned Supabase/auth/database/webhook patterns will not be imported. It does not authorize B1 or any coding by itself; B1 still requires explicit authorization.
