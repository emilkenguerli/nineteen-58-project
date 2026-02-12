'use client';

import { useMemo, useState } from 'react';

interface DataTableProps {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number>>;
}

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

function useSortableData(
  items: Array<Record<string, string | number>>,
  initialConfig: SortConfig | null = null,
) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(initialConfig);

  const sorted = useMemo(() => {
    if (!sortConfig) return items;

    return [...items].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');

      const result = aStr.localeCompare(bStr, undefined, { numeric: true });
      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [items, sortConfig]);

  const requestSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  return { items: sorted, requestSort, sortConfig };
}

function formatCell(value: string | number): string {
  if (typeof value === 'number') {
    return value.toLocaleString('en-US');
  }
  return value;
}

export function DataTable({ columns, rows }: DataTableProps) {
  const { items, requestSort, sortConfig } = useSortableData(rows);

  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' \u2191' : ' \u2193';
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                onClick={() => requestSort(col.key)}
              >
                {col.label}
                {getSortIndicator(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-gray-50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-gray-700">
                  {row[col.key] !== undefined ? formatCell(row[col.key]) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
