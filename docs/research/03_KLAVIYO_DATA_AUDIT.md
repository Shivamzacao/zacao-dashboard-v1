# ZACAO Dashboard V1 — Klaviyo Data Audit

Status: Read-only source audit completed  
Audit date: 2026-08-05  
Implementation status: No application code or technical architecture is authorized by this document

## 1. Audit conclusion

Klaviyo's API can technically provide the Marketing Intelligence metrics requested for V1, but the connected ZACAO account is not currently populated with usable marketing-performance data.

The live account audit found:

- The expected Klaviyo email, SMS, onsite, and Shopify ecommerce metric definitions exist.
- The account contains no event records.
- Every audited rolling-12-month metric aggregate returned zero.
- The account contains no email campaigns and no SMS campaigns.
- The campaign performance report is empty.
- Six live flows exist, but all were created on 2026-08-05 and the flow performance report is empty.
- The account contains one profile, five lists, and no segments.
- The account timezone is `Europe/Madrid`, while the approved dashboard timezone is `America/New_York`.

Therefore:

- **API capability:** Available.
- **Current production data:** Missing or empty.
- **Historical email/SMS analytics:** Missing in this account.
- **Shopify-to-Klaviyo ecommerce event history:** Missing despite the presence of Shopify metric definitions.
- **Marketing Intelligence with populated Klaviyo charts:** Not currently deliverable reliably.
- **Data-source status and empty-state reporting:** Deliverable.

The next operational step is to verify that this is the correct Klaviyo account and inspect the Shopify integration's sync status inside Klaviyo. Klaviyo states that a new Shopify integration first syncs 90 days and then proceeds to complete historical data, after which new data syncs in real time. The audited account has not produced that expected result: [Klaviyo Shopify data reference](https://help.klaviyo.com/hc/en-us/articles/115005080447).

## 2. Audit method and safety boundary

The audit used only read-only connector operations:

- Account metadata.
- Metric definitions and integration metadata.
- Metric aggregate queries.
- Campaign and flow inventory.
- Campaign and flow performance reports.
- A PII-free event existence check.
- A PII-free profile count/sample containing only IDs and timestamps.
- List and segment inventory.
- Official Klaviyo API and Help Center documentation.

No profile, event, campaign, flow, list, segment, subscription status, catalog item, template, or account setting was created, updated, or deleted.

The connected toolset exposes write operations, but this audit did not use them. The production dashboard must use a separately governed read-only private API key with only the endpoint scopes required by the final metric register.

## 3. Verified account facts

| Item | Verified result | Implication |
|---|---|---|
| Account ID | `RcDBg3` | Connector reaches a specific live Klaviyo account. |
| Account type | Production (`test_account=false`) | Empty results are not explained by a Klaviyo test-account flag. |
| Preferred currency | USD | Matches the dashboard currency. |
| Locale | `en-US` | Compatible with the internal dashboard. |
| Account timezone | `Europe/Madrid` | Must be normalized to `America/New_York`; source/send-date semantics must remain clear. |
| Profiles | 1 | Material mismatch with Shopify's 462 customer records. |
| Events | 0 | No email, SMS, onsite, or Shopify ecommerce activity is currently queryable. |
| Email campaigns | 0 | Campaign analytics cannot be populated. |
| SMS campaigns | 0 | SMS campaign analytics cannot be populated. |
| Live flows | 6 | All created on 2026-08-05; no performance yet. |
| Lists | 5 | Structural objects exist, but list membership/performance is effectively empty. |
| Segments | 0 | Segment analytics are unavailable. |

### Current flows

| Flow | Trigger type | Created | Current reporting result |
|---|---|---|---|
| Welcome series | Added to List | 2026-08-05 | Empty |
| The Grove - Applied | Added to List | 2026-08-05 | Empty |
| Post purchase - Follow Up | Metric | 2026-08-05 | Empty |
| Abandoned cart | Metric | 2026-08-05 | Empty |
| The Grove - Acceptance | Added to List | 2026-08-05 | Empty |
| Post purchase - Customer Thank You | Metric | 2026-08-05 | Empty |

