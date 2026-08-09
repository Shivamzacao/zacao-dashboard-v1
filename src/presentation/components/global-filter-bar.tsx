"use client";

import type { FilterOptions } from "@/src/application/api";
import type { DashboardFilters } from "@/src/domain/contracts";

interface GlobalFilterBarProps {
  readonly filters: DashboardFilters;
  readonly supported: FilterOptions;
  readonly onFilterChange: (patch: Partial<DashboardFilters>) => void;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GlobalFilterBar({ filters, supported, onFilterChange }: GlobalFilterBarProps) {
  const hasFilters =
    supported.channels.length > 0 ||
    supported.productSkus.length > 0 ||
    supported.locations.length > 0;
  if (!hasFilters) return null;

  return (
    <section className="global-filter-bar" aria-label="Global dashboard filters">
      <span className="filter-bar-label">Filter view</span>
      {supported.channels.length > 0 ? (
        <FilterSelect
          label="Channel"
          value={filters.channels[0] ?? ""}
          options={supported.channels}
          onChange={(value) => onFilterChange({ channels: value ? [value] : [] })}
        />
      ) : null}
      {supported.productSkus.length > 0 ? (
        <FilterSelect
          label="Product / SKU"
          value={filters.productSkus[0] ?? ""}
          options={supported.productSkus}
          onChange={(value) => onFilterChange({ productSkus: value ? [value] : [] })}
        />
      ) : null}
      {supported.locations.length > 0 ? (
        <FilterSelect
          label="Warehouse / location"
          value={filters.locations[0] ?? ""}
          options={supported.locations}
          onChange={(value) => onFilterChange({ locations: value ? [value] : [] })}
        />
      ) : null}
      {filters.channels.length + filters.productSkus.length + filters.locations.length > 0 ? (
        <button
          className="clear-filters"
          type="button"
          onClick={() => onFilterChange({ channels: [], productSkus: [], locations: [] })}
        >
          Clear
        </button>
      ) : null}
    </section>
  );
}
