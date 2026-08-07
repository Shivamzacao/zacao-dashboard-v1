# ZACAO Dashboard V1 — Google Sheets Operating Model

Status: Locked baseline decision  
Applies to: All Sheet- or workbook-backed Core, Future-Ready Core, and Conditional V1 modules  
Authority: Supplements the locked V1 Deliverable Plan and Technical Architecture Plan without changing their scope or architecture

## 1. Locked decision

ZACAO will use governed Google Sheets or approved workbook files as read-only dashboard source systems where Shopify or Klaviyo cannot provide the required business data.

Development and production data must be separated:

1. A **test workbook** contains synthetic data and is used only by local development, automated tests, preview, and staging.
2. A **production workbook** uses the same approved schema but starts without mock business records. ZACAO’s internal team populates it with genuine data.
3. Production never reads the test workbook.
4. The dashboard never writes, corrects, appends, deletes, renames, or reformats source Sheets.
5. A Conditional feature becomes active only after its production source passes every activation gate.

## 2. Environment separation

| Environment | Workbook policy | Permitted data |
|---|---|---|
| Local | Synthetic fixture file or test workbook | Synthetic data only by default. |
| Preview | Contract fixtures or test workbook | Synthetic data only. |
| Staging | Test workbook; approved read-only production smoke check only when separately authorized | Synthetic data and controlled verification. |
| Production | Fixed, allowlisted production workbook IDs and tabs | Genuine validated business data only. |

Workbook IDs and tab/range identifiers are environment variables. The application must not locate a source by filename, “latest file,” Drive search order, or folder position.

### Dynamic row-capacity policy

- Physical Sheet row count is not a V1 business requirement, completeness signal, or runtime boundary.
- Input tabs may retain their current capacity; ZACAO may add rows when needed.
- The runtime reads populated records dynamically and ignores empty rows.
- Neither row 1,000 nor row 10,000 may be hardcoded as an ingestion boundary.
- Newly populated rows must match the approved schema, types, controlled values, and validation rules.
- When extending a tab, the internal team must preserve or inherit applicable dropdown validation and display formats from a schema-controlled row.
- Increasing capacity requires no application architecture change.

## 3. Test workbook rules

The test workbook exists to prove technical behavior. It must:

- Be clearly named as TEST or SYNTHETIC.
- Contain no copied customer, investor, employee, ambassador, or partner PII.
- Use invented identifiers, names, amounts, dates, SKUs where appropriate, and source references.
- Cover current, empty, partial, stale, invalid, unavailable, duplicate, and conflicting scenarios.
- Include boundary cases such as zero denominators, negative adjustments, long labels, missing optional values, and DST/date transitions.
- Match the production schema exactly for all contract-controlled columns.
- Never be used to certify real business results.

Mock data proves schema, calculations, charts, filters, and states. It does not prove production completeness, maintenance discipline, business definitions, reconciliation, or source accuracy.

## 4. Production workbook rules

The production workbook must:

- Use the same approved tab names and required columns as the test workbook.
- Start with headers, instructions, validation rules, and protected formulas but no mock production rows.
- Be populated and maintained by ZACAO’s internal team.
- Preserve stable file IDs. Replacing a file requires a controlled source change.
- Use append-only dated records whenever historical reporting is required.
- Mark drafts, examples, and rejected records explicitly and keep them out of active production calculations.
- Expose `data_as_of`, `updated_at`, and source references where applicable.
- Remain readable by the dashboard service account as Viewer only.

Because active V1 has no primary database, the source workbook is responsible for preserving manual-source history. Overwriting a historical inventory snapshot, cost, forecast, or cash position can permanently remove that history from the dashboard.

## 5. Required tabular standards

- One header row and one record per row.
- No merged cells inside an input table.
- No blank header names or duplicate columns.
- Stable `record_id`; row numbers are not identifiers.
- ISO dates as `YYYY-MM-DD`.
- Timezone-aware ISO timestamps where time matters.
- USD amounts as numeric values, not formatted text.
- Controlled values for SKU, product, warehouse, channel, status, stage, and reason.
- Formula columns protected from casual editing.
- Unknown columns may be ignored only when the contract explicitly permits extensions.
- Required columns cannot be renamed or deleted without a versioned contract change.
- Invalid rows are excluded and reported; valid rows continue where the metric definition allows partial processing.

