import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronDown, Scroll, Sparkles, Sword, Trophy, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { SectionHeader } from '@/components/section-header';
import { QuestStatusChip } from '@/components/status-chip';
import {
  ToggleChipGroup,
  type ToggleChipOption,
} from '@/components/toggle-chip-group';
import { LiveCountdown } from './countdown';
import { QuestActionButton } from './accept-button';

export const dynamic = 'force-dynamic';

type MineBucket =
  | 'in_progress'
  | 'enrolled'
  | 'awaiting_review'
  | 'resubmit_needed';

const MINE_ORDER: MineBucket[] = [
  'resubmit_needed',
  'in_progress',
  'awaiting_review',
  'enrolled',
];

const NEW_BADGE_DAYS = 7;

type FilterType = 'all' | 'solo' | 'coop';

function isFilterType(v: string | undefined): v is FilterType {
  return v === 'all' || v === 'solo' || v === 'coop';
}

export default async function StudentQuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const filter: FilterType = isFilterType(type) ? type : 'all';

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('class_id')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/login');

  if (!profile.class_id) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader title="Quests" />
        <EmptyState
          title="Not enrolled in a class yet"
          description="Ask your teacher to add you, then come back to see what's open."
        />
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const newCutoffIso = new Date(
    now - NEW_BADGE_DAYS * 86_400_000,
  ).toISOString();

  const [
    { data: boardQuests },
    { data: myAcceptances },
    { data: myCompleted },
  ] = await Promise.all([
    supabase
      .from('quests')
      .select(
        `
          id, title, quest_type, xp_reward, expires_at, closed_at, max_team_size, created_at,
          quest_acceptances(id, student_id, status, quest_type, instance_id),
          coop_quest_instances(id, class_id)
        `
      )
      .neq('quest_type', 'daily_quiz')
      .is('closed_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: false }),
    supabase
      .from('quest_acceptances')
      .select(
        `
          id, status, instance_id, accepted_at,
          quest:quest_id(id, title, quest_type, xp_reward)
        `
      )
      .eq('student_id', user.id)
      .in('status', ['active', 'enrolled'])
      .order('accepted_at', { ascending: false }),
    supabase
      .from('quest_acceptances')
      .select(
        `
          id, completed_at, accepted_at,
          quest:quest_id(id, title, quest_type, xp_reward)
        `
      )
      .eq('student_id', user.id)
      .eq('status', 'passed')
      .order('completed_at', { ascending: false, nullsFirst: false }),
  ]);

  // --- "Mine" enrichment: bucket each acceptance by latest submission state.
  const acceptanceIds = (myAcceptances ?? []).map((a) => a.id);
  const instanceIds = (myAcceptances ?? [])
    .map((a) => a.instance_id)
    .filter((x): x is string => x != null);

  let instanceStatusById = new Map<string, string>();
  if (instanceIds.length > 0) {
    const { data: instances } = await supabase
      .from('coop_quest_instances')
      .select('id, status')
      .in('id', instanceIds);
    instanceStatusById = new Map(
      (instances ?? []).map((i) => [i.id, i.status])
    );
  }

  const latestByAcceptance = new Map<string, string>();
  const latestByInstance = new Map<string, string>();
  if (acceptanceIds.length > 0 || instanceIds.length > 0) {
    const { data: subs } = await supabase
      .from('quest_submissions')
      .select('status, acceptance_id, instance_id, submitted_at')
      .order('submitted_at', { ascending: false });

    for (const s of subs ?? []) {
      if (s.acceptance_id && !latestByAcceptance.has(s.acceptance_id)) {
        latestByAcceptance.set(s.acceptance_id, s.status);
      }
      if (s.instance_id && !latestByInstance.has(s.instance_id)) {
        latestByInstance.set(s.instance_id, s.status);
      }
    }
  }

  type MineItem = {
    acceptanceId: string;
    questId: string;
    title: string;
    questType: string;
    xpReward: number;
    bucket: MineBucket;
  };

  const mine: MineItem[] = (myAcceptances ?? [])
    .map((a): MineItem | null => {
      const quest = a.quest as
        | {
            id: string;
            title: string;
            quest_type: 'solo' | 'coop' | 'daily_quiz';
            xp_reward: number;
          }
        | null;
      if (!quest) return null;

      let bucket: MineBucket;
      if (a.status === 'enrolled') {
        bucket = 'enrolled';
      } else if (a.instance_id) {
        const instStatus = instanceStatusById.get(a.instance_id);
        const subStatus = latestByInstance.get(a.instance_id);
        if (instStatus === 'submitted' || subStatus === 'pending_review') {
          bucket = 'awaiting_review';
        } else if (subStatus === 'failed') {
          bucket = 'resubmit_needed';
        } else {
          bucket = 'in_progress';
        }
      } else {
        const subStatus = latestByAcceptance.get(a.id);
        if (subStatus === 'pending_review') bucket = 'awaiting_review';
        else if (subStatus === 'failed') bucket = 'resubmit_needed';
        else bucket = 'in_progress';
      }

      return {
        acceptanceId: a.id,
        questId: quest.id,
        title: quest.title,
        questType: quest.quest_type,
        xpReward: quest.xp_reward,
        bucket,
      };
    })
    .filter((x): x is MineItem => x !== null);

  // --- "Board" filtering: hide quests already accepted (any state),
  // hide quests already passed/failed by me, hide coop where this class
  // already has an instance.
  const allBoardAcceptances = (boardQuests ?? []).flatMap((q) =>
    (q.quest_acceptances ?? []).filter((a) => a.student_id === user.id)
  );
  const hasActiveSoloElsewhere = allBoardAcceptances.some(
    (a) => a.quest_type === 'solo' && a.status === 'active'
  );
  const hasActiveOrEnrolledCoopElsewhere = allBoardAcceptances.some(
    (a) =>
      a.quest_type === 'coop' &&
      (a.status === 'active' || a.status === 'enrolled')
  );

  // Quests this student has finished (passed) or actively been graded on (failed)
  // shouldn't appear on the available board — they live in the Completed
  // accordion at the bottom.
  const myUserId = user.id;
  function ownTerminalStatus(q: { quest_acceptances?: { student_id: string; status: string }[] }) {
    const own = (q.quest_acceptances ?? []).find(
      (a) => a.student_id === myUserId,
    );
    return own?.status;
  }

  const visible = (boardQuests ?? []).filter((q) => {
    const ownStatus = ownTerminalStatus(q);
    // Hide quests this student already passed/failed.
    if (ownStatus === 'passed' || ownStatus === 'failed') return false;
    // For coop: hide if this class already had an instance form (existing rule).
    if (q.quest_type === 'coop') {
      const instances = q.coop_quest_instances ?? [];
      if (instances.some((i) => i.class_id === profile.class_id)) return false;
    }
    return true;
  });

  // Sort by closing-soonest first; null expires_at goes to the end.
  const availabilitySort = (
    a: (typeof visible)[number],
    b: (typeof visible)[number],
  ) => {
    if (a.expires_at && b.expires_at) {
      return a.expires_at.localeCompare(b.expires_at);
    }
    if (a.expires_at) return -1;
    if (b.expires_at) return 1;
    return b.created_at.localeCompare(a.created_at); // newest first as tiebreak
  };

  const soloQuests = visible
    .filter((q) => q.quest_type === 'solo')
    .sort(availabilitySort);
  const coopQuests = visible
    .filter((q) => q.quest_type === 'coop')
    .sort(availabilitySort);

  const showSoloBoard = filter === 'all' || filter === 'solo';
  const showCoopBoard = filter === 'all' || filter === 'coop';

  function isNewlyPublished(createdAtIso: string): boolean {
    return createdAtIso >= newCutoffIso;
  }

  function renderActionForSolo(q: typeof visible[number]) {
    const own = (q.quest_acceptances ?? []).find(
      (a) => a.student_id === user!.id
    );
    if (own?.status === 'active') {
      return (
        <span className="text-xs text-muted-foreground">Already accepted</span>
      );
    }
    if (hasActiveSoloElsewhere) {
      return (
        <span className="text-xs text-muted-foreground">
          Finish your active solo first
        </span>
      );
    }
    return <QuestActionButton variant="accept-solo" questId={q.id} />;
  }

  function renderActionForCoop(q: typeof visible[number]) {
    const own = (q.quest_acceptances ?? []).find(
      (a) => a.student_id === user!.id
    );
    if (own?.status === 'active') {
      return (
        <span className="text-xs text-muted-foreground">Already on a team</span>
      );
    }
    if (own?.status === 'enrolled') {
      return (
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          Enrolled
        </span>
      );
    }
    if (hasActiveOrEnrolledCoopElsewhere) {
      return (
        <span className="text-xs text-muted-foreground">
          You&apos;re busy with another co-op
        </span>
      );
    }
    return <QuestActionButton variant="enroll-coop" questId={q.id} />;
  }

  function enrolledCount(q: typeof visible[number]) {
    return (q.quest_acceptances ?? []).filter((a) => a.status === 'enrolled')
      .length;
  }

  // --- Completed accordion data
  type CompletedItem = {
    acceptanceId: string;
    questId: string;
    title: string;
    questType: 'solo' | 'coop' | 'daily_quiz';
    xpReward: number;
    completedAt: string | null;
  };
  const completed: CompletedItem[] = (myCompleted ?? [])
    .map((a): CompletedItem | null => {
      const q = a.quest as
        | {
            id: string;
            title: string;
            quest_type: 'solo' | 'coop' | 'daily_quiz';
            xp_reward: number;
          }
        | null;
      if (!q) return null;
      return {
        acceptanceId: a.id,
        questId: q.id,
        title: q.title,
        questType: q.quest_type,
        xpReward: q.xp_reward,
        completedAt: a.completed_at ?? a.accepted_at,
      };
    })
    .filter((x): x is CompletedItem => x !== null);
  const completedXp = completed.reduce((sum, c) => sum + c.xpReward, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Quests"
        subtitle="Solo quests are work you do on your own. Co-op quests collect enrollments and form teams at the matchmaking deadline."
      />

      {mine.length > 0 && (
        <section>
          <SectionHeader icon={Scroll} title="Your active quests" size="sm" />
          <ul className="space-y-2">
            {MINE_ORDER.flatMap((bucket) =>
              mine
                .filter((m) => m.bucket === bucket)
                .map((item) => {
                  const href =
                    item.bucket === 'enrolled'
                      ? `/student/quests/${item.questId}`
                      : `/student/my-quests/${item.questId}`;
                  // In-progress = actively being worked on right now, so it
                  // gets the rotating "comet" edge light to signal it's live.
                  const isUndergoing = item.bucket === 'in_progress';
                  return (
                    <li
                      key={item.acceptanceId}
                      className={cn(
                        'rounded-lg',
                        isUndergoing && 'rl-active-edge',
                      )}
                    >
                      <Link
                        href={href}
                        className="block rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.title}
                            </p>
                            <p className="mt-1 text-xs capitalize text-muted-foreground">
                              {item.questType} · +{item.xpReward} XP
                            </p>
                          </div>
                          <QuestStatusChip
                            status={item.bucket}
                            className="shrink-0"
                          />
                        </div>
                      </Link>
                    </li>
                  );
                })
            )}
          </ul>
        </section>
      )}

      {/* Available board */}
      <section>
        <SectionHeader
          title="Available"
          size="sm"
          actions={
            <ToggleChipGroup
              ariaLabel="Filter quests by type"
              current={filter}
              options={availabilityChipOptions(
                soloQuests.length,
                coopQuests.length,
              )}
            />
          }
        />

        {filter === 'all' &&
        soloQuests.length === 0 &&
        coopQuests.length === 0 ? (
          <EmptyState
            icon={Sword}
            title="No quests available right now"
            description="New quests appear here as your teacher publishes them. Check back later."
          />
        ) : (
          <>
        {showSoloBoard && (
          <div className="mb-6">
            <SectionHeader
              icon={Sword}
              title="Solo"
              size="xs"
              level={3}
              className="mb-2"
            />
            {soloQuests.length === 0 ? (
              <EmptyState
                icon={Sword}
                title="No solo quests right now"
                description="Check back later — new quests appear here when your teacher publishes them."
              />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {soloQuests.map((q) => (
                  <li key={q.id}>
                    <div className="flex items-start justify-between gap-4 p-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/student/quests/${q.id}`}
                            className="min-w-0 truncate text-sm font-medium hover:text-primary"
                          >
                            {q.title}
                          </Link>
                          {isNewlyPublished(q.created_at) && <NewBadge />}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          +{q.xp_reward} XP
                          {q.expires_at && (
                            <>
                              {' · '}
                              <LiveCountdown
                                targetIso={q.expires_at}
                                label="closes"
                              />
                            </>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0">{renderActionForSolo(q)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showCoopBoard && (
          <div>
            <SectionHeader
              icon={Users}
              title="Co-op"
              size="xs"
              level={3}
              className="mb-2"
            />
            {coopQuests.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No co-op quests right now"
                description="Co-op quests collect enrollments before matchmaking forms teams."
              />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {coopQuests.map((q) => (
                  <li key={q.id}>
                    <div className="flex items-start justify-between gap-4 p-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/student/quests/${q.id}`}
                            className="min-w-0 truncate text-sm font-medium hover:text-primary"
                          >
                            {q.title}
                          </Link>
                          {isNewlyPublished(q.created_at) && <NewBadge />}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          +{q.xp_reward} XP · teams up to {q.max_team_size}
                          {' · '}
                          {enrolledCount(q)} enrolled
                          {q.expires_at && (
                            <>
                              {' · matchmaking '}
                              <LiveCountdown targetIso={q.expires_at} />
                            </>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0">{renderActionForCoop(q)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
          </>
        )}
      </section>

      {/* Completed accordion */}
      {completed.length > 0 && (
        <section>
          <details className="group overflow-hidden rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold">
                  Completed
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {completed.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {completedXp.toLocaleString()} XP earned
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {completed.map((c) => (
                <li
                  key={c.acceptanceId}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <Link
                    href={`/student/quests/${c.questId}`}
                    className="min-w-0 truncate font-medium text-muted-foreground hover:text-foreground"
                  >
                    {c.title}
                  </Link>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{c.questType}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium tabular-nums text-emerald-900">
                      +{c.xpReward}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

function NewBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      New
    </span>
  );
}

function availabilityChipOptions(
  soloAvailable: number,
  coopAvailable: number,
): ToggleChipOption<FilterType>[] {
  return [
    {
      value: 'all',
      label: 'All',
      count: soloAvailable + coopAvailable,
      href: '/student/quests',
    },
    {
      value: 'solo',
      label: 'Solo',
      count: soloAvailable,
      href: '/student/quests?type=solo',
    },
    {
      value: 'coop',
      label: 'Co-op',
      count: coopAvailable,
      href: '/student/quests?type=coop',
    },
  ];
}
