import { cn } from '../utils/index.js';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ariaLabel?: string;
}

export function LoadingSpinner({ size = 'md', className, ariaLabel = 'Laddar' }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
    xl: 'w-12 h-12 border-4',
  };

  return (
    <svg
      className={cn('animate-spin text-blue-600', sizes[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-label={ariaLabel}
      role="status"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export interface LoadingOverlayProps {
  isLoading: boolean;
  children: React.ReactNode;
  message?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function LoadingOverlay({ isLoading, children, message, size = 'md' }: LoadingOverlayProps) {
  return (
    <div className="relative" aria-busy={isLoading}>
      {children}
      {isLoading && (
        <div
          className="absolute inset-0 bg-white/80 flex items-center justify-center z-10"
          role="status"
          aria-live="polite"
          aria-label={message || 'Laddar'}
        >
          <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-xl shadow-lg">
            <LoadingSpinner size={size} />
            {message && <p className="text-gray-600 text-sm">{message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({ className, variant = 'text', width, height, lines = 1 }: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-gray-200 rounded';

  if (variant === 'circular') {
    return (
      <div
        className={cn(baseStyles, 'rounded-full', className)}
        style={{ width: width || '40px', height: height || '40px' }}
        aria-hidden="true"
      />
    );
  }

  if (variant === 'rectangular') {
    return (
      <div
        className={cn(baseStyles, className)}
        style={{ width: width || '100%', height: height || '120px' }}
        aria-hidden="true"
      />
    );
  }

  // Text variant - multiple lines
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(baseStyles, 'h-4')}
          style={{
            width: i === lines - 1 && width ? width : undefined,
            height: height || '1rem',
          }}
        />
      ))}
    </div>
  );
}

export function TableSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton variant="text" width="60%" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex} className="px-4 py-3">
                  <Skeleton variant="text" width={colIndex === 0 ? '80%' : '60%'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 space-y-4 animate-pulse">
      <div className="flex items-center gap-4">
        <Skeleton variant="circular" width="48px" height="48px" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="60%" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} variant="text" width={i === lines - 1 ? '70%' : '100%'} />
        ))}
      </div>
    </div>
  );
}