"use client"

import { cn } from "@/lib/utils"

interface Column<T> {
  header: string
  accessor: (item: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
  className?: string
}

/**
 * DataTable Component
 * 
 * Standardized table component supporting dynamic columns, cell accessors, custom row click action, and empty status message.
 * 
 * Usage example:
 * ```tsx
 * <DataTable
 *   data={items}
 *   columns={[
 *     { header: "Name", accessor: (item) => item.name },
 *     { header: "Actions", accessor: (item) => <Button onClick={() => handleEdit(item)}>Edit</Button> }
 *   ]}
 * />
 * ```
 */
export function DataTable<T>({
  data,
  columns,
  onRowClick,
  emptyMessage = "No items to display.",
  className
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={cn(
                    "px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, rowIdx) => (
                <tr
                  key={rowIdx}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    "transition-colors",
                    onRowClick ? "cursor-pointer hover:bg-muted/30" : ""
                  )}
                >
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={cn("px-5 py-3.5 align-middle", col.className)}>
                      {col.accessor(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
