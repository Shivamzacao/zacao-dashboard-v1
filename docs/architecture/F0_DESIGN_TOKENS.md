# F0 Extracted Design Tokens

Status: Exact values extracted from the approved demo at `1280 × 720`; implementation waits for F1.

## Palette

| Token         | Value     |
| ------------- | --------- |
| `cream`       | `#f4ecdb` |
| `cream-soft`  | `#faf7ef` |
| `paper`       | `#ffffff` |
| `canvas`      | `#f7f7f3` |
| `forest`      | `#005d45` |
| `forest-dark` | `#173a30` |
| `forest-deep` | `#12342c` |
| `sidebar`     | `#0d3028` |
| `ink`         | `#1b2925` |
| `muted`       | `#6c7b75` |
| `line`        | `#e7e9e2` |
| `gold`        | `#c8a86b` |
| `terracotta`  | `#b5532f` |
| `positive`    | `#15835f` |
| `warning`     | `#bc7b24` |
| `danger`      | `#b34d3d` |

Chart series reuse forest/positive, gold/target, terracotta/warning, muted grid/axis, and `paper` card
backgrounds. F1/F2 may darken only failing text/status uses to the nearest approved brand color; it
must not introduce a new palette.

## Typography

- UI/body: `"Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif`.
- Display/numbers: `Georgia, "Times New Roman", serif`.
- Body base: `16px / 24px`.
- Page title: `34px / 51px`, weight `500`, letter-spacing `-0.85px`.
- KPI value: `28px / 28px`, weight `400`, serif, tabular figures required in production.
- Card title: `17px / 25.5px`, weight `500`, serif.
- Eyebrow: `9px / 13.5px`, weight `760`, uppercase, `1.44px` tracking.
- Card kicker: `8px / 12px`, weight `750`, uppercase, `1.04px` tracking.
- Demo metadata at 7–9 px is recorded for parity but must be raised enough to meet readability and
  contrast requirements.

## Geometry

| Element                    | Exact demo value                                                 |
| -------------------------- | ---------------------------------------------------------------- |
| Sidebar                    | `260px`, fixed, padding `24px 16px 18px`                         |
| Top bar                    | `70px`, sticky, padding `0 32px`, white at 93% with 18 px blur   |
| Content                    | max `1540px`, padding `35px 32px 58px`                           |
| Page-heading bottom margin | `24px`                                                           |
| KPI grid                   | 4 columns; `13px` gap; `13px` bottom margin                      |
| KPI card                   | minimum `147px`; padding `16px`; radius `13px`                   |
| Dashboard grid             | `1.6fr minmax(285px, .82fr)`; `13px` gap                         |
| Chart card                 | padding `18px`; radius `13px`; minimum height `390px` where used |
| Attention banner           | minimum `64px`; padding `12px 14px`; gap `14px`; radius `13px`   |
| Nav item                   | `228 × 38px`; padding `10px 12px`; gap `12px`; radius `9px`      |
| Date/export control        | `35px` high; radius `9px`                                        |
| Icon button                | `34 × 34px`; radius `9px`                                        |
| Pills/status               | radius `999px`                                                   |

## Border, shadow, and interaction

- Standard border: `1px solid #e7e9e2`.
- Card shadow: `0 1px 2px #12342c0a, 0 10px 32px #12342c0a`.
- Active navigation: cream at 10% plus `2px` inset gold leading edge.
- Focus: the demo has no authored focus rule. F1 must define a visible focus ring using approved
  forest/gold tokens and sufficient contrast; browser-default focus is not the final contract.
- Motion: sidebar transition `transform 220ms` below 780 px. Respect reduced-motion preferences.

## Breakpoints

`1050px`, `780px`, and `580px` exactly, with behavior defined in
`docs/architecture/F0_VISUAL_CONTRACT.md`.
