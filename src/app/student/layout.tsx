import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { getStudentNav } from '@/components/nav-items';

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const nowIso = new Date().toISOString();
  const [{ data: profile }, { count: dueReviews }, { count: unreadNotifications }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, xp_total, current_rank')
        .eq('id', user.id)
        .single(),
      supabase
        .from('card_reviews')
        .select('id', { count: 'exact', head: true })
        .lte('due_at', nowIso),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null),
    ]);

  if (!profile) redirect('/login');

  return (
    <AppShell
      navItems={getStudentNav({
        dueReviews: dueReviews ?? 0,
        unreadNotifications: unreadNotifications ?? 0,
      })}
      userName={profile.full_name ?? 'Student'}
      userMeta={`Rank ${profile.current_rank} · ${profile.xp_total} XP`}
      homeHref="/student"
    >
      {children}
    </AppShell>
  );
}
