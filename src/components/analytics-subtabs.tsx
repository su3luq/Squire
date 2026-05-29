'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const SUB_TABS = [
  { href: '/teacher/analytics', label: 'Pulse', match: 'exact' as const },
  {
    href: '/teacher/analytics/quests',
    label: 'Quests',
    match: 'prefix' as const,
  },
  {
    href: '/teacher/analytics/content',
    label: 'Content',
    match: 'exact' as const,
  },
  {
    href: '/teacher/analytics/at-risk',
    label: 'At-risk',
    match: 'exact' as const,
  },
] as const;

/**
 * Secondary nav for the Performance tab. Preserves the ?class= filter
 * as the teacher flips between sub-views.
 */
export function AnalyticsSubTabs() {
  const pathname = usePathname();
  const search = useSearchParams();
  const classParam = search.get('class');
  const queryString = classParam ? `?class=${encodeURIComponent(classParam)}` : '';

  return (
    <nav className="-mx-1 mb-6 flex flex-wrap gap-1 overflow-x-auto pb-1">
      {SUB_TABS.map((tab) => {
        const active =
          tab.match === 'prefix'
            ? pathname === tab.href || pathname.startsWith(`${tab.href}/`)
            : pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${queryString}`}
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-medium transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
