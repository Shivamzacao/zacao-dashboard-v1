"use client";

import type { LegendItem } from "./display-contracts";
import { Tooltip } from "./tooltip.client";

export function AccessibleTooltip({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <span className="tooltip-root">
      <Tooltip label={label} className="tooltip-trigger">
        {children}
      </Tooltip>
    </span>
  );
}

export function ChartLegend({ items }: { readonly items: readonly LegendItem[] }) {
  return (
    <ul className="chart-legend" aria-label="Chart legend">
      {items.map((item) => (
        <li key={item.key}>
          <span
            className={`legend-swatch tone-${item.tone} pattern-${item.pattern ?? "solid"}`}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
