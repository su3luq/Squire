import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { getTeacherNav } from '@/components/nav-items';

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { count: pendingReviews }, { count: unreadNotifications }] =
    await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase
        .from('quest_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review'),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null),
    ]);

  if (!profile) redirect('/login');

  return (
    <AppShell
      navItems={getTeacherNav({ pendingReviews: pendingReviews ?? 0 })}
      userName={profile.full_name ?? 'Teacher'}
      userMeta="Teacher"
      homeHref="/teacher"
      unreadCount={unreadNotifications ?? 0}
    >
      {children}
    </AppShell>
  );
}