### Current lists

- Ambassador - The Grove (Applied)
- Ambassador - The Grove (Accepted)
- Preview List
- Text Messaging List
- Email List

List existence does not prove subscriber or performance data. The account has only one profile and no events.

## 4. Verified metric registry

### Email and SMS metrics

| Metric | Metric ID | Integration | Current data status |
|---|---|---|---|
| Received Email | `XKVkHG` | Klaviyo | Zero events |
| Opened Email | `Ub5zGJ` | Klaviyo | Zero events |
| Clicked Email | `RhS7DM` | Klaviyo | Zero events |
| Bounced Email | `VkMVgn` | Klaviyo | Zero events |
| Dropped Email | `X9dNLR` | Klaviyo | Zero events |
| Marked Email as Spam | `Tyn3KT` | Klaviyo | Zero events |
| Clicked email to unsubscribe | `RKWafq` | Klaviyo | Zero events; this is not equivalent to a completed unsubscribe. |
| Sent Text Message | `Srzt4U` | Klaviyo | Zero events |
| Received Text Message | `XTumVK` | Klaviyo | Zero events |
| Opened Text | `RNyqsh` | Klaviyo | Zero events |
| Clicked Text Message | `Vu3rND` | Klaviyo | Zero events |
| Failed to Deliver Text Message | `Xgtjj8` | Klaviyo | Zero events |
| Unsubscribed from Text Messaging Marketing | `RgaCb4` | Klaviyo | Zero events |
| Subscribed to Text Messaging Marketing | `WDsgGv` | Klaviyo | Zero events |

Unsubscribes, delivery, bounce, spam, and other campaign/flow statistics should normally come from the Reporting API rather than attempting to reconstruct them only from raw event names.

### Shopify and onsite metrics defined in Klaviyo

| Metric | Metric ID | Integration | Current data status |
|---|---|---|---|
| Checkout Started | `QQ7zHW` | Shopify | Zero events |
| Placed Order | `Rt8Ckz` | Shopify | Zero events/value |
| Ordered Product | `UvAB6i` | Shopify | Zero events/value |
| Fulfilled Order | `V3Ypmx` | Shopify | Zero events/value |
| Refunded Order | `WQqgS2` | Shopify | Zero events/value |
| Cancelled Order | `TfyvR4` | Shopify | Zero events/value |
| Viewed Product | `T6hZag` | API/onsite | Zero events |
| Active on Site | `VvJVhn` | API/onsite | Zero events |

The metric definitions were created in June 2026, but definitions alone do not prove that the Shopify integration completed or that onsite tracking is working.

## 5. Exact API resource map

| Dashboard need | Klaviyo endpoint/tool | Direct fields/statistics | Correct time semantics | Current result |
|---|---|---|---|---|
| Account timezone/currency | `GET /api/accounts` | `timezone`, `preferred_currency`, `locale`, `test_account` | Current configuration | Available |
| Metric registry | `GET /api/metrics` | `id`, `name`, `integration`, `created`, `updated` | Current definitions | Available |
| Email campaign inventory | `GET /api/campaigns?filter=equals(messages.channel,'email')` | Campaign ID/name/status, send time, campaign messages | Campaign metadata | Empty |
| SMS campaign inventory | `GET /api/campaigns?filter=equals(messages.channel,'sms')` | Same campaign fields | Campaign metadata | Empty |
| Campaign performance | `POST /api/campaign-values-reports` | Recipients, delivery, opens, clicks, bounces, unsubscribes, spam, conversions; value statistics | Send-date semantics matching Klaviyo UI | Empty |
| Flow inventory | `GET /api/flows` | Flow ID/name/status/trigger/created/updated | Flow metadata | Six new flows |
| Flow performance | `POST /api/flow-values-reports` | Same core performance and conversion statistics, grouped by flow/message/channel | Send-date semantics matching Klaviyo UI | Empty |
| Email/SMS/ecommerce time series | `POST /api/metric-aggregates` | `count`, `unique`, `sum_value`; interval hour/day/week/month | Event-time semantics | Valid API response; all zero |
| Event existence/detail | `GET /api/events` | Event ID/time/properties when needed | Event time | Empty |
| Profiles | `GET /api/profiles` | Profile ID/timestamps; PII fields exist but are not needed for Core aggregate analytics | Current profile collection | One profile |
| Lists | `GET /api/lists` | ID/name/opt-in process/timestamps | Current collection | Five lists |
| Segments | `GET /api/segments` | ID/name/active/processing/timestamps | Current collection | Empty |

