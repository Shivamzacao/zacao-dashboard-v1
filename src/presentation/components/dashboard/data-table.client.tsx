"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

import type { DisplayState } from "./display-contracts";
import { Pagination } from "./pagination";
import { StateSurface } from "./state-surface";

export interface DashboardTableColumn<Row extends object> {
  readonly key: keyof Row & string;
  readonly label: string;
  readonly numeric?: boolean;
  readonly sortable?: boolean;
  readonly render?: (value: Row[keyof Row], row: Row) => React.ReactNode;
}

interface DataTableProps<Row extends object> {
  readonly caption: string;
  readonly columns: readonly DashboardTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly state?: DisplayState;
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
  readonly onPageChange: (page: number) => void;
  readonly onRowOpen?: (row: Row) => void;
}

export function DataTable<Row extends object>({
  caption,
  columns,
  rows,
  rowKey,
  state = "current",
  page,
  pageSize,
  totalRows,
  onPageChange,
  onRowOpen,
}: DataTableProps<Row>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const defs = useMemo<ColumnDef<Row>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        accessorFn: (row) => row[column.key],
        enableSorting: column.sortable ?? false,
        header: column.label,
        cell: ({ getValue, row }) =>
          column.render
            ? column.render(getValue() as Row[keyof Row], row.original)
            : String(getValue() ?? "—"),
        meta: { numeric: column.numeric ?? false },
      })),
    [columns],
  );
  // TanStack Table intentionally exposes non-memoizable helpers; component state remains local.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: [...rows],
    columns: defs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (state !== "current" && state !== "partial" && state !== "stale")
    return <StateSurface state={state} />;
  if (rows.length === 0) return <StateSurface state="empty" />;

  return (
    <div className="data-table-region">
      <div className="data-table-scroll" tabIndex={0} aria-label={`${caption} scrollable table`}>
        <table className="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const numeric = (
                    header.column.columnDef.meta as { numeric?: boolean } | undefined
                  )?.numeric;
                  return (
                    <th
                      key={header.id}
                      className={numeric ? "numeric-cell" : undefined}
                      scope="col"
                      aria-sort={
                        header.column.getIsSorted() === "asc"
                          ? "ascending"
                          : header.column.getIsSorted() === "desc"
                            ? "descending"
                            : header.column.getCanSort()
                              ? "none"
                              : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="sort-control"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true">
                            {header.column.getIsSorted() === "asc"
                              ? "↑"
                              : header.column.getIsSorted() === "desc"
                                ? "↓"
                                : "↕"}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
                {onRowOpen ? (
                  <th scope="col">
                    <span className="table-header-sr-only">Details</span>
                  </th>
                ) : null}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={rowKey(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={
                      (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric
                        ? "numeric-cell"
                        : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
                {onRowOpen ? (
                  <td>
                    <button
                      type="button"
                      className="row-detail-trigger"
                      onClick={() => onRowOpen(row.original)}
                      aria-label={`View details for ${rowKey(row.original)}`}
                    >
                      View
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={totalRows}
        onPageChange={onPageChange}
      />
      {state !== "current" ? (
        <p className="table-state-note">
          {state === "partial" ? "Partial source data" : "Stale source data"}
        </p>
      ) : null}
    </div>
  );
}