Common control columns, where applicable:

```text
record_id
source_status
data_as_of
created_at
updated_at
updated_by
source_reference
notes
```

Production code must also reject records marked `test`, `mock`, `synthetic`, `example`, or an equivalent excluded status.

## 6. Workbook creation process during implementation

For each Sheet-backed feature:

1. Confirm the metric definition and source requirements from the locked Deliverable Plan.
2. Define the workbook, tab, column, type, validation, key, history, and freshness contract.
3. Create a synthetic test workbook or local `.xlsx` fixture.
4. Create an empty production template with the same schema.
5. Add controlled values, validation guidance, protected formulas, and maintenance instructions.
6. Validate the test workbook against the backend schema.
7. Test valid, empty, partial, duplicate, stale, malformed, and permission-loss scenarios.
8. ZACAO reviews and creates/uploads the production workbook in its Drive.
9. Share the production workbook with the dashboard service account as Viewer.
10. Configure the production file ID and allowlisted tabs through server-side secrets/environment configuration.
11. Validate genuine production records.
12. Activate only the affected Conditional module after its gate passes.

Codex may generate local workbook templates, schemas, synthetic fixtures, and instructions during the authorized implementation subphase. Creating or modifying native files in ZACAO’s Google Drive requires separate explicit authorization. Runtime integration remains read-only even if a temporary setup permission is later approved.

## 7. Activation gate

A Sheet-backed module remains `Data source not ready` until all applicable evidence exists:

- Approved fixed file ID and tab/range.
- Required schema and data types pass.
- Required products, SKUs, locations, periods, and records are present.
- Duplicate, example, formula-error, and conflict rules pass.
- Required historical lookback exists or the limitation is explicitly accepted.
- Cross-source SKU, channel, location, and date mappings reconcile.
- Metric formula and inclusion/exclusion rules are approved.
- Freshness behavior and `data_as_of` are visible.
- Production contains genuine data rather than mock/test rows.
- The dashboard state before and after activation is tested.

Successful test-workbook testing completes the technical gate only. It does not activate production.

## 8. Failure behavior

| Condition | Required behavior |
|---|---|
| Tab or required column renamed | Mark source Invalid; do not calculate affected metrics. |
| Number entered as text | Reject the row/cell and report its location without exposing sensitive content. |
| Duplicate stable key | Reject or quarantine duplicates according to the metric contract. |
| Partial edit | Validate the complete response before replacing a valid cached result. |
| Permission removed | Show source Unavailable; use only an allowed stale cached result with disclosure. |
| File replaced | Remain Not configured until the new file ID is explicitly approved. |
| Conflicting sources | Show conflict; never choose a value automatically. |
| Unknown freshness | Show file modified time and source warning; do not infer recency. |
| Mock/test row in production | Exclude it and raise a data-quality warning. |

## 9. Locked source-table families

The Deliverable Plan remains authoritative for exact columns. Candidate production input families include:

- Channel mapping.
- Inventory snapshots.
- Inventory lots.
- Sales forecasts.
- Production orders and schedules.
- Additional depletions.
- COGS by SKU.
- Finance actuals and cash position.
- Marketing spend and social metrics.
- Affiliate and ambassador performance.
- Growth pipelines.
- Metric targets.

No table is created merely because it appears in this list. It is created during the relevant approved subphase only when the corresponding V1 feature and source contract require it.

## 10. Change control

Changes to required columns, types, keys, history policy, or tab/file identity are contract changes. They require:

1. Impact review against metrics, backend validation, frontend states, tests, and existing production data.
2. Version update in the source contract and traceability matrix.
3. Updated test and production templates.
4. Successful regression and migration/compatibility checks.
5. ZACAO approval before production configuration changes.

This operating model is locked with planning baseline `v1.1`. Version 1.1 adds the approved dynamic row-capacity policy without changing schema, metrics, scope, architecture, environment separation, or read-only runtime behavior. Future changes are discussed and versioned; they are not silently inferred during coding.
