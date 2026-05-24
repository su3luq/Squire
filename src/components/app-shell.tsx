import Link from 'next/link';
import { SidebarNav } from './sidebar-nav';
import { BottomTabsNav } from './bottom-tabs-nav';
import { SignOutButton } from './sign-out-button';
import { InboxButton } from './inbox-button';
import type { NavItem } from './nav-items';

interface AppShellProps {
  navItems: NavItem[];
  userName: string;
  userMeta?: string;
  homeHref: string;
  unreadCount: number;
  children: React.ReactNode;
}

export function AppShell({
  navItems,
  userName,
  userMeta,
  homeHref,
  unreadCount,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-14 items-center justify-between border-b border-border pl-5 pr-2">
          <Link href={homeHref} className="text-base font-semibold tracking-tight">
            RankedLearning
          </Link>
          <InboxButton count={unreadCount} />
        </div>
        <SidebarNav items={navItems} />
        <div className="space-y-3 border-t border-border p-4">
          <div className="text-sm">
            <p className="truncate font-medium">{userName}</p>
            {userMeta ? (
              <p className="truncate text-xs text-muted-foreground">{userMeta}</p>
            ) : null}
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="flex h-14 items-center justify-between border-b border-border pl-4 pr-2 md:hidden">
          <Link href={homeHref} className="text-base font-semibold tracking-tight">
            RankedLearning
          </Link>
          <div className="flex items-center gap-1">
            <InboxButton count={unreadCount} />
            <SignOutButton />
          </div>
        </header>
        <main className="px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>
      </div>

      <BottomTabsNav items={navItems} />
    </div>
  );
}
