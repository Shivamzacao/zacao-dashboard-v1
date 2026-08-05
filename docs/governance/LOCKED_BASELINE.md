# ZACAO Dashboard V1 — Locked Planning Baseline

Baseline: `planning-baseline-v1.0`  
Status: Locked for implementation planning and phased execution  

## Authority order

1. ZACAO’s latest explicit instruction for the active phase.
2. Locked Technical Architecture and Sequential Implementation Plan.
3. Locked Dashboard V1 Deliverable Plan.
4. Locked Google Sheets Operating Model.
5. Research audits.
6. Approved ZACAO Executive Intelligence demo.
7. Official documentation applicable to pinned versions.
8. Any pre-existing code or earlier plan as non-authoritative history.

## Locked artifacts and SHA-256

| Artifact | SHA-256 |
|---|---|
| `docs/locked/ZACAO_Dashboard_V1_Deliverable_Plan.docx` | `bca3188cdf13e47997ddb61366ea2a2d2b7e242a9dcf3d5c8a7b07d4a1319719` |
| `docs/locked/ZACAO_Dashboard_V1_Technical_Architecture_and_Implementation_Plan.docx` | `b2f163aa519ff4bdbb783baf1e42c284908cfd1c4495fd60455dcc95ebe7f952` |
| `docs/locked/ZACAO_Dashboard_V1_Technical_Architecture_and_Implementation_Plan.md` | `9a436ffc325fb30ff55e488cb8f178ec233de289cea89a74d239124a4e4d581d` |
| `docs/locked/GOOGLE_SHEETS_OPERATING_MODEL.md` | `dcdc4e34854b6228889cdca8b721d9594f832b163a751318138f5b8222e5ba1b` |

## Locked decisions

- Three completely sequential phases: Backend, Frontend, then Integration/UAT/Release.
- Each subphase is independently tested and gated.
- No phase begins before the prior phase gate and explicit authorization.
- No application authentication in active V1.
- No primary database in active V1.
- Source integrations are read-only.
- Shopify is the company-sales authority; Klaviyo revenue is attributed revenue.
- Klaviyo is Future-Ready Core and must handle both empty and populated accounts without redesign.
- Test and production Google workbooks are separate.
- Production never reads mock/test workbooks or accepts mock/test rows as business data.
- Conditional modules remain not ready until genuine source data and all activation gates pass.
- The approved demo is the visual contract.
- Existing abandoned implementation code is not approved for reuse until explicitly audited.

## Change rule

A future change is allowed only after discussion and a versioned update. Coding agents must not reinterpret or silently amend this baseline.
