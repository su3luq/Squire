'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SidebarNav } from './sidebar-nav';
import { BottomTabsNav } from './bottom-tabs-nav';
import { SignOutButton } from './sign-out-button';
import { InboxButton } from './inbox-button';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav-items';

interface AppShellProps {
  navItems: NavItem[];
  userName: string;
  userMeta?: string;
  homeHref: string;
  unreadCount: number;
  children: React.ReactNode;
}

const STORAGE_KEY = 'rl-sidebar-collapsed';

export function AppShell({
  navItems,
  userName,
  userMeta,
  homeHref,
  unreadCount,
  children,
}: AppShellProps) {
  // Default to expanded for the first render so SSR markup matches.
  // We hydrate from localStorage after mount.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch {
      // localStorage can throw in private mode / disabled storage.
    }
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center border-b border-border',
            collapsed ? 'justify-center px-2' : 'justify-between pl-5 pr-2',
          )}
        >
          {collapsed ? (
            <Link
              href={homeHref}
              className="text-sm font-semibold tracking-tight"
              title="RankedLearning home"
            >
              RL
            </Link>
          ) : (
            <>
              <Link
                href={homeHref}
                className="text-base font-semibold tracking-tight"
              >
                RankedLearning
              </Link>
              <InboxButton count={unreadCount} />
            </>
          )}
        </div>

        <SidebarNav items={navItems} collapsed={collapsed} />

        {collapsed && (
          <div className="flex flex-col items-center gap-1 border-t border-border py-2">
            <InboxButton count={unreadCount} />
            <SignOutButton iconOnly />
          </div>
        )}

        {!collapsed && (
          <div className="space-y-3 border-t border-border p-4">
            <div className="text-sm">
              <p className="truncate font-medium">{userName}</p>
              {userMeta ? (
                <p className="truncate text-xs text-muted-foreground">
                  {userMeta}
                </p>
              ) : null}
            </div>
            <SignOutButton />
          </div>
        )}

        <button
          type="button"
          onClick={toggle}
          className={cn(
            'flex w-full items-center border-t border-border text-xs text-muted-foreground transition-colors hover:bg-muted',
            collapsed ? 'justify-center py-2.5' : 'justify-end gap-1 px-4 py-2',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <span>Collapse</span>
              <ChevronLeft className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </aside>

      <div
        className={cn(
          'transition-[padding] duration-200',
          collapsed ? 'md:pl-14' : 'md:pl-60',
        )}
      >
        <header className="flex h-14 items-center justify-between border-b border-border pl-4 pr-2 md:hidden">
          <Link
            href={homeHref}
            className="text-base font-semibold tracking-tight"
          >
            RankedLearning
          </Link>
          <div className="flex items-center gap-1">
            <InboxButton count={unreadCount} />
            <SignOutButton />
          </div>
        </header>
        <main className="px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          {children}
        </main>
      </div>

      <BottomTabsNav items={navItems} />
    </div>
  );
}
