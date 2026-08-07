# B4.4B Google Workbook Configuration Contract

Status: Verified and fixed for subsequent B4.5 implementation.

## Allowlisted identities

| Environment | Expected title | Fixed workbook ID | Permitted use |
|---|---|---|---|
| TEST | `ZACAO Dashboard V1 — TEST` | `1h1SmzQaSX_sBAHTdYkh8wQJFyYS66Jg5_q-MFNShtkg` | Local, preview, staging, fixtures, and controlled technical verification only |
| PRODUCTION | `ZACAO Dashboard V1 — PRODUCTION` | `1wj7RNZ0VNhaYDyWTU_MkJNYLdMPHe17u6ZYsmP-HwbM` | Genuine validated production data only |

Both IDs identify native Google Sheets, are distinct, and use spreadsheet timezone `America/New_York`.

## Allowlisted tabs

The only workbook tabs covered by this contract are, in order:

1. `README`
2. `Mappings`
3. `Inventory`
4. `Inventory_Lots`
5. `Depletions`
6. `Forecast`
7. `Production`
8. `SKU_Costs`
9. `Finance_Actuals`
10. `Cash`
11. `Marketing_Spend`
12. `Social_Metrics`
13. `Partner_Performance`
14. `Growth_Pipeline`
15. `Rules_Targets`

Column names and order remain governed by `B4_3_WORKBOOK_DESIGN.md`.

## Runtime invariants

- Runtime access is read-only.
- Workbook selection uses the exact allowlisted ID for the active environment, never a title search, folder order, “latest” file, or Drive discovery heuristic.
- TEST and PRODUCTION identifiers are separate required configuration values.
- Production configuration requires the production ID and must fail closed when it is absent or does not match the allowlist.
- Production never falls back to TEST, including on missing configuration, permission failure, invalid schema, invalid rows, provider outage, or an empty production workbook.
- The adapter verifies the expected workbook title/environment marker and approved tabs before accepting records.
- The adapter reads populated records dynamically, ignores empty rows, validates all populated rows, and does not hardcode a physical ending row.
- Physical row capacity is not data completeness. Completeness is determined only by the approved schema and metric/source readiness rules.
- Unknown tabs or columns follow the approved compatibility policy; required tabs or columns cannot be silently substituted.

## B4.5 credential prerequisites

Live runtime verification still requires a Google service account supplied through approved server-side secret management, with the relevant fixed files shared to it as Viewer. Required secret values include the Google project identifier, service-account email, and private key. B4.5 must use least-privilege read-only Google Sheets and Drive access and must never commit or log credentials.
