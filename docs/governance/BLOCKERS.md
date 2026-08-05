# Blocker Register

Status: Initialized for the clean implementation repository.

| ID | Missing fact or approval | Affected scope | Evidence checked | Required decision | Status |
|---|---|---|---|---|---|
| BLK-001 | Production platform protection choice | Production access | Deliverable and architecture | Choose Vercel deployment protection, approved network restriction, or explicitly accept public-URL risk | Open |
| BLK-002 | Shopify revenue/order/AOV/refund policy approval | Core revenue metrics | Deliverable decision list | Approve the documented policy before metric certification | Open |
| BLK-003 | Detailed Shopify history path | Detailed customer/order analytics | Shopify audit | Aggregate-only V1, `read_all_orders`, controlled export, or prioritized combination | Open |
| BLK-004 | Conditional workbook production data | Conditional modules | Budget/S&OP/Drive audit | Populate genuine data and pass per-module activation gates | Open by design |

Block only dependent work. Never invent a default to close a blocker.
