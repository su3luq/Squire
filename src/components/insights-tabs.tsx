'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/teacher/analytics', label: 'Performance' },
  { href: '/leaderboard', label: 'Ranks' },
] as const;

/**
 * Tab strip shown at the top of both /teacher/analytics and /leaderboard
 * for the teacher role. Lets the teacher flip between the two screens
 * without bouncing through the sidebar.
 *
 * Render this only when the viewer is a teacher — for students,
 * /leaderboard is a stand-alone page (they don't see analytics).
 */
export function InsightsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 border-b border-border">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  '-mb-px inline-flex h-10 items-center border-b-2 px-4 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
