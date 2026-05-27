import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Scroll } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

function formatSaigon(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAIGON_TZ,
  }).format(new Date(iso));
}

type Bucket =
  | 'in_progress'
  | 'enrolled'
  | 'awaiting_review'
  | 'resubmit_needed'
  | 'completed';

const BUCKET_TONE: Record<Bucket, string> = {
  in_progress: 'bg-primary/10 text-primary',
  enrolled: 'bg-muted text-muted-foreground',
  awaiting_review: 'bg-amber-100 text-amber-900',
  resubmit_needed: 'bg-destructive/10 text-destructive',
  completed: 'bg-primary/15 text-primary',
};

const BUCKET_LABEL: Record<Bucket, string> = {
  in_progress: 'In progress',
  enrolled: 'Enrolled',
  awaiting_review: 'Awaiting review',
  resubmit_needed: 'Resubmit needed',
  completed: 'Completed',
};

export default async function MyQuestsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: acceptances } = await supabase
    .from('quest_acceptances')
    .select(
      `
        id, status, instance_id, accepted_at, completed_at,
        quest:quest_id(id, title, quest_type, xp_reward, expires_at)
      `
    )
    .eq('student_id', user.id)
    .order('accepted_at', { ascending: false });

  const instanceIds = (acceptances ?? [])
    .map((a) => a.instance_id)
    .filter((x): x is string => x != null);
  let instancesById = new Map<
    string,
    { id: string; status: string; team_number: number | null }
  >();
  if (instanceIds.length > 0) {
    const { data: instances } = await supabase
      .from('coop_quest_instances')
      .select('id, status, team_number')
      .in('id', instanceIds);
    instancesById = new Map(
      (instances ?? []).map((i) => [
        i.id,
        { id: i.id, status: i.status, team_number: i.team_number },
      ])
    );
  }

  const acceptanceIds = (acceptances ?? []).map((a) => a.id);
  const latestByAcceptance = new Map<
    string,
    { id: string; status: string; submitted_at: string }
  >();
  const latestByInstance = new Map<
    string,
    { id: string; status: string; submitted_at: string }
  >();
  if (acceptanceIds.length > 0 || instanceIds.length > 0) {
    const { data: subs } = await supabase
      .from('quest_submissions')
      .select('id, status, submitted_at, acceptance_id, instance_id')
      .order('submitted_at', { ascending: false });

    for (const s of subs ?? []) {
      if (s.acceptance_id && !latestByAcceptance.has(s.acceptance_id)) {
        latestByAcceptance.set(s.acceptance_id, {
          id: s.id,
          status: s.status,
          submitted_at: s.submitted_at,
        });
      }
      if (s.instance_id && !latestByInstance.has(s.instance_id)) {
        latestByInstance.set(s.instance_id, {
          id: s.id,
          status: s.status,
          submitted_at: s.submitted_at,
        });
      }
    }
  }

  type EnrichedAcceptance = {
    acceptanceId: string;
    quest: NonNullable<NonNullable<typeof acceptances>[number]['quest']>;
    bucket: Bucket;
    latestSubmittedAt: string | null;
    instanceStatus: string | null;
    teamNumber: number | null;
  };

  const enriched: EnrichedAcceptance[] = (acceptances ?? [])
    .map((a): EnrichedAcceptance | null => {
      const quest = a.quest as
        | {
            id: string;
            title: string;
            quest_type: 'solo' | 'coop' | 'daily_quiz';
            xp_reward: number;
            expires_at: string | null;
          }
        | null;
      if (!quest) return null;

      const instance = a.instance_id
        ? (instancesById.get(a.instance_id) ?? null)
        : null;
      const instanceStatus = instance?.status ?? null;
      const teamNumber = instance?.team_number ?? null;

      let bucket: Bucket;

      if (a.status === 'passed') {
        bucket = 'completed';
      } else if (a.status === 'enrolled') {
        bucket = 'enrolled';
      } else if (a.status === 'active') {
        if (!a.instance_id) {
          const sub = latestByAcceptance.get(a.id);
          if (sub?.status === 'pending_review') bucket = 'awaiting_review';
          else if (sub?.status === 'failed') bucket = 'resubmit_needed';
          else bucket = 'in_progress';
        } else {
          const sub = latestByInstance.get(a.instance_id);
          if (instanceStatus === 'submitted' || sub?.status === 'pending_review') {
            bucket = 'awaiting_review';
          } else if (sub?.status === 'failed') {
            bucket = 'resubmit_needed';
          } else {
            bucket = 'in_progress';
          }
        }
      } else {
        bucket = 'in_progress';
      }

      const latestSub = a.instance_id
        ? latestByInstance.get(a.instance_id)
        : latestByAcceptance.get(a.id);

      return {
        acceptanceId: a.id,
        quest,
        bucket,
        latestSubmittedAt: latestSub?.submitted_at ?? null,
        instanceStatus,
        teamNumber,
      };
    })
    .filter((x): x is EnrichedAcceptance => x !== null);

  const sectionOrder: Bucket[] = [
    'in_progress',
    'resubmit_needed',
    'awaiting_review',
    'enrolled',
    'completed',
  ];

  if (enriched.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="My quests"
          subtitle="Everything you've accepted or enrolled in."
        />
        <EmptyState
          icon={Scroll}
          title="No quests yet"
          description="Browse the quest board to find solo and co-op work."
          action={
            <Link
              href="/student/quests"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Browse the board →
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="My quests"
        subtitle="Everything you've accepted or enrolled in."
      />

      {sectionOrder.map((bucket) => {
        const items = enriched.filter((e) => e.bucket === bucket);
        if (items.length === 0) return null;
        return (
          <section key={bucket}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {BUCKET_LABEL[bucket]}
              </h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {items.length}
              </span>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {items.map((item) => (
                <li key={item.acceptanceId}>
                  <Link
                    href={
                      item.bucket === 'enrolled'
                        ? `/student/quests/${item.quest.id}`
                        : `/student/my-quests/${item.quest.id}`
                    }
                    className="block p-5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.quest.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">
                            {item.quest.quest_type}
                          </span>
                          <span>·</span>
                          <span>+{item.quest.xp_reward} XP</span>
                          {item.teamNumber != null && (
                            <>
                              <span>·</span>
                              <span>Team {item.teamNumber}</span>
                            </>
                          )}
                          {item.latestSubmittedAt && (
                            <>
                              <span>·</span>
                              <span>
                                submitted {formatSaigon(item.latestSubmittedAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                          BUCKET_TONE[bucket]
                        )}
                      >
                        {BUCKET_LABEL[bucket]}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
