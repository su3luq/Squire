'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NavIcon } from './nav-icons';
import type { NavItem } from './nav-items';

export function BottomTabsNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // Only the first 5 items become bottom tabs to keep touch targets reasonable.
  const tabs = items.slice(0, 5);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-background md:hidden">
      {tabs.map((item) => {
        const active =
          pathname === item.href ||
          pathname.startsWith(item.href + '/') ||
          (item.activePaths?.some(
            (p) => pathname === p || pathname.startsWith(p + '/'),
          ) ??
            false);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-xs',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span className="relative">
              <NavIcon name={item.icon} className="h-5 w-5" />
              {item.badge && item.badge > 0 ? (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {item.badge}
                </span>
              ) : null}
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
