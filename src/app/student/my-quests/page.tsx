import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

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

export default async function MyQuestsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Pull all the student's acceptances + their quest metadata. RLS scopes to
  // self. Sort newest first.
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

  // Resolve all instance statuses in one shot
  const instanceIds = (acceptances ?? [])
    .map((a) => a.instance_id)
    .filter((x): x is string => x != null);
  let instancesById = new Map<string, { id: string; status: string }>();
  if (instanceIds.length > 0) {
    const { data: instances } = await supabase
      .from('coop_quest_instances')
      .select('id, status')
      .in('id', instanceIds);
    instancesById = new Map(
      (instances ?? []).map((i) => [i.id, { id: i.id, status: i.status }])
    );
  }

  // Pull all submissions the student can read (RLS handles scoping). Latest
  // first per acceptance / instance.
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

  type Bucket =
    | 'in_progress'
    | 'enrolled'
    | 'awaiting_review'
    | 'resubmit_needed'
    | 'completed';

  type EnrichedAcceptance = {
    acceptanceId: string;
    quest: NonNullable<NonNullable<typeof acceptances>[number]['quest']>;
    bucket: Bucket;
    latestSubmittedAt: string | null;
    instanceStatus: string | null;
  };

  const enriched: EnrichedAcceptance[] = (acceptances ?? [])
    .map((a): EnrichedAcceptance | null => {
      // Quest is embedded as a single object (foreign key)
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

      const instanceStatus = a.instance_id
        ? (instancesById.get(a.instance_id)?.status ?? null)
        : null;

      // Determine bucket
      let bucket: Bucket;

      if (a.status === 'passed') {
        bucket = 'completed';
      } else if (a.status === 'enrolled') {
        bucket = 'enrolled';
      } else if (a.status === 'active') {
        // Solo path
        if (!a.instance_id) {
          const sub = latestByAcceptance.get(a.id);
          if (sub?.status === 'pending_review') bucket = 'awaiting_review';
          else if (sub?.status === 'failed') bucket = 'resubmit_needed';
          else bucket = 'in_progress';
        } else {
          // Coop path
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
        // 'submitted' or 'failed' status on the acceptance itself is unlikely
        // given the new RPC flow, but treat them as in_progress fallback.
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
      };
    })
    .filter((x): x is EnrichedAcceptance => x !== null);

  const sections: { title: string; bucket: Bucket; emptyText: string }[] = [
    {
      title: 'In progress',
      bucket: 'in_progress',
      emptyText: 'Nothing to work on right now.',
    },
    {
      title: 'Resubmit needed',
      bucket: 'resubmit_needed',
      emptyText: '',
    },
    {
      title: 'Awaiting review',
      bucket: 'awaiting_review',
      emptyText: '',
    },
    {
      title: 'Enrolled in co-op',
      bucket: 'enrolled',
      emptyText: '',
    },
    {
      title: 'Completed',
      bucket: 'completed',
      emptyText: '',
    },
  ];

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <Link
        href="/student"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Home
      </Link>
      <h1 className="mb-2 text-3xl font-bold">My Quests</h1>
      <p className="mb-6 text-sm text-slate-600">
        Everything you&apos;ve accepted or enrolled in.
      </p>

      <div className="space-y-8">
        {sections.map(({ title, bucket, emptyText }) => {
          const items = enriched.filter((e) => e.bucket === bucket);
          if (items.length === 0 && !emptyText) return null;
          return (
            <section key={bucket}>
              <h2 className="mb-3 border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900">
                {title} {items.length > 0 && `(${items.length})`}
              </h2>
              {items.length === 0 ? (
                <p className="text-sm text-slate-500">{emptyText}</p>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <Link
                      key={item.acceptanceId}
                      href={
                        item.bucket === 'enrolled'
                          ? `/student/quests/${item.quest.id}`
                          : `/student/my-quests/${item.quest.id}`
                      }
                    >
                      <Card className="transition-colors hover:bg-slate-50">
                        <CardHeader className="py-3">
                          <CardTitle className="text-base">
                            {item.quest.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2 pt-0 text-xs text-slate-500">
                          <span
                            className={`mr-2 inline-block rounded-full px-2 py-0.5 font-medium ${item.quest.quest_type === 'solo' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}
                          >
                            {item.quest.quest_type}
                          </span>
                          +{item.quest.xp_reward} XP
                          {item.latestSubmittedAt && (
                            <span>
                              {' · '}submitted {formatSaigon(item.latestSubmittedAt)}
                            </span>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {enriched.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-600">
              You haven&apos;t accepted any quests yet.{' '}
              <Link
                href="/student/quests"
                className="text-blue-600 hover:underline"
              >
                Browse the quest board →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
