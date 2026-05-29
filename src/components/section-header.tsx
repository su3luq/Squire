import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small section header for cards / regions inside a page. Replaces the
 * repeated `<div className="mb-3 flex items-center gap-2"><Icon/><h2/>`
 * pattern littered across student/teacher pages.
 *
 * Larger page-level headers should still use <PageHeader>.
 */
export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  size = 'sm',
  className,
  level = 2,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  level?: 2 | 3;
}) {
  const titleClass =
    size === 'xs'
      ? 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
      : size === 'sm'
        ? 'text-sm font-semibold uppercase tracking-wide text-muted-foreground'
        : 'text-base font-semibold text-foreground';

  const Tag = level === 3 ? 'h3' : 'h2';

  return (
    <div
      className={cn(
        'mb-3 flex items-center justify-between gap-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {Icon && (
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Tag className={titleClass}>{title}</Tag>
        {subtitle && (
          <span className="truncate text-xs text-muted-foreground/80">
            {subtitle}
          </span>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
