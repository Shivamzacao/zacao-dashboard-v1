"use client";

import { useId, useState } from "react";

import type { LegendItem } from "./display-contracts";

export function AccessibleTooltip({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="tooltip-root">
      <button
        type="button"
        className="tooltip-trigger"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>
      {open ? (
        <span className="tooltip-content" role="tooltip" id={id}>
          {label}
        </span>
      ) : null}
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
