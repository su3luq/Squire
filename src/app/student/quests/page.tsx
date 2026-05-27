import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Scroll, Sword, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { LiveCountdown } from './countdown';
import { QuestActionButton } from './accept-button';

export const dynamic = 'force-dynamic';

type MineBucket =
  | 'in_progress'
  | 'enrolled'
  | 'awaiting_review'
  | 'resubmit_needed';

const BUCKET_TONE: Record<MineBucket, string> = {
  in_progress: 'bg-primary/10 text-primary',
  enrolled: 'bg-muted text-muted-foreground',
  awaiting_review: 'bg-amber-100 text-amber-900',
  resubmit_needed: 'bg-destructive/10 text-destructive',
};

const BUCKET_LABEL: Record<MineBucket, string> = {
  in_progress: 'In progress',
  enrolled: 'Enrolled',
  awaiting_review: 'Awaiting review',
  resubmit_needed: 'Resubmit needed',
};

const MINE_ORDER: MineBucket[] = [
  'resubmit_needed',
  'in_progress',
  'awaiting_review',
  'enrolled',
];

export default async function StudentQuestsPage() {
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

  const nowIso = new Date().toISOString();

  const [
    { data: boardQuests },
    { data: myAcceptances },
  ] = await Promise.all([
    supabase
      .from('quests')
      .select(
        `
          id, title, quest_type, xp_reward, expires_at, closed_at, max_team_size,
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

  // --- "Board" filtering: hide quests already accepted, hide coop where
  // matchmaking already ran for this student's class. Track availability
  // flags for action buttons.
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

  const visible = (boardQuests ?? []).filter((q) => {
    if (q.quest_type !== 'coop') return true;
    const instances = q.coop_quest_instances ?? [];
    return !instances.some((i) => i.class_id === profile.class_id);
  });

  const soloQuests = visible.filter((q) => q.quest_type === 'solo');
  const coopQuests = visible.filter((q) => q.quest_type === 'coop');

  function renderActionForSolo(q: typeof visible[number]) {
    const own = (q.quest_acceptances ?? []).find(
      (a) => a.student_id === user!.id
    );
    if (own?.status === 'active') {
      return (
        <span className="text-xs text-muted-foreground">Already accepted</span>
      );
    }
    if (own?.status === 'passed' || own?.status === 'failed') {
      return (
        <span className="text-xs text-muted-foreground">Already done</span>
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
    if (own?.status === 'passed' || own?.status === 'active') {
      return (
        <span className="text-xs text-muted-foreground">Already done</span>
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

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Quests"
        subtitle="Solo quests are work you do on your own. Co-op quests collect enrollments and form teams at the matchmaking deadline."
      />

      {mine.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Scroll className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Your active quests
            </h2>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {MINE_ORDER.flatMap((bucket) =>
              mine
                .filter((m) => m.bucket === bucket)
                .map((item) => {
                  const href =
                    item.bucket === 'enrolled'
                      ? `/student/quests/${item.questId}`
                      : `/student/my-quests/${item.questId}`;
                  return (
                    <li key={item.acceptanceId}>
                      <Link
                        href={href}
                        className="block p-5 transition-colors hover:bg-muted/40"
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
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                              BUCKET_TONE[item.bucket]
                            )}
                          >
                            {BUCKET_LABEL[item.bucket]}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })
            )}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sword className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Solo board
          </h2>
        </div>
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
                    <Link
                      href={`/student/quests/${q.id}`}
                      className="block truncate text-sm font-medium hover:text-primary"
                    >
                      {q.title}
                    </Link>
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
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Co-op board
          </h2>
        </div>
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
                    <Link
                      href={`/student/quests/${q.id}`}
                      className="block truncate text-sm font-medium hover:text-primary"
                    >
                      {q.title}
                    </Link>
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
      </section>
    </div>
  );
}
