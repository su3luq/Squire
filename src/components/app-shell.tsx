'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SidebarNav } from './sidebar-nav';
import { BottomTabsNav } from './bottom-tabs-nav';
import { SignOutButton } from './sign-out-button';
import { InboxButton } from './inbox-button';
import { Avatar } from './avatar';
import { StreakWidget } from './streak-widget';
import { Wordmark } from './wordmark';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav-items';
import type { EffectiveStreak } from '@/lib/streak';

interface AppShellProps {
  navItems: NavItem[];
  userName: string;
  userMeta?: string;
  avatarUrl?: string | null;
  userRank?: number | null;
  userRingConfig?: { gradient: string; glow?: string | null } | null;
  streak?: EffectiveStreak;
  homeHref: string;
  unreadCount: number;
  children: React.ReactNode;
}

const STORAGE_KEY = 'rl-sidebar-collapsed';

export function AppShell({
  navItems,
  userName,
  userMeta,
  avatarUrl,
  userRank,
  userRingConfig,
  streak,
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
      if (stored === 'true') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCollapsed(true);
      }
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
              <Wordmark short />
            </Link>
          ) : (
            <Link
              href={homeHref}
              className="text-base font-semibold tracking-tight"
            >
              <Wordmark />
            </Link>
          )}
        </div>

        <SidebarNav items={navItems} collapsed={collapsed} />

        {collapsed && (
          <div className="flex flex-col items-center gap-1 border-t border-border py-2">
            <Link
              href="/settings"
              title={`${userName} · settings`}
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Avatar url={avatarUrl} name={userName} size="sm" rank={userRank} ringConfig={userRingConfig} />
            </Link>
            {streak && streak.status !== 'broken' && streak.status !== 'none' && (
              <StreakWidget streak={streak} variant="sidebar-icon" />
            )}
            <InboxButton count={unreadCount} />
            <SignOutButton iconOnly />
          </div>
        )}

        {!collapsed && (
          <div className="space-y-3 border-t border-border p-4">
            <div className="flex items-center gap-2">
              <Link
                href="/settings"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:bg-muted/60"
                title="Settings"
              >
                <Avatar url={avatarUrl} name={userName} size="sm" rank={userRank} ringConfig={userRingConfig} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{userName}</p>
                  {userMeta ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {userMeta}
                    </p>
                  ) : null}
                </div>
              </Link>
              <InboxButton count={unreadCount} />
            </div>
            {streak && (
              <StreakWidget streak={streak} variant="sidebar-full" />
            )}
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
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            {streak && streak.status !== 'broken' && streak.status !== 'none' && (
              <StreakWidget streak={streak} variant="sidebar-icon" />
            )}
            <InboxButton count={unreadCount} />
            <SignOutButton iconOnly />
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
