import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  trend?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend = 'neutral',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? (
        <p
          className={cn(
            'mt-1 text-xs',
            trend === 'positive' && 'text-primary',
            trend === 'negative' && 'text-destructive',
            trend === 'neutral' && 'text-muted-foreground',
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
