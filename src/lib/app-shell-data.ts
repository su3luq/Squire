import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getStudentNav, getTeacherNav } from '@/components/nav-items';
import { getRingConfigForTier } from '@/lib/ranks-config';
import type { NavItem } from '@/components/nav-items';

export type ShellData = {
  navItems: NavItem[];
  userName: string;
  userMeta?: string;
  avatarUrl?: string | null;
  userRank?: number | null;
  userRingConfig?: { gradient: string; glow?: string | null } | null;
  homeHref: string;
  unreadCount: number;
};

/**
 * Resolves the role-appropriate AppShell props for any authenticated route.
 * Used by route layouts that aren't role-specific (e.g. /notifications,
 * /leaderboard). Returns after a redirect if the user is unauthenticated or
 * lacks a profile row.
 */
export async function getShellData(): Promise<ShellData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, xp_total, current_rank, avatar_url')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/login');

  const { count: unreadNotificationsRaw } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  const unreadCount = unreadNotificationsRaw ?? 0;

  if (profile.role === 'teacher') {
    const { count: pendingReviewsRaw } = await supabase
      .from('quest_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review');
    return {
      navItems: getTeacherNav({ pendingReviews: pendingReviewsRaw ?? 0 }),
      userName: profile.full_name ?? 'Teacher',
      userMeta: 'Teacher',
      avatarUrl: profile.avatar_url ?? null,
      homeHref: '/teacher',
      unreadCount,
    };
  }

  const nowIso = new Date().toISOString();
  const [{ count: dueReviewsRaw }, userRingConfig] = await Promise.all([
    supabase
      .from('card_reviews')
      .select('id', { count: 'exact', head: true })
      .lte('due_at', nowIso),
    getRingConfigForTier(profile.current_rank),
  ]);

  return {
    navItems: getStudentNav({ dueReviews: dueReviewsRaw ?? 0 }),
    userName: profile.full_name ?? 'Student',
    userMeta: `Rank ${profile.current_rank} · ${profile.xp_total} XP`,
    avatarUrl: profile.avatar_url ?? null,
    userRank: profile.current_rank ?? null,
    userRingConfig,
    homeHref: '/student',
    unreadCount,
  };
}
