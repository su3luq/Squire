import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { CelebrationGate } from '@/components/celebration-gate';
import { getStudentNav } from '@/components/nav-items';
import { getRingConfigForTier } from '@/lib/ranks-config';

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
        .select('full_name, xp_total, current_rank, avatar_url')
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

  const userRingConfig = await getRingConfigForTier(profile.current_rank);

  return (
    <AppShell
      navItems={getStudentNav({ dueReviews: dueReviews ?? 0 })}
      userName={profile.full_name ?? 'Student'}
      userMeta={`Rank ${profile.current_rank} · ${profile.xp_total} XP`}
      avatarUrl={profile.avatar_url}
      userRank={profile.current_rank}
      userRingConfig={userRingConfig}
      homeHref="/student"
      unreadCount={unreadNotifications ?? 0}
    >
      <CelebrationGate />
      {children}
    </AppShell>
  );
}
