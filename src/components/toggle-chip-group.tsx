import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface ToggleChipOption<V extends string = string> {
  value: V;
  label: string;
  /** Optional count shown as a pill on the right. */
  count?: number;
  /** Where clicking the chip goes. Caller constructs the URL. */
  href: string;
}

interface ToggleChipGroupProps<V extends string = string> {
  options: ToggleChipOption<V>[];
  current: V;
  /**
   * `pill` = solid background on active (filter chips).
   * `tab`  = underline on active (sub-tabs above content).
   */
  variant?: 'pill' | 'tab';
  size?: 'sm' | 'md';
  /** Optional aria-label for the wrapping nav element. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Server-friendly URL-driven chip group. Replaces the hand-rolled
 * QuestFilterChips, FilterChipGroup, SortChip, and AnalyticsSubTabs
 * patterns that were each implementing the same thing client-side.
 *
 * Renders as plain <Link>s, so it works as a Server Component when the
 * parent already knows the active value (from searchParams or pathname).
 */
export function ToggleChipGroup<V extends string = string>({
  options,
  current,
  variant = 'pill',
  size = 'sm',
  ariaLabel,
  className,
}: ToggleChipGroupProps<V>) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        variant === 'tab'
          ? '-mb-px flex flex-wrap gap-2 border-b border-border'
          : 'flex flex-wrap gap-1.5',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === current;
        if (variant === 'tab') {
          return (
            <Link
              key={o.value}
              href={o.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                size === 'sm'
                  ? 'h-9 text-sm font-medium'
                  : 'h-10 text-sm font-medium',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
              {typeof o.count === 'number' && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-1.5 text-[10px] tabular-nums',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {o.count}
                </span>
              )}
            </Link>
          );
        }
        return (
          <Link
            key={o.value}
            href={o.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              size === 'sm'
                ? 'px-3 py-1 text-xs'
                : 'px-3.5 py-1.5 text-sm',
              active
                ? 'bg-foreground text-background'
                : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
            {typeof o.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] tabular-nums',
                  active ? 'bg-background/20' : 'bg-muted/80',
                )}
              >
                {o.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
