# Blocker Register

Status: Reviewed and consolidated during Phase 1 Subphase B0.

| ID | Missing fact or approval | Affected scope | Evidence checked | Required decision | Status |
|---|---|---|---|---|---|
| BLK-001 | Production platform protection choice | Production access | Deliverable and architecture | Choose Vercel deployment protection, approved network restriction, or explicitly accept public-URL risk | Open |
| BLK-002 | Shopify revenue/order/AOV/refund policy approval | Core revenue metrics | Deliverable decision list | Approve the documented policy before metric certification | Open |
| BLK-003 | Detailed Shopify history path | Detailed customer/order analytics | Shopify audit | Aggregate-only V1, `read_all_orders`, controlled export, or prioritized combination | Open |
| BLK-004 | Conditional workbook production data | Conditional modules | Budget/S&OP/Drive audit and Google Sheets operating model | Populate genuine data and pass per-module activation gates | Open by design |
| BLK-005 | B0 legacy disposition approval | B0 gate and authorization to consider B1 | Clean repository audit and ZACAO instruction to start B1 | Approved by ZACAO on 2026-08-06 | Resolved |
| BLK-006 | Locked Next.js 16.2.x line contains high-severity transitive advisories | B1 dependency-security gate | Exact 16.2.12 lockfile, `pnpm audit`, and registry metadata for 16.3.0 | Approve 16.3.x baseline amendment, explicit overrides, or documented risk acceptance | Blocking B1 gate |

## Non-blocking future input

Shopify, Klaviyo, and Google credentials are not required in B0 or B1. Request least-privilege read-only credentials only in the applicable authorized connector subphase and receive them through approved server-side secret management, never committed files or chat.

Block only dependent work. Never invent a default to close a blocker.
