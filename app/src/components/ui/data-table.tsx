"use client";

import * as React from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string) => void;
  className?: string;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  sortBy,
  sortOrder,
  onSort,
  className = "",
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  const handleSort = (key: string) => {
    if (onSort) {
      onSort(key);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, row: T) => {
    if ((e.key === "Enter" || e.key === " ") && onRowClick) {
      e.preventDefault();
      onRowClick(row);
    }
  };

  if (data.length === 0) {
    return (
      <div className={`text-center py-12 text-text-tertiary ${className}`}>{emptyMessage}</div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm" role="grid">
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-4 py-3 text-left font-semibold text-text-secondary ${column.className || ""} ${
                  column.sortable ? "cursor-pointer hover:text-text-primary select-none" : ""
                }`}
                onClick={() => column.sortable && handleSort(column.key)}
                onKeyDown={(e) =>
                  column.sortable && (e.key === "Enter" || e.key === " ") && handleSort(column.key)
                }
                tabIndex={column.sortable ? 0 : undefined}
                aria-sort={
                  sortBy === column.key
                    ? sortOrder === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <div className="flex items-center gap-1">
                  {column.header}
                  {column.sortable && sortBy === column.key && (
                    <span aria-hidden="true">{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={keyExtractor(row)}
              className={`border-b border-border/50 transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-surface-2/50" : ""
              }`}
              onClick={() => onRowClick && onRowClick(row)}
              onKeyDown={(e) => handleKeyDown(e, row)}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 text-text-primary ${column.className || ""}`}
                >
                  {column.render
                    ? column.render(row)
                    : String((row as Record<string, unknown>)[column.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
