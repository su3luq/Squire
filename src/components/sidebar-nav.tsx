'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NavIcon } from './nav-icons';
import type { NavItem } from './nav-items';

export function SidebarNav({
  items,
  collapsed = false,
}: {
  items: NavItem[];
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        'flex-1 overflow-y-auto',
        collapsed ? 'p-2' : 'p-3',
      )}
    >
      <ul className="space-y-1">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + '/') ||
            (item.activePaths?.some(
              (p) => pathname === p || pathname.startsWith(p + '/'),
            ) ??
              false);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center rounded-md text-sm transition-colors',
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <span className="relative shrink-0">
                  <NavIcon name={item.icon} className="h-4 w-4" />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
