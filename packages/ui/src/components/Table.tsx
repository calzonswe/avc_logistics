import { type HTMLAttributes, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, getFillLevelProgressColor } from '../utils/index.js';
import { Badge } from './Badge.js';
import { Button } from './Button.js';

export interface Column<T> {
  /** Legacy key form: also used as cell accessor when accessorKey is absent. */
  key?: string;
  /** TanStack-style accessor; pages may pass accessorKey instead of key. */
  accessorKey?: string;
  header: string;
  /** Legacy render form. */
  render?: (row: T, index: number) => ReactNode;
  /** TanStack-style cell form. */
  cell?: (info: { getValue: () => any; row: T }) => ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  width?: string;
}

export interface TablePagination {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface TableProps<T> extends HTMLAttributes<HTMLTableElement> {
  data: T[];
  columns: Column<T>[];
  keyExtractor?: (row: T) => string;
  emptyMessage?: string;
  loading?: boolean;
  /** Alias for {@link loading}, for callers written against other table libs. */
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  striped?: boolean;
  hoverable?: boolean;
  className?: string;
  pagination?: TablePagination;
}

const cellText = (row: any, column: Column<any>): string => {
  const raw = row[(column.accessorKey ?? column.key) as any];
  return String(raw ?? '');
};

export function Table<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage,
  loading = false,
  isLoading,
  onRowClick,
  striped = true,
  hoverable = true,
  className,
  pagination,
  ...props
}: TableProps<T>) {
  const { t } = useTranslation();
  const busy = loading || isLoading || false;

  const headers = (skeleton = false) => (
    <thead>
      <tr className="border-b border-gray-200">
        {columns.map((column) => (
          <th
            key={column.key ?? column.accessorKey ?? column.header}
            className={cn(
              'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
              column.headerClassName
            )}
            style={{ width: column.width }}
          >
            {column.header}
          </th>
        ))}
        {skeleton && null}
      </tr>
    </thead>
  );

  if (busy) {
    return (
      <div className="overflow-x-auto" {...props}>
        <table className={cn('w-full', className)}>
          {headers()}
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className={cn(hoverable && 'hover:bg-gray-50')}>
                {columns.map((column) => (
                  <td key={column.key ?? column.accessorKey ?? column.header} className={cn('px-4 py-3', column.className)}>
                    <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn('w-full', className)} {...props}>
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mt-2 text-gray-500">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)} {...props}>
      <table className="w-full">
        {headers()}
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, rowIndex) => (
            <tr
              key={keyExtractor?.(row) ?? String(rowIndex)}
              className={cn(
                striped && rowIndex % 2 === 1 && 'bg-gray-50',
                hoverable && 'hover:bg-gray-50',
                onRowClick && 'cursor-pointer'
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((column) => (
                <td key={column.key ?? column.accessorKey ?? column.header} className={cn('px-4 py-3 text-sm text-gray-900', column.className)}>
                  {column.render
                    ? column.render(row, rowIndex)
                    : column.cell
                      ? column.cell({ getValue: () => (row as Record<string, unknown>)[column.accessorKey ?? column.key!], row })
                      : cellText(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Sida {pagination.page} av {pagination.pageCount} ({pagination.total} poster)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
            >
              Föregående
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(Math.min(pagination.pageCount, pagination.page + 1))}
              disabled={pagination.page >= pagination.pageCount}
            >
              Nästa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Convenience column helpers
export function createStatusColumn<T>(
  key: string,
  header: string,
  getStatus: (row: T) => string
): Column<T> {
  return {
    key,
    header,
    render: (row) => <Badge variant="status" status={getStatus(row)}>{getStatus(row)}</Badge>,
  };
}

export function createFillLevelColumn<T>(
  key: string,
  header: string,
  getFillLevel: (row: T) => string
): Column<T> {
  return {
    key,
    header,
    render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', getFillLevelProgressColor(getFillLevel(row)))}
            style={{ width: `${parseInt(getFillLevel(row))}%` }}
          />
        </div>
        <Badge variant="fill-level" fillLevel={getFillLevel(row)}>
          {getFillLevel(row)}%
        </Badge>
      </div>
    ),
  };
}

/**
 * True for anything React can render as a component type: a string tag, a
 * function/class component, or an object component (forwardRef, memo — lucide
 * icons are forwardRef objects, so a `typeof icon === 'function'` check is not
 * enough and rendering the object directly throws
 * "Objects are not valid as a React child").
 *
 * A *rendered* element (`<Eye />`) is NOT a component type: it must be
 * rendered as-is, so it is explicitly excluded.
 */
const REACT_ELEMENT_TYPES = new Set<symbol>([
  Symbol.for('react.element'),
  Symbol.for('react.transitional.element'),
]);

function isComponentType(value: unknown): value is ComponentType<{ className?: string }> {
  if (typeof value === 'string' || typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { $$typeof?: symbol }).$$typeof;
  if (!type || REACT_ELEMENT_TYPES.has(type)) return false;
  return true;
}

export function createActionsColumn<T>(
  actions: Array<{
    label: string;
    onClick: (row: T) => void;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'destructive';
    icon?: ReactNode | ComponentType<{ className?: string }>;
    disabled?: (row: T) => boolean;
  }>
): Column<T> {
  return {
    key: 'actions',
    header: 'Åtgärder',
    render: (row) => (
      <div className="flex items-center gap-1">
        {actions.map((action, index) => {
          const iconEl = isComponentType(action.icon)
            ? (() => {
                const Icon = action.icon;
                return <Icon className="h-4 w-4" />;
              })()
            : (action.icon as ReactNode | undefined);
          return (
            <Button
              key={index}
              size="sm"
              variant={action.variant ?? 'ghost'}
              onClick={() => action.onClick(row)}
              disabled={action.disabled?.(row)}
            >
              {iconEl}
              {action.label}
            </Button>
          );
        })}
      </div>
    ),
    className: 'whitespace-nowrap',
  };
}
