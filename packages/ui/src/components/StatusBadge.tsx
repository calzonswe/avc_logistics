import { cn, getStatusColor, getUserRoleLabel, getContainerTypeLabel, getVehicleClassificationLabel } from '../utils/index.js';

export interface StatusBadgeProps {
  status: string;
  type?: 'order' | 'maintenance' | 'damage' | 'swap' | 'container' | 'user' | 'vehicle';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, type = 'order', size = 'md', showIcon = false, className }: StatusBadgeProps) {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  const icons: Record<string, React.ReactNode> = {
    planned: <ClockIcon className="w-3 h-3" />,
    assigned: <UserCheckIcon className="w-3 h-3" />,
    in_progress: <TruckIcon className="w-3 h-3" />,
    completed: <CheckCircleIcon className="w-3 h-3" />,
    archived: <ArchiveIcon className="w-3 h-3" />,
    due: <ClockIcon className="w-3 h-3" />,
    overdue: <ExclamationTriangleIcon className="w-3 h-3" />,
    open: <ExclamationCircleIcon className="w-3 h-3" />,
    acknowledged: <EyeIcon className="w-3 h-3" />,
    resolved: <CheckCircleIcon className="w-3 h-3" />,
    pending: <ClockIcon className="w-3 h-3" />,
    approved: <CheckBadgeIcon className="w-3 h-3" />,
    fulfilled: <CheckCircleIcon className="w-3 h-3" />,
    cancelled: <XCircleIcon className="w-3 h-3" />,
    active: <CheckCircleIcon className="w-3 h-3" />,
    maintenance: <WrenchIcon className="w-3 h-3" />,
    retired: <ArchiveIcon className="w-3 h-3" />,
  };

  const getLabel = (status: string, type: string): string => {
    if (type === 'user') return getUserRoleLabel(status);
    if (type === 'container') return getContainerTypeLabel(status);
    if (type === 'vehicle') return getVehicleClassificationLabel(status);

    const labels: Record<string, Record<string, string>> = {
      order: {
        planned: 'Planerad',
        assigned: 'Tilldelad',
        in_progress: 'Pågår',
        completed: 'Avslutad',
        archived: 'Arkiverad',
      },
      maintenance: {
        due: 'Planerad',
        overdue: 'Försenad',
        in_progress: 'Pågår',
        completed: 'Klar',
      },
      damage: {
        open: 'Öppen',
        acknowledged: 'Bekräftad',
        resolved: 'Löst',
      },
      swap: {
        pending: 'Väntar',
        approved: 'Godkänd',
        fulfilled: 'Utförd',
        cancelled: 'Avbruten',
      },
    };

    return labels[type]?.[status] || status;
  };

  const label = getLabel(status, type);
  const colorClass = getStatusColor(status);
  const Icon = icons[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        colorClass,
        sizes[size],
        className
      )}
    >
      {showIcon && Icon && <span aria-hidden="true">{Icon}</span>}
      {label}
    </span>
  );
}

// SVG Icons
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function UserCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 2 16.09 5.707 16.6 3.049c.605-3.056-7.834 2.197-7.834 2.197a7 7 0 1011.202 3.608A8 8 0 0022 20a8 8 0 00-4.343-1.343" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

function ExclamationTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ExclamationCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function CheckBadgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// Container type badge
export function ContainerTypeBadge({ type, size = 'md', className }: { type: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm', lg: 'px-3 py-1.5 text-base' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium rounded-full bg-blue-100 text-blue-700', sizeClasses[size], className)}>
      <ContainerIcon className="w-3 h-3" />
      {getContainerTypeLabel(type)}
    </span>
  );
}

function ContainerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}