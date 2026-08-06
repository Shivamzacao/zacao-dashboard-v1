# Phase 1 B1 Test Evidence

Evidence date: 2026-08-06

Branch: `codex/phase-1-b1`

Runtime: Node.js 24; pnpm 11.9.0

## Final deterministic checks

| Check | Final result | Evidence |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | Passed | Lockfile unchanged; pnpm 11.9.0 |
| `corepack pnpm format:check` | Passed | All selected B1 files follow Prettier formatting |
| `corepack pnpm lint` | Passed | Zero warnings under strict ESLint and import boundaries |
| `corepack pnpm typecheck` | Passed | Strict TypeScript 5.9.3 |
| `corepack pnpm check:boundaries` | Passed | Domain/application dependency direction and server/client boundary |
| `corepack pnpm check:secrets` | Passed | Tracked and new non-ignored files; DOCX binaries excluded |
| `corepack pnpm test` | Passed | 6 files, 41 tests |
| `corepack pnpm test:coverage` | Passed | 100% statements, branches, functions, and lines for critical utilities |
| `corepack pnpm audit --audit-level high` | Failed security policy | 3 high and 2 moderate transitive findings in the locked Next.js dependency tree |
| `corepack pnpm build` | Not run / not applicable to B1 | B1 creates no page or Route Handler; API routes begin in B7 and frontend begins in Phase 2 |

## Coverage result

```text
Test Files: 6 passed (6)
Tests:      41 passed (41)
Statements: 100% (89/89)
Branches:   100% (32/32)
Functions:  100% (27/27)
Lines:      100% (84/84)
```

Coverage scope is intentionally the critical utility boundary: money, percentage calculation, timezone/date boundaries, filter normalization, and cache-key generation. Contract schemas, ports, fixtures, and the metric registry are exercised by unit, contract, environment, lint, and type checks but are not misrepresented as branch-covered utility code.

## Fixed failures during B1

| Failure | Classification | Resolution | Final state |
|---|---|---|---|
| Next.js type declarations required `PromiseWithResolvers` | Introduced configuration mismatch | Raised TypeScript target/library from ES2022 to ES2024, consistent with Node 24 | Fixed; typecheck passed |
| Strict index-signature rule rejected dot access on `process.env` | Introduced code issue | Used explicit bracket access | Fixed; typecheck passed |
| Vitest did not initially resolve the `@` TypeScript alias | Introduced test configuration issue | Added matching Vitest alias and ESM package mode | Fixed; 41 tests passed |
| Initial critical-utility coverage was below 100% | Introduced test/implementation issue | Removed impossible parsing branches, added branch cases, and documented one defensive unreachable convergence guard | Fixed; 100% coverage passed |
| pnpm initially quarantined two native transitive builds | Supply-chain policy working as designed | Added a narrow allowlist for `sharp` and `unrs-resolver`; no other dependency build is allowed | Fixed; frozen install passed |

No failure was hidden, marked flaky, or converted into a passing result by skipping a required test.

## Security finding

The locked latest Next.js 16.2.x release is `16.2.12`. Its dependency tree contains:

- `sharp 0.34.5`, while the advisory reports patched versions at `0.35.0` or later.
- Next-pinned `postcss 8.4.31`, while the two high advisories report patched versions at `8.5.12` and `8.5.18` or later.

Registry metadata shows Next.js `16.3.0` depends on patched `sharp ^0.35.3` and `postcss 8.5.23`. Changing from the locked `16.2.x` line requires ZACAO approval; B1 did not silently upgrade or force unsupported transitive overrides.

## Approved focused security correction

ZACAO's approved Fast Sequential Delivery Protocol authorized routine safe minor maintenance within the existing Next.js major architecture. Next.js and `eslint-config-next` were pinned to `16.3.0`.

Focused verification after the change:

| Check | Result |
|---|---|
| Typecheck | Passed |
| Lint | Passed |
| Architecture boundaries | Passed |
| Secret scan | Passed |
| Relevant B1 tests | 41 passed |
| Dependency audit | No known vulnerabilities found |

Next.js 16.3 referenced two URLPattern aliases that the pinned Node 24 types did not expose globally. A local type-only compatibility declaration maps those existing platform types; it introduces no runtime package or behavior.
