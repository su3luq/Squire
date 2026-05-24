import Link from 'next/link';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

export function InboxButton({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <Link
      href="/notifications"
      aria-label={
        count > 0
          ? `Notifications, ${count} unread`
          : 'Notifications'
      }
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted',
        className,
      )}
    >
      <Bell className="h-5 w-5" />
      {count > 0 ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
