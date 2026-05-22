import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { MarkAllReadButton } from './mark-all-read-button';
import { NotificationLink } from './notification-link';
import { NotificationClickable } from './notification-clickable';

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
  const baseClass = `block rounded-md border p-4 transition-colors ${
    unread
      ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
      : 'border-slate-200 bg-white hover:bg-slate-50'
  }`;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {title}
            {unread && (
              <span className="ml-2 inline-block h-2 w-2 rounded-full bg-blue-500" />
            )}
          </p>
          <p className="mt-1 text-sm text-slate-700">{body}</p>
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          {formatSaigon(createdAt)}
        </span>
      </div>
      <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">
        {type}
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const homeHref = profile?.role === 'teacher' ? '/teacher' : '/student';

  // RLS scopes to own.
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, created_at, read_at, pushed_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <Link
        href={homeHref}
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Home
      </Link>

      <div className="mb-6 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">
            {(notifications ?? []).length === 0
              ? 'Nothing here yet.'
              : unreadCount > 0
                ? `${unreadCount} unread`
                : 'All caught up.'}
          </p>
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </div>

      {(notifications ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            You haven&apos;t received any notifications.
          </CardContent>
        </Card>
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
    </main>
  );
}
