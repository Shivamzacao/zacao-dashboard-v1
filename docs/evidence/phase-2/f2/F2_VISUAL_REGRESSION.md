# F2 Visual Regression

Reference: approved F0 component patterns and F1 shell tokens.

Baselines:

- `tests/presentation/browser/f2-components.spec.ts-snapshots/f2-components-desktop-darwin.png`
- `tests/presentation/browser/f2-components.spec.ts-snapshots/f2-components-tablet-darwin.png`

Classification:

- `MATCH`: card geometry, spacing, type hierarchy, borders, radii, shadows, chart palette, density,
  tooltip treatment, legends, table containment, and responsive grids.
- `INTENTIONAL_ACCESSIBILITY_CORRECTION`: supporting text uses the approved darker forest token;
  heatmap intensity remains within a light range so text meets WCAG contrast; chart SVG primitives
  are excluded from keyboard/screen-reader traversal because semantic summaries and tables exist.
- `IMPLEMENTATION_DEFECT`: none remaining.

The fixture matrix is synthetic TEST data only, is absent from navigation, and returns not found in
production. Baselines were updated once after the documented accessibility corrections.
