// UI Utilities
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

/**
 * Format date and time for display
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just nu';
  if (diffMins < 60) return `${diffMins} min sedan`;
  if (diffHours < 24) return `${diffHours} h sedan`;
  if (diffDays < 7) return `${diffDays} dag${diffDays > 1 ? 'ar' : ''} sedan`;
  return formatDate(d);
}

/**
 * Get fill level color class
 */
export function getFillLevelColor(fillLevel: string): string {
  switch (fillLevel) {
    case '0': return 'bg-gray-100 text-gray-600';
    case '25': return 'bg-green-100 text-green-700';
    case '50': return 'bg-yellow-100 text-yellow-700';
    case '75': return 'bg-orange-100 text-orange-700';
    case '100': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Get fill level progress color
 */
export function getFillLevelProgressColor(fillLevel: string): string {
  switch (fillLevel) {
    case '0': return 'bg-gray-300';
    case '25': return 'bg-green-500';
    case '50': return 'bg-yellow-500';
    case '75': return 'bg-orange-500';
    case '100': return 'bg-red-500';
    default: return 'bg-gray-300';
  }
}

/**
 * Get status badge color
 */
export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    // Transport order statuses
    planned: 'bg-blue-100 text-blue-700',
    assigned: 'bg-indigo-100 text-indigo-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    archived: 'bg-gray-100 text-gray-600',

    // Maintenance statuses
    due: 'bg-yellow-100 text-yellow-700',
    overdue: 'bg-red-100 text-red-700',
    // in_progress and completed already defined above

    // Damage report statuses
    open: 'bg-red-100 text-red-700',
    acknowledged: 'bg-yellow-100 text-yellow-700',
    resolved: 'bg-green-100 text-green-700',

    // Swap request statuses
    pending: 'bg-blue-100 text-blue-700',
    approved: 'bg-indigo-100 text-indigo-700',
    fulfilled: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-600',

    // Container statuses
    active: 'bg-green-100 text-green-700',
    maintenance: 'bg-yellow-100 text-yellow-700',
    retired: 'bg-gray-100 text-gray-600',

    // User roles
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    driver: 'bg-green-100 text-green-700',
    worker: 'bg-orange-100 text-orange-700',

    // Vehicle classifications
    location_bound: 'bg-gray-100 text-gray-700',
    transport: 'bg-blue-100 text-blue-700',

    // Damage severities
    minor: 'bg-green-100 text-green-700',
    major: 'bg-yellow-100 text-yellow-700',
    critical: 'bg-red-100 text-red-700',
  };

  return statusColors[status] || 'bg-gray-100 text-gray-700';
}

/**
 * Get container type label
 */
export function getContainerTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    open_top: 'Öppen container',
    closed: 'Stängd container',
    compactor: 'Kompressor',
    roll_off: 'Roll-off',
  };
  return labels[type] || type;
}

/**
 * Get user role label (Swedish)
 */
export function getUserRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Administratör',
    manager: 'Chef/Planerare',
    driver: 'Förare',
    worker: 'Arbetare',
  };
  return labels[role] || role;
}

/**
 * Get vehicle classification label
 */
export function getVehicleClassificationLabel(classification: string): string {
  const labels: Record<string, string> = {
    location_bound: 'Platsbunden',
    transport: 'Transportfordon',
  };
  return labels[classification] || classification;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate UUID v4 (for client-side temp IDs)
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: unknown): boolean {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key]);
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Sort array by key
 */
export function sortBy<T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
}