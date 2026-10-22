import { type HTMLAttributes } from 'react';
import { cn, getStatusColor, getFillLevelColor } from '../utils/index.js';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'status' | 'fill-level';
  status?: string;
  fillLevel?: string;
}

export function Badge({ className, variant = 'default', status, fillLevel, children, ...props }: BadgeProps) {
  let colorClass = 'bg-gray-100 text-gray-700';

  if (variant === 'status' && status) {
    colorClass = getStatusColor(status);
  } else if (variant === 'fill-level' && fillLevel) {
    colorClass = `px-2 py-0.5 text-xs font-medium rounded-full ${getFillLevelColor(fillLevel)}`;
  }

  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', colorClass, className)}
      {...props}
    >
      {children}
    </span>
  );
}

export interface DotBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: 'green' | 'yellow' | 'orange' | 'red' | 'blue' | 'gray' | 'purple';
  size?: 'sm' | 'md' | 'lg';
}

export function DotBadge({ className, color = 'gray', size = 'md', children, ...props }: DotBadgeProps) {
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    gray: 'bg-gray-500',
    purple: 'bg-purple-500',
  };

  const sizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} {...props}>
      <span className={cn('rounded-full', colors[color], sizes[size])} />
      {children}
    </span>
  );
}