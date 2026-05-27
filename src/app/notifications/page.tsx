import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { MarkAllReadButton } from './mark-all-read-button';
import { NotificationLink } from './notification-link';
import { NotificationClickable } from './notification-clickable';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

function formatSaigon(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAIGON_TZ,
  }).format(new Date(iso));
}

function NotificationRow({
  id,
  title,
  body,
  type,
  createdAt,
  unread,
  href,
}: {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAt: string;
  unread: boolean;
  href: string | null;
}) {
  const baseClass = cn(
    'block rounded-lg border p-4 transition-colors',
    unread
      ? 'border-primary/20 bg-primary/5 hover:bg-primary/10'
      : 'border-border bg-card hover:bg-muted/40'
  );
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            {title}
            {unread && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatSaigon(createdAt)}
        </span>
      </div>
      <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground/70">
        {type.replace(/_/g, ' ')}
      </p>
    </>
  );
  if (href) {
    return (
      <NotificationLink id={id} href={href} className={baseClass} unread={unread}>
        {inner}
      </NotificationLink>
    );
  }
  return (
    <NotificationClickable id={id} className={baseClass} unread={unread}>
      {inner}
    </NotificationClickable>
  );
}

export default async function NotificationsInboxPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, created_at, read_at, pushed_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;
  const totalCount = (notifications ?? []).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={
          totalCount === 0
            ? 'Nothing here yet.'
            : unreadCount > 0
              ? `${unreadCount} unread`
              : 'All caught up.'
        }
        actions={unreadCount > 0 ? <MarkAllReadButton /> : undefined}
      />

      {totalCount === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You'll see review feedback, quest updates, and rank ups here."
        />
      ) : (
        <ul className="space-y-2">
          {(notifications ?? []).map((n) => {
            const data = (n.data ?? {}) as { url?: string };
            const href = data.url ?? null;
            return (
              <li key={n.id}>
                <NotificationRow
                  id={n.id}
                  title={n.title}
                  body={n.body}
                  type={n.type}
                  createdAt={n.created_at}
                  unread={!n.read_at}
                  href={href}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
