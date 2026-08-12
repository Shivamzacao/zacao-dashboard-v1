"use client";

import { formatCount } from "./format-display-value";

export interface PaginationModel {
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
}

interface PaginationProps extends PaginationModel {
  readonly onPageChange: (page: number) => void;
  readonly ariaLabel?: string;
}

export function Pagination({
  page,
  pageSize,
  totalRows,
  onPageChange,
  ariaLabel = "Table pagination",
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const start = totalRows === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(totalRows, (page + 1) * pageSize);
  return (
    <nav className="pagination" aria-label={ariaLabel}>
      <span>
        {formatCount(start)}–{formatCount(end)} of {formatCount(totalRows)}
      </span>
      <div>
        <button type="button" disabled={page <= 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span aria-live="polite">
          Page {formatCount(page + 1)} of {formatCount(pageCount)}
        </span>
        <button
          type="button"
          disabled={page + 1 >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
