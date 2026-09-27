# Klaviyo Integration

Klaviyo is the authoritative source for Klaviyo-native engagement: campaign and flow performance, sends, deliveries, opens, clicks, bounces, unsubscribes, spam complaints, Klaviyo-attributed revenue and engagement trend. Shopify attribution (UTM sessions and orders, consent) stays separate and is never substituted for it.

## Architecture

```text
Dashboard page ─► BackendApiService ─► DashboardOrchestrator (cache, concurrency 4)
                                            │
                    klaviyo contributors (klaviyo-performance / -engagement / -profiles / -readiness)
                                            │
                    KlaviyoAdapter (src/infrastructure/klaviyo/adapter.ts)
                                            │
                    KlaviyoClient (client.ts): server-only, GET + 3 allowlisted report POSTs
                                            │
                                     https://a.klaviyo.com/api/*
```

No component calls Klaviyo directly. The key is read only by `src/infrastructure/klaviyo/runtime.ts` (`server-only`).

## Authentication

- Header `Authorization: Klaviyo-API-Key <KLAVIYO_PRIVATE_API_KEY>`, plus `revision: <KLAVIYO_API_REVISION>` (currently `2026-07-15`, live-verified).
- Direct REST (JSON:API); no SDK.

## Endpoints

| Endpoint | Method | Used for | Pagination |
|---|---|---|---|
| `/api/accounts` | GET | readiness probe | single |
| `/api/metrics` | GET | registry reconciliation (`page[size]` is **not** accepted: live 400, removed) | `links.next`, ≤20 pages |
| `/api/campaigns?filter=equals(messages.channel,'email'\|'sms')&page[size]=100` | GET | campaign names | `links.next`, ≤20 pages; truncation reported |
| `/api/flows?page[size]=50` | GET | flow names | same |
| `/api/campaign-values-reports` | POST | campaign KPIs | single report |
| `/api/flow-values-reports` | POST | flow KPIs | single report |
| `/api/metric-aggregates` | POST | engagement trend (opened/clicked) | single |
| `/api/events?page[size]=1` | GET | activity presence | single |
| `/api/profiles?fields[profile]=properties&page[size]=100` | GET | demographics (only if both property env vars are set) | `links.next`, ≤20 pages |

Report statistics now include `unsubscribe_uniques` and `unsubscribe_rate` (C-7), both accepted live. Rows are grouped by `send_channel` (verified live), which is how email and SMS are split.

## Date semantics

Unchanged. Reports use America/New_York day bounds from the dashboard period (`requests.ts`), send-date semantics for values reports and event-time for aggregates, with a maximum window of 367 days.

## Rate limiting (verified live 2026-09-28)

Values reports carry `ratelimit-limit: 1, 1;w=1, 2;w=60, 225;w=86400`: 1 per second, 2 per minute, 225 per day. The client therefore:

- serializes the two values-report paths and spaces them ≥ 1.1 s apart;
- on HTTP 429, waits for `Retry-After` (or `RateLimit-Reset`) plus jitter;
- bounds the total wait at 65 s, then fails explicitly as `throttled`, never as empty data.

Other endpoints keep the short transient backoff. The performance contributor makes 2 values-report calls per cache refresh (fresh 900 s, stale 3,600 s).

**Daily budget caveat.** On serverless, each cold instance has its own cache. Sustained traffic across many instances could approach 225 reports per day. A shared cache would remove this risk; not implemented.

## Error handling

| Situation | Result |
|---|---|
| No campaigns, flows or events | `no_activity` (null value, explicit reason), never 0 |
| HTTP 401 / 403 | `invalid` source status (`KLAVIYO_AUTHENTICATION` / `KLAVIYO_PERMISSION`) |
| 429 beyond the wait bound, 5xx, timeout | `unavailable` / `error` status; other datasets still render |
| Profiles truncated | `partial` + `KLAVIYO_PROFILES_TRUNCATED` |
| Malformed configuration | source `not_configured` (existing `safeLoad` behaviour) |

## Metrics (23), live-validated 2026-09-28 through the real runtime

- **Value present, source current (14):** email overview, recipients, delivery/open/click/click-to-open/bounce/unsubscribe rates, spam complaints, attributed revenue, flow performance, engagement trend, email funnel, `quality.klaviyo_no_activity`.
- **`no_activity` (7), genuine:** campaign performance and the 6 SMS metrics. The account has 0 campaigns and no SMS activity.
- **`not_configured` (2):** `customers.age_mix`, `customers.sex_mix`. They need `KLAVIYO_AGE_BAND_PROPERTY` + `KLAVIYO_GENDER_PROPERTY` (the account's profile property names) and `profiles:read`.

The catalog still labels Klaviyo metrics `DATA_PENDING`. Promoting them is a governance decision (a new DEC entry), not a code change.

Re-run with `KLAVIYO_PRIVATE_API_KEY` and `KLAVIYO_API_REVISION` set in the environment: `pnpm parity:live tests/live/klaviyo.live.ts`. It is read-only and prints counts and structure only.
