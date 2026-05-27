import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ArrowRight, BookOpen, Target, Trophy } from 'lucide-react';
import { ReviewLauncher } from '@/components/review-launcher';
import { EnableNotificationsButton } from '@/components/enable-notifications-button';
import { StatCard } from '@/components/stat-card';
import { Progress } from '@/components/ui/progress';
import { rankName, rankProgress, RANKS } from '@/lib/ranks';
import { cn } from '@/lib/utils';

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
    .select('full_name, current_rank, xp_total')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  const nowIso = new Date().toISOString();
  const [
    { count: dueCountRaw },
    { data: nextRow },
    { count: activeQuestsRaw },
    { data: acceptances },
    { count: aheadCount },
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
      .gt('xp_total', profile.xp_total ?? 0),
  ]);

  const dueCount = dueCountRaw ?? 0;
  const nextDueAt = nextRow?.due_at ?? null;
  const activeQuests = activeQuestsRaw ?? 0;
  const leaderboardPosition = (aheadCount ?? 0) + 1;

  const tier = profile.current_rank ?? 1;
  const currentRankName = rankName(tier);
  const xp = profile.xp_total ?? 0;
  const nextRank = RANKS[tier];
  const progress = rankProgress(xp, tier);
  const xpToNext = nextRank ? Math.max(0, nextRank.minXp - xp) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile.full_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {currentRankName} · {xp.toLocaleString()} XP
          {nextRank ? (
            <>
              {' '}
              · {xpToNext.toLocaleString()} XP to {rankName(tier + 1)}
            </>
          ) : (
            <> · Top rank reached</>
          )}
        </p>
        <Progress
          value={Math.round(progress * 100)}
          className="mt-4 max-w-xl"
        />
      </header>

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

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold">Today&apos;s review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {dueCount > 0
                ? `${dueCount} ${dueCount === 1 ? 'card is' : 'cards are'} due — keep your momentum.`
                : nextDueAt
                  ? 'Nothing due right now. Check back soon.'
                  : 'No cards unlocked yet.'}
            </p>
          </div>
          <ReviewLauncher dueCount={dueCount} nextDueAt={nextDueAt} />
        </div>
      </section>

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
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                        statusToneClasses(a.status),
                      )}
                    >
                      {a.status}
                    </span>
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

function statusToneClasses(status: string | null): string {
  switch (status) {
    case 'active':
      return 'bg-primary/10 text-primary';
    case 'submitted':
      return 'bg-amber-100 text-amber-900';
    case 'enrolled':
      return 'bg-muted text-muted-foreground';
    case 'passed':
      return 'bg-primary/15 text-primary';
    case 'failed':
      return 'bg-destructive/10 text-destructive';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
