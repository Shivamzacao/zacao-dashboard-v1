# Blocker Register

Status: Reviewed and consolidated during Phase 1 Subphase B0.

| ID | Missing fact or approval | Affected scope | Evidence checked | Required decision | Status |
|---|---|---|---|---|---|
| BLK-001 | Production platform protection choice | Production access | Deliverable and architecture | Choose Vercel deployment protection, approved network restriction, or explicitly accept public-URL risk | Open |
| BLK-002 | Shopify revenue/order/AOV/refund policy approval | Core revenue metrics | Deliverable decision list | Approve the documented policy before metric certification | Open |
| BLK-003 | Detailed Shopify history path | Detailed customer/order analytics | Shopify audit | Aggregate-only V1, `read_all_orders`, controlled export, or prioritized combination | Open |
| BLK-004 | Conditional workbook production data | Conditional modules | Budget/S&OP/Drive audit and Google Sheets operating model | Populate genuine data and pass per-module activation gates | Open by design |
| BLK-005 | B0 legacy disposition approval | B0 gate and authorization to consider B1 | Clean repository audit | Approve `LEGACY_DISPOSITION.md`; B1 still requires a separate explicit instruction | Requires approval |

## Non-blocking future input

Shopify, Klaviyo, and Google credentials are not required in B0. Request least-privilege read-only credentials only in the applicable authorized connector subphase and receive them through approved server-side secret management, never committed files or chat.

Block only dependent work. Never invent a default to close a blocker.