Klaviyo recommends its Reporting API when dashboard results must match the Klaviyo UI because reports use campaign/flow send dates. Metric aggregates use event time and can legitimately differ: [Klaviyo Reporting API overview](https://developers.klaviyo.com/en/reference/reporting_api_overview).

## 6. Metric feasibility matrix

| Dashboard metric/feature | API feasibility | Current-data status | Calculation/source policy | V1 decision today |
|---|---|---|---|---|
| Email recipients/sends | Available via campaign/flow reports | Missing | Use `recipients` or approved send statistic from Reporting API | Cannot populate |
| Email delivery/delivery rate | Available via reports | Missing | Use `delivered`, `delivery_rate` | Cannot populate |
| Email opens/open rate | Available via reports | Missing | Use `opens_unique` and `open_rate`; identify privacy effects if required | Cannot populate |
| Email clicks/click rate | Available via reports | Missing | Use `clicks_unique` and `click_rate` | Cannot populate |
| Click-to-open rate | Available via reports | Missing | Use `click_to_open_rate` | Cannot populate |
| Bounces/bounce rate | Available via reports | Missing | Use `bounced`, `bounce_rate` | Cannot populate |
| Unsubscribes/rate | Available via reports | Missing | Use `unsubscribe_uniques`, `unsubscribe_rate` | Cannot populate |
| Spam complaints/rate | Available via reports | Missing | Use report statistics | Cannot populate |
| Campaign performance table | Available via campaign report grouped by campaign/message/channel | Missing | Report API, send-date basis | Cannot populate |
| Flow performance table | Available via flow report grouped by flow/message/channel | Missing | Report API, send-date basis | Cannot populate |
| Campaign conversions/revenue | Available using a conversion metric | Missing | `Placed Order` metric ID `Rt8Ckz`; `conversions`, `conversion_rate`, `conversion_value`, AOV, revenue per recipient | Cannot populate |
| Flow conversions/revenue | Available using same conversion metric | Missing | Reporting API | Cannot populate |
| Email/SMS engagement trend | Available via metric aggregates | Missing | Event-time counts/uniques by approved interval | Cannot populate |
| SMS sent/delivered/clicked/failed/unsubscribed | Available via reports/metrics | Missing | Prefer Reporting API for campaign/flow performance | Cannot populate |
| Checkout/order/product/fulfilled/refund/cancel trend | Available via Shopify integration metrics | Missing | Metric aggregates on event time | Cannot populate; Shopify should remain the revenue source of truth. |
| Viewed Product/Active on Site | Available if onsite tracking works | Missing | Event aggregates | Cannot populate |
| Klaviyo-attributed revenue | Available via report conversion value | Missing | Must be labeled `Klaviyo-attributed revenue`; never total company revenue | Cannot populate |
| Email revenue share | Derived | Missing | Klaviyo-attributed conversion value divided by approved Shopify revenue for equivalent periods | Cannot populate and requires aligned time semantics. |
| List/profile growth | Technically available | Effectively missing | Profile/list/segment series with consent-aware definitions | Not useful with one profile and no events. |
| Ambassador performance | Not supplied by current Klaviyo data | Missing | Lists/flows alone do not provide revenue/order/commission performance | Requires dedicated tracker/platform and approved identity mapping. |

## 7. Attribution and reconciliation limitations

Klaviyo-attributed revenue and Shopify revenue are not interchangeable.

Klaviyo documents its Shopify `Placed Order` revenue as:

```text
(subtotal + shipping) - discounts
```

Klaviyo also notes that its revenue does not automatically subtract canceled and refunded orders the way Shopify reporting does. Consequently:

- Shopify remains the source of truth for company sales KPIs.
- Klaviyo values must be labeled `Klaviyo-attributed revenue`.
- Do not replace Shopify revenue with Klaviyo `Placed Order` value.
- Do not expect exact equality between Shopify and Klaviyo revenue.
- A reconciliation report must compare counts and values with documented semantic differences, not force the totals to match.
- The attribution window/model configured in Klaviyo must be recorded before enabling attributed-revenue KPIs.

Official reference: [Klaviyo Shopify data reference](https://help.klaviyo.com/hc/en-us/articles/115005080447).

## 8. Timezone and time-semantics findings

The Klaviyo account is configured for `Europe/Madrid`; the dashboard is confirmed as `America/New_York`.

For V1:

- Metric aggregate queries can explicitly request `America/New_York` for grouping.
- The aggregate response dates remain UTC timestamps representing New York period boundaries.
- Campaign and flow reports use send-date semantics and should be presented as Klaviyo report results.
- Event aggregates use event-time semantics and must not be used as a silent replacement for campaign/flow report totals.
- Cross-source calculations must align the reporting interval and clearly identify whether they use send date or conversion/event date.

Klaviyo metric-aggregate requests accept intervals `hour`, `day`, `week`, and `month`, but each request can span no more than one year. Official endpoint details and current rate limit are documented at [Query Metric Aggregates](https://developers.klaviyo.com/en/reference/query_metric_aggregates).

## 9. History, retention, and data-readiness findings

The API can query metric aggregates over the requested rolling 12 months, but a technically valid time range returned zeros for every audited metric.

The absence of data is not an API retention problem based on current evidence:

- The account has zero event records even in an unrestricted recent-event existence check.
- Shopify, email, SMS, and onsite metric definitions exist but are unused.
- There are no campaigns.
- The only flows were created today.
- The account has only one profile compared with 462 Shopify customer records.

This pattern strongly indicates one of the following, which must be verified in the Klaviyo UI rather than guessed:

1. This is not the Klaviyo account previously used for ZACAO marketing.
2. The Shopify integration setup has not been completed.
3. The historical sync has not started or has failed.
4. The integration was connected to a different Shopify store/account.
5. Email/SMS marketing was performed in another Klaviyo account or another platform.

Klaviyo states that its Shopify integration should first sync the last 90 days and then complete historical data, potentially taking minutes to several days. A green progress/status indicator should appear after setup: [Getting started with Shopify in Klaviyo](https://help.klaviyo.com/hc/en-us/articles/115005080407).

## 10. Alternative paths for missing data

| Missing data | Preferred remediation | Alternative |
|---|---|---|
| Shopify customer/order events in Klaviyo | Verify/fix the native Shopify integration and allow the historical sync to complete | Continue using Shopify directly for ecommerce analytics; do not duplicate imports unless required for Klaviyo operations. |
| Historical email/SMS campaign performance | Connect the correct historical Klaviyo account, if one exists | Export reports from the previous email/SMS platform into an approved read-only file. |
| Historical Shopify purchase events when native sync cannot recover | Complete/retry native historical sync | Controlled historical event import is technically possible, but it writes to Klaviyo and is outside the dashboard's read-only authorization. It requires separate approval. |
| Onsite events | Enable and verify Klaviyo onsite tracking/app embed and consent behavior | Use Shopify session/funnel analytics for Core V1. |
| Campaign/flow dashboard charts before events exist | Wait for real sends and conversions | Show an honest `No performance data yet`/source-readiness state; do not use mock values. |
| Ambassador/affiliate outcomes | Connect the actual operational tracker/platform | Maintain an approved structured Sheet; Klaviyo lists alone are insufficient. |

Klaviyo supports manual historical event import, but doing so modifies Klaviyo and is not authorized by the current read-only dashboard mandate. Any such backfill is a separate business-system remediation project: [Klaviyo historical event import](https://help.klaviyo.com/hc/en-us/articles/115005081247).

## 11. Recommended Klaviyo V1 boundary

### What can be implemented after data exists

- Campaign and flow performance tables.
- Email delivery, open, click, bounce, unsubscribe, spam, and conversion KPIs.
- SMS delivery, click, failure, unsubscribe, and conversion KPIs.
- Campaign/flow-attributed revenue with explicit labeling.
- Event-time engagement trends where a Reporting API statistic cannot provide the required grain.
- Source freshness, account timezone, event availability, campaign/flow availability, and reconciliation status.

### What can be shown today

- Klaviyo connection status.
- Account timezone/currency.
- Metric registry readiness.
- Empty campaign and SMS states.
- Six flows with `No performance data yet` status.
- Data-quality warning: one profile, zero events, and no campaign history.

### What cannot be shown as production analytics today

- Any non-zero email or SMS KPI.
- Campaign or flow rankings.
- Klaviyo-attributed revenue or revenue share.
- Historical engagement trends.
- Profile/list growth conclusions.
- Ambassador performance.

## 12. Required actions before Klaviyo-backed V1 is approved

1. Confirm that account `RcDBg3` is the correct ZACAO Klaviyo account.
2. Open Klaviyo's Shopify integration page and confirm the connected Shopify domain is `e93644-3.myshopify.com`.
3. Confirm the integration shows successful setup and whether the historical sync is pending, running, failed, or complete.
4. Confirm whether ZACAO previously sent campaigns from another Klaviyo account or another email/SMS platform.
5. Verify the Shopify app embed/onsite tracking and consent configuration if Viewed Product/Active on Site are required.
6. Allow a successful historical sync to complete, then rerun the profile/event and reconciliation audit.
7. Record the Klaviyo attribution settings before enabling attributed-revenue metrics.
8. Issue a read-only production API key with only required scopes; do not provide write credentials to the dashboard.
9. Keep Marketing Intelligence in a truthful empty/not-ready state until reports contain real data.

No API token needs to be pasted into chat. The current connector was sufficient to prove the account's present data state.

## 13. Preliminary database implication—not a final decision

Klaviyo can be queried directly for account metadata, campaign/flow reports, and metric time series. This means a database is not needed merely to authenticate users or to make the API callable.

However, direct report calls are rate-limited and campaign/flow report semantics differ from event aggregates. A production dashboard will require some server-side caching or scheduled snapshot mechanism even if no full analytical database is used. Whether that cache must be persistent depends on the workbook audit, the required failure behavior, and whether historical snapshots must survive edits or API outages.

The final database/storage decision remains **Requires verification**. No database is approved or being created.

## 14. Audit status

| Audit area | Status |
|---|---|
| Account metadata/timezone/currency | Completed |
| Metric registry and IDs | Completed |
| Rolling-12-month metric aggregate test | Completed — valid but all zero |
| Campaign inventory and report | Completed — empty |
| Flow inventory and report | Completed — six new flows, empty report |
| Profile/event/list/segment readiness | Completed — one profile, zero events, five lists, zero segments |
| Attribution setting confirmation | Requires verification in Klaviyo UI |
| Shopify integration sync status | Requires verification in Klaviyo UI |
| Correct historical marketing account/source | Requires user confirmation |

The next sequential audit is the supplied Budget and S&OP sources in Google Drive, followed by a search for any other V1 source files.
