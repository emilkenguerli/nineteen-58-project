'use client';

interface KpiCardProps {
  label: string;
  value: string | number;
  format?: 'number' | 'currency' | 'percent';
  delta?: number;
  trend?: 'up' | 'down' | 'flat';
}

function formatValue(value: string | number, format?: string): string {
  if (typeof value === 'string') return value;

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    case 'percent':
      return `${value}%`;
    case 'number':
      return new Intl.NumberFormat('en-US').format(value);
    default:
      return typeof value === 'number'
        ? new Intl.NumberFormat('en-US').format(value)
        : String(value);
  }
}

function TrendBadge({ delta, trend }: { delta?: number; trend?: 'up' | 'down' | 'flat' }) {
  if (delta === undefined && !trend) return null;

  const displayDelta = delta !== undefined ? delta : 0;
  const displayTrend = trend ?? (displayDelta > 0 ? 'up' : displayDelta < 0 ? 'down' : 'flat');

  const config = {
    up: {
      bg: 'bg-green-100 text-green-700',
      icon: '\u2191',
    },
    down: {
      bg: 'bg-red-100 text-red-700',
      icon: '\u2193',
    },
    flat: {
      bg: 'bg-gray-100 text-gray-600',
      icon: '\u2013',
    },
  } as const;

  const { bg, icon } = config[displayTrend];
  const sign = displayDelta > 0 ? '+' : '';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bg}`}>
      <span>{icon}</span>
      {delta !== undefined && <span>{sign}{displayDelta.toFixed(1)}%</span>}
    </span>
  );
}

export function KpiCard({ label, value, format, delta, trend }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl font-bold text-gray-900">
          {formatValue(value, format)}
        </span>
        <TrendBadge delta={delta} trend={trend} />
      </div>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
