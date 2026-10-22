import { cn, getFillLevelColor, getFillLevelProgressColor } from '../utils/index.js';

export interface FillLevelIndicatorProps {
  fillLevel: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  showPercentage?: boolean;
  className?: string;
}

export function FillLevelIndicator({
  fillLevel,
  size = 'md',
  showLabel = true,
  showPercentage = true,
  className,
}: FillLevelIndicatorProps) {
  const sizes = {
    sm: { barHeight: 'h-1.5', barWidth: 'w-16', textSize: 'text-xs', gap: 'gap-1' },
    md: { barHeight: 'h-2', barWidth: 'w-24', textSize: 'text-sm', gap: 'gap-2' },
    lg: { barHeight: 'h-3', barWidth: 'w-32', textSize: 'text-base', gap: 'gap-2' },
    xl: { barHeight: 'h-4', barWidth: 'w-40', textSize: 'text-lg', gap: 'gap-3' },
  };

  const s = sizes[size];
  const percentage = parseInt(fillLevel) || 0;

  const labels: Record<string, string> = {
    '0': 'Tom',
    '25': '25%',
    '50': 'Halvfull',
    '75': 'Nästan full',
    '100': 'Full',
  };

  return (
    <div className={cn('flex items-center', s.gap, className)}>
      <div className={cn('relative bg-gray-200 rounded-full overflow-hidden flex-1 max-w-xs', s.barHeight, s.barWidth)}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', getFillLevelProgressColor(fillLevel))}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Fyllnadsgrad: ${fillLevel}%`}
        />
        {percentage === 100 && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs font-bold text-white">
            FULL
          </span>
        )}
      </div>
      {showLabel && <span className={cn('font-medium whitespace-nowrap', s.textSize)}>{labels[fillLevel] || fillLevel}</span>}
      {showPercentage && <span className={cn('font-mono tabular-nums', s.textSize)}>{fillLevel}%</span>}
    </div>
  );
}

export interface FillLevelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FillLevelSelector({ value, onChange, disabled, size = 'md', className }: FillLevelSelectorProps) {
  const levels = ['0', '25', '50', '75', '100'] as const;

  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  return (
    <div className={cn('flex items-center gap-1', className)} role="group" aria-label="Välj fyllnadsgrad">
      {levels.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => !disabled && onChange(level)}
          disabled={disabled}
          className={cn(
            'flex items-center justify-center rounded-lg border-2 transition-all',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            value === level
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
            sizes[size]
          )}
          aria-pressed={value === level}
        >
          {level}%
        </button>
      ))}
    </div>
  );
}

export interface FillLevelCircleProps {
  fillLevel: string;
  size?: number;
  strokeWidth?: number;
  showPercentage?: boolean;
  className?: string;
}

export function FillLevelCircle({
  fillLevel,
  size = 60,
  strokeWidth = 6,
  showPercentage = true,
  className,
}: FillLevelCircleProps) {
  const percentage = parseInt(fillLevel) || 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const colors: Record<string, string> = {
    '0': '#9CA3AF',
    '25': '#22C55E',
    '50': '#EAB308',
    '75': '#F97316',
    '100': '#EF4444',
  };

  const color = colors[fillLevel] || colors['0'];
  const transformValue = `rotate(-90 ${size / 2} ${size / 2})`;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={transformValue}
          className="transition-all duration-500"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
        />
      </svg>
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold text-gray-900">{percentage}%</span>
        </div>
      )}
    </div>
  );
}