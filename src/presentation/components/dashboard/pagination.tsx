"use client";

export interface PaginationModel {
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
}

interface PaginationProps extends PaginationModel {
  readonly onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, totalRows, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const start = totalRows === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(totalRows, (page + 1) * pageSize);
  return (
    <nav className="pagination" aria-label="Table pagination">
      <span>
        {start}–{end} of {totalRows}
      </span>
      <div>
        <button type="button" disabled={page <= 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span aria-live="polite">
          Page {page + 1} of {pageCount}
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
