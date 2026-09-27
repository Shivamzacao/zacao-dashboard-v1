# Deployment (Vercel)

| Item | Value (repo / GitHub evidence) |
|---|---|
| Vercel project | `zacao-dashboard-v1` (team `zacao`), Git-connected to `Shivamzacao/zacao-dashboard-v1` |
| Production branch | `main`. Every merge to `main` is reported by `vercel[bot]` as a GitHub deployment with environment `Production`; PR branches deploy as `Preview` |
| Production URL | `https://zacao-dashboard-v1.vercel.app` |
| Framework / build | Next.js 16.3, `next build` (package.json `build`), Node 24 (`engines`), pnpm 11.9 |
| Config files | none (`vercel.json` absent; Vercel defaults) |
| Runtime | Route handlers `runtime = "nodejs"`, `dynamic = "force-dynamic"` |

## Flow

1. Push a branch → Vercel Preview deployment on the PR.
2. Merge to `main` → Vercel Production deployment. No separate workflow is needed.

## Environment variables

All are server-only; none uses `NEXT_PUBLIC_`. Names are taken from `process.env` reads in `src/` and `app/`.

| Variable | Required | Environments | Purpose |
|---|---|---|---|
| `ZACAO_DATA_MODE` | Yes (`live`) | Production (Preview: `live` or `fixture`) | Live vs synthetic rendering |
| `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ADMIN_API_VERSION` | Yes | Production (+ Preview for live previews) | Shopify Admin/ShopifyQL, read-only client-credentials |
| `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_API_REVISION` | Yes | Production (+ Preview) | Klaviyo |
| `KLAVIYO_CONVERSION_METRIC_ID` | Optional (must equal the frozen `placed_order` id if set) | same | Conversion metric |
| `KLAVIYO_AGE_BAND_PROPERTY`, `KLAVIYO_GENDER_PROPERTY` | Optional (set both or neither) | same | Demographics |
| `GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Yes while Sheets remain a runtime source | same | Google Sheets/Drive service account |
| `GOOGLE_SHEETS_DASHBOARD_WORKBOOK_ID`, `GOOGLE_SHEETS_EXECUTIVE_WORKBOOK_ID` | Optional (allowlisted defaults) | same | Workbook ids |
| `GOOGLE_SHEETS_REQUEST_TIMEOUT_MS`, `GOOGLE_SHEETS_ROW_CHUNK_SIZE` | Optional | same | Sheets tuning |
| `ZACAO_SOURCE_MODE` | Optional (default `legacy`) | any | Sheets → API migration mode |
| `PARITY_REPORT_DIR` | Local only | — | `pnpm parity:live` output |
| `REPORTING_TIMEZONE`, `REPORTING_CURRENCY` | Not used at runtime (unused config module) | — | — |

Preview deployments get whatever is configured for the Preview environment. Without provider credentials, preview sources report `not_configured`.

## Access control: action required

The production URL is public and the application has no authentication (DEC-003; BLK-001 open). Its pages and `/api/v1/*` serve revenue, margin, cash, investor-pipeline and grant data, and CSV exports, to anyone with the URL. Enable Vercel Deployment Protection for production, or another access control, before relying on it. On the Hobby plan, standard protection does not cover the production domain.
