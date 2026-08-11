"use client";

export interface PaginationModel {
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
}

interface PaginationProps extends PaginationModel {
  readonly onPageChange: (page: number) => void;
  readonly ariaLabel?: string;
  readonly hasNextPage?: boolean;
  readonly cursorMode?: boolean;
}

export function Pagination({
  page,
  pageSize,
  totalRows,
  onPageChange,
  ariaLabel = "Table pagination",
  hasNextPage,
  cursorMode = false,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const start = totalRows === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(totalRows, (page + 1) * pageSize);
  return (
    <nav className="pagination" aria-label={ariaLabel}>
      <span>{cursorMode ? `${start}–${end}` : `${start}–${end} of ${totalRows}`}</span>
      <div>
        <button type="button" disabled={page <= 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span aria-live="polite">
          Page {page + 1} of {pageCount}
        </span>
        <button
          type="button"
          disabled={cursorMode ? !hasNextPage : page + 1 >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
