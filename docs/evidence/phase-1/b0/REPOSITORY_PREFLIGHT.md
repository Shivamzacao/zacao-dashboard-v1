# Phase 1 B0 Repository Preflight Evidence

Audit date: 2026-08-06

Repository: `/Users/aziz/zacao-dashboard-v1`

Remote: `https://github.com/AzizPithawala/zacao-dashboard-v1`

Audit branch: `codex/phase-1-b0`

## 1. Scope and safety

- Authorized work: Phase 1, Subphase B0 only.
- No application code, connector, workbook, infrastructure, or external-source change was authorized or performed.
- The historical workspace `/Users/aziz/zacao-dashboard` was not modified.
- No Shopify, Klaviyo, Google, Vercel, Trigger.dev, or database credential was requested or used.
- No native Google Sheet was created or changed. The locked operating model reserves local synthetic templates and empty production templates for the relevant later authorized subphase; Drive writes require separate authorization.

## 2. Repository state before B0 evidence

| Check | Observed result |
|---|---|
| Starting branch | `main`, tracking `origin/main` |
| Starting worktree | Clean |
| Starting commit | `31002cea54344d9b30186f073e73d29d4d697413` |
| Baseline tag | `planning-baseline-v1.0` at the starting commit |
| Remote visibility | GitHub reports `isPrivate: true` |
| Default remote branch | `main` |
| Tracked files | 19 planning/configuration files; no application source |
| Applicable `AGENTS.md` | None found |

B0 work was isolated on `codex/phase-1-b0` so the locked `main` baseline remains unchanged until gate approval.

## 3. Locked artifact integrity

All locked files match `docs/governance/LOCKED_BASELINE.md`:

| Artifact | SHA-256 | Result |
|---|---|---|
| Deliverable Plan DOCX | `bca3188cdf13e47997ddb61366ea2a2d2b7e242a9dcf3d5c8a7b07d4a1319719` | Passed |
| Architecture Plan DOCX | `b2f163aa519ff4bdbb783baf1e42c284908cfd1c4495fd60455dcc95ebe7f952` | Passed |
| Architecture Plan Markdown | `9a436ffc325fb30ff55e488cb8f178ec233de289cea89a74d239124a4e4d581d` | Passed |
| Google Sheets Operating Model | `dcdc4e34854b6228889cdca8b721d9594f832b163a751318138f5b8222e5ba1b` | Passed |

The locked files were read, not edited.

## 4. File, dependency, and configuration inventory

Present:

- Locked product, architecture, Sheet-operating, source-audit, decision, blocker, and traceability documents.
- Minimal `.editorconfig`, `.gitignore`, `.env.example`, `.node-version`, and `.nvmrc`.
- `.env.example` contains only non-secret reporting settings and a warning against real values.

Absent by design:

- `package.json` and `pnpm-lock.yaml`.
- Next.js/React/TypeScript source and configuration.
- ESLint, Vitest, Playwright, Testing Library, axe, or k6 configuration.
- Application tests or test fixtures.
- Supabase, database, migration, Drizzle, authentication, RLS, or webhook code.
- Shopify, Klaviyo, Google, cache, telemetry, API, export, or scheduling code.

These absences confirm that B1 has not started. They are not implementation failures.

## 5. Toolchain verification

| Tool | Locked requirement | Available during B0 | Classification |
|---|---|---|---|
| Node.js | 24 LTS | `v24.12.0` | Compatible |
| pnpm | 11.9.x | `11.16.0` bundled | Version mismatch; B1 must pin the approved 11.9.x line before install |
| Next.js | 16.2.x | No manifest/install | Not verifiable until B1 |
| React | 19.2.x | No manifest/install | Not verifiable until B1 |
| TypeScript | 5.9.x | No manifest/install | Not verifiable until B1 |
| Vitest | 4.x | No manifest/install | Not verifiable until B1 |
| Playwright | 1.62.x | No manifest/install | Not verifiable until the authorized phase adds it |
| Git | Any supported | `2.50.1` | Available |
| GitHub CLI | Any supported | `2.97.0` | Available |

No package was installed or version silently changed in B0.

## 6. Baseline commands and exact classification

| Command/check | Result | Classification |
|---|---|---|
| Clean install from lockfile | Not run | Not applicable: no package manifest or lockfile exists |
| Existing lint | Not run | Not applicable: no script/config/source exists |
| Existing typecheck | Not run | Not applicable: no script/config/source exists |
| Existing unit/contract tests | Not run | Not applicable: no tests/config/source exists |
| Existing production build | Not run | Not applicable: no application exists |
| `git fsck --full` | Exit 0, no findings | Passed |
| `git diff --check` before evidence | Exit 0 | Passed |

Nothing was skipped and then described as passed. The first deterministic install and runnable static/test/build baseline belong to B1 after its separate authorization.

## 7. Security and privacy scans

Tracked text files were scanned for private-key markers and populated values for Shopify, Klaviyo, Google, Supabase, and database secret variables. No credential value or private-key block was found.

Tracked text files were scanned for email-like values. No file-content email address was found. Date strings produced false positives in a deliberately broad phone-like pattern; manual classification confirmed they are research dates, not phone numbers. Git commit metadata contains the repository owner’s author email, which is normal Git metadata and is not application content or a secret.

No raw provider payload, customer profile, email, phone, postal address, investor contact, or committed test fixture exists in the repository.

## 8. Existing failure classification

| Finding | Origin | Impact | Required action |
|---|---|---|---|
| No runtime project or tests | Intentional clean baseline | B0 cannot run application checks | B1 scaffolds only after authorization |
| Available pnpm is 11.16.0, not locked 11.9.x | Development runtime | Determinism would be violated if used unpinned | B1 pins and verifies an approved 11.9.x version |
| Four product/source decisions remain open | Pre-existing locked blocker register | Blocks only dependent certification/production behavior | Do not infer; resolve at the relevant gate |

No introduced application failure exists because B0 created governance/evidence only.

## 9. B0 conclusion

The repository is a safe, clean starting point. The only B0 approval item is the proposed legacy disposition. Connector keys are not urgent for B0; request them only in their authorized source-adapter subphases through server-side secret management.
