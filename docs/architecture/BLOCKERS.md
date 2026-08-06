# Blocker Register

Status: Reviewed and consolidated during Phase 1 Subphase B0.

| ID | Missing fact or approval | Affected scope | Evidence checked | Required decision | Status |
|---|---|---|---|---|---|
| BLK-001 | Production platform protection choice | Production access | Deliverable and architecture | Choose Vercel deployment protection, approved network restriction, or explicitly accept public-URL risk | Open |
| BLK-002 | Shopify revenue/order/AOV/refund policy approval | Core revenue metrics | Deliverable decision list | Approve the documented policy before metric certification | Open |
| BLK-003 | Detailed Shopify history path | Detailed customer/order analytics | Shopify audit | Aggregate-only V1, `read_all_orders`, controlled export, or prioritized combination | Open |
| BLK-004 | Conditional workbook production data | Conditional modules | Budget/S&OP/Drive audit and Google Sheets operating model | Populate genuine data and pass per-module activation gates | Open by design |
| BLK-005 | B0 legacy disposition approval | B0 gate and authorization to consider B1 | Clean repository audit and ZACAO instruction to start B1 | Approved by ZACAO on 2026-08-06 | Resolved |
| BLK-006 | Locked Next.js 16.2.x line contained high-severity transitive advisories | B1 dependency-security gate | Updated to Next.js 16.3.0 under approved routine minor maintenance; focused checks and audit passed | No further decision required | Resolved |
| BLK-007 | Live Shopify production-credential verification | Backend Stage production gate | Shopify capabilities were verified in the V1 feasibility audit; B2 focused non-live verification passed | Supply an approved least-privilege read-only credential and run the live smoke verification before the Backend Stage gate | Deferred; non-blocking until Backend Stage gate |
| BLK-008 | Live Klaviyo production-credential verification | Backend Stage production gate | Klaviyo capabilities were verified in the V1 feasibility audit | Supply an approved least-privilege read-only credential and run the live smoke verification before the Backend Stage gate | Deferred; non-blocking until Backend Stage gate |

## Non-blocking future input

Shopify, Klaviyo, and Google credentials are not required in B0 or B1. Request least-privilege read-only credentials only in the applicable authorized connector subphase and receive them through approved server-side secret management, never committed files or chat.

Block only dependent work. Never invent a default to close a blocker.
