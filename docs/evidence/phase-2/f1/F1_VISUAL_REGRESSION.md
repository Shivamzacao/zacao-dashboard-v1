# F1 Visual Regression Classification

Authority: approved F0 visual contract and immutable F0 reference screenshots.

F1 baselines:

- tests/presentation/browser/f1-shell.spec.ts-snapshots/f1-shell-desktop-darwin.png
- tests/presentation/browser/f1-shell.spec.ts-snapshots/f1-shell-tablet-darwin.png

| Area                                                                             | Classification                       | Explanation                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| 260 px sidebar, 70 px top bar, canvas, card, border, radius, and shadow geometry | MATCH                                | Direct implementation of the frozen F0 tokens.                                               |
| Brand lockup, workspace tile, navigation layout, and active-route treatment      | MATCH                                | Rebuilt to the approved shell contract with Operations added from the frozen route decision. |
| Page eyebrow, serif title, description, source pill, and control treatment       | MATCH                                | Uses the approved demo patterns and B7 TEST labelling.                                       |
| Search, notifications, profile/administrator, settings, and write actions        | MATCH                                | Correctly absent under the frozen F0 scope contract.                                         |
| Date, comparison, global B7 filters, and approved export treatment               | MATCH                                | Required F1 controls reuse the approved 35 px control visual language.                       |
| Small shell/control labels raised to at least 9–10 px                            | INTENTIONAL_ACCESSIBILITY_CORRECTION | F0 explicitly approved correction of unreadable 7–9 px uses.                                 |
| Failing muted text changed only to approved forest-dark                          | INTENTIONAL_ACCESSIBILITY_CORRECTION | Browser axe identified AA failures; the nearest darker approved brand token now passes.      |
| Authored gold focus outline and responsive drawer focus return                   | INTENTIONAL_ACCESSIBILITY_CORRECTION | F0 explicitly required visible keyboard focus and focus management.                          |
| Unexplained visual differences                                                   | IMPLEMENTATION_DEFECT                | None found.                                                                                  |

Feature KPI, chart, table, and detailed readiness-card content is intentionally absent from the F1
baseline because it belongs to F2/F3. That phase boundary is not a visual-regression exception.
