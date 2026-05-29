import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ArrowRight, BookOpen, Target, Trophy } from 'lucide-react';
import { EnableNotificationsButton } from '@/components/enable-notifications-button';
import { StatCard } from '@/components/stat-card';
import { QuestStatusChip } from '@/components/status-chip';
import { RankHero } from '@/components/rank-hero';
import { DailyReviewGoal } from '@/components/daily-review-goal';
import { computeEffectiveStreak, saigonDay } from '@/lib/streak';
import {
  ClosestRival,
  type RivalRow,
} from '@/components/closest-rival';
import { RecentWins } from '@/components/recent-wins';
import { getRankProgress, getRanksMap } from '@/lib/ranks-config';

export const dynamic = 'force-dynamic';

const ACCEPTANCE_PREVIEW_LIMIT = 4;

export default async function StudentHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'full_name, current_rank, xp_total, streak_days, streak_last_day',
    )
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  const nowIso = new Date().toISOString();
  const viewerXp = profile.xp_total ?? 0;
  const today = saigonDay();
  // Start of today in Saigon, expressed as UTC ISO. Saigon is UTC+7,
  // so subtract 7h from local midnight to get the UTC instant.
  const todayStartIso = new Date(`${today}T00:00:00+07:00`).toISOString();
  const [
    { count: dueCountRaw },
    { data: nextRow },
    { count: activeQuestsRaw },
    { data: acceptances },
    { count: aheadCount },
    { data: rivalAboveRow },
    { data: rivalBelowRow },
    { data: recentWins },
    { count: reviewsTodayRaw },
  ] = await Promise.all([
    supabase
      .from('card_reviews')
      .select('id', { count: 'exact', head: true })
      .lte('due_at', nowIso),
    supabase
      .from('card_reviews')
      .select('due_at')
      .gt('due_at', nowIso)
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('quest_acceptances')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .in('status', ['active', 'submitted', 'enrolled']),
    supabase
      .from('quest_acceptances')
      .select('id, status, quest_type, accepted_at, quest:quests!quest_acceptances_quest_id_fkey(id, title)')
      .eq('student_id', user.id)
      .in('status', ['active', 'submitted', 'enrolled'])
      .order('accepted_at', { ascending: false })
      .limit(ACCEPTANCE_PREVIEW_LIMIT),
    // Number of students with more XP than this one → leaderboard position = aheadCount + 1
    supabase
      .from('public_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .gt('xp_total', viewerXp),
    // Closest student above the viewer (smallest XP higher than viewer's).
    supabase
      .from('public_profiles')
      .select('id, full_name, avatar_url, xp_total, current_rank, class_id')
      .eq('role', 'student')
      .neq('id', user.id)
      .gt('xp_total', viewerXp)
      .order('xp_total', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // Closest student below the viewer (largest XP lower than viewer's).
    supabase
      .from('public_profiles')
      .select('id, full_name, avatar_url, xp_total, current_rank, class_id')
      .eq('role', 'student')
      .neq('id', user.id)
      .lt('xp_total', viewerXp)
      .order('xp_total', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Recent wins feed — last 5 XP awards from xp_ledger.
    supabase
      .from('xp_ledger')
      .select('id, amount, reason, created_at')
      .eq('student_id', user.id)
      .gt('amount', 0)
      .order('created_at', { ascending: false })
      .limit(5),
    // Review attempts today (Saigon-day) — drives the daily-goal progress.
    supabase
      .from('review_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .gte('answered_at', todayStartIso),
  ]);

  const dueCount = dueCountRaw ?? 0;
  const nextDueAt = nextRow?.due_at ?? null;
  const activeQuests = activeQuestsRaw ?? 0;
  const leaderboardPosition = (aheadCount ?? 0) + 1;
  const reviewsToday = reviewsTodayRaw ?? 0;
  const streak = computeEffectiveStreak(
    profile.streak_days ?? 0,
    profile.streak_last_day ?? null,
    today,
  );

  const tier = profile.current_rank ?? 7;
  const xp = viewerXp;
  const [rankProgressData, ranksMap] = await Promise.all([
    getRankProgress(xp, tier),
    getRanksMap(),
  ]);

  function toRivalRow(
    row:
      | {
          id: string | null;
          full_name: string | null;
          avatar_url: string | null;
          xp_total: number | null;
          current_rank: number | null;
          class_id: string | null;
        }
      | null,
  ): RivalRow | null {
    if (!row || !row.id) return null;
    const t = row.current_rank ?? 7;
    const r = ranksMap.get(t);
    return {
      id: row.id,
      full_name: row.full_name ?? 'Unknown',
      avatar_url: row.avatar_url ?? null,
      xp_total: row.xp_total ?? 0,
      current_rank: t,
      class_id: row.class_id ?? null,
      ringConfig: r?.gradient
        ? { gradient: r.gradient.gradient, glow: r.gradient.glow ?? null }
        : null,
    };
  }
  const rivalAbove = toRivalRow(rivalAboveRow);
  const rivalBelow = toRivalRow(rivalBelowRow);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <RankHero
        fullName={profile.full_name ?? 'Student'}
        xp={xp}
        tier={tier}
        progress={rankProgressData}
      />

      {(rivalAbove || rivalBelow) && (
        <ClosestRival
          viewerXp={xp}
          viewerPosition={leaderboardPosition}
          rivalAbove={rivalAbove}
          rivalBelow={rivalBelow}
        />
      )}

      {recentWins && recentWins.length > 0 && (
        <RecentWins rows={recentWins} />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Due now"
          value={dueCount}
          hint={
            dueCount === 0 ? 'All caught up' : 'Cards waiting for review'
          }
          icon={BookOpen}
          trend={dueCount > 0 ? 'positive' : 'neutral'}
        />
        <StatCard
          label="Active quests"
          value={activeQuests}
          hint={activeQuests === 0 ? 'Browse the quest board' : 'In progress'}
          icon={Target}
        />
        <StatCard
          label="Leaderboard"
          value={`#${leaderboardPosition}`}
          hint="Among all students"
          icon={Trophy}
        />
      </div>

      <DailyReviewGoal
        dueCount={dueCount}
        reviewsToday={reviewsToday}
        nextDueAt={nextDueAt}
        streak={streak}
      />

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-semibold">Active quests</h2>
          <Link
            href="/student/quests"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Quest board
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {acceptances && acceptances.length > 0 ? (
          <ul className="divide-y divide-border">
            {acceptances.map((a) => {
              const questObj = Array.isArray(a.quest) ? a.quest[0] : a.quest;
              const questTitle = questObj?.title;
              const questId = questObj?.id;
              return (
                <li key={a.id}>
                  <Link
                    href={questId ? `/student/my-quests/${questId}` : '/student/quests'}
                    className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {questTitle ?? 'Untitled quest'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                        {a.quest_type ?? 'quest'}
                      </p>
                    </div>
                    <QuestStatusChip
                      status={a.status ?? 'enrolled'}
                      className="shrink-0"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            You haven&apos;t accepted any quests yet.{' '}
            <Link
              href="/student/quests"
              className="font-medium text-primary hover:underline"
            >
              Browse the board →
            </Link>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <EnableNotificationsButton />
      </section>
    </div>
  );
}

