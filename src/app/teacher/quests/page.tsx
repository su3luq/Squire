import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatLongCountdown } from './indicator';

export default async function QuestsListPage() {
  const supabase = await createClient();

  const { data: quests } = await supabase
    .from('quests')
    .select(
      `
        id, title, quest_type, xp_reward, expires_at, closed_at, max_team_size, created_at, class_id,
        classes(name),
        quest_acceptances(id, status, instance_id),
        coop_quest_instances(id, status)
      `
    )
    .neq('quest_type', 'daily_quiz')
    .order('created_at', { ascending: false });

  const questIds = (quests ?? []).map((q) => q.id);

  const pendingByQuest = new Map<string, number>();
  if (questIds.length > 0) {
    const { data: pendingRows } = await supabase
      .from('quest_submissions')
      .select(
        `
          id,
          quest_acceptances:acceptance_id ( quest_id ),
          coop_quest_instances:instance_id ( quest_id )
        `
      )
      .eq('status', 'pending_review');

    for (const row of pendingRows ?? []) {
      const acceptanceRel = row.quest_acceptances as { quest_id: string } | null;
      const instanceRel = row.coop_quest_instances as { quest_id: string } | null;
      const qid = acceptanceRel?.quest_id ?? instanceRel?.quest_id;
      if (qid) pendingByQuest.set(qid, (pendingByQuest.get(qid) ?? 0) + 1);
    }
  }

  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request; "now" is deliberate.
  const now = Date.now();

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/teacher"
            className="mb-2 inline-block text-sm text-blue-600 hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-bold">Quests</h1>
        </div>
        <Link href="/teacher/quests/new" className={buttonVariants()}>
          New quest
        </Link>
      </div>

      <p className="mb-6 text-xs text-slate-500">
        Solo quests can be accepted by individual students. Co-op quests collect
        enrollments until the matchmaking deadline, then form teams.
      </p>

      {!quests || quests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">No quests yet.</p>
            <p className="mt-2 text-sm text-slate-500">
              Create your first quest to give students something to work on.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quests.map((q) => {
            const acceptances = q.quest_acceptances ?? [];
            const instances = q.coop_quest_instances ?? [];
            const pendingCount = pendingByQuest.get(q.id) ?? 0;
            const isClosed = q.closed_at !== null;
            const isExpired =
              q.expires_at !== null && new Date(q.expires_at).getTime() <= now;

            let indicator: React.ReactNode = null;
            if (q.quest_type === 'solo') {
              const active = acceptances.filter((a) => a.status === 'active').length;
              indicator = <span>{active} active</span>;
            } else {
              const matchmakingDone = instances.length > 0;
              if (matchmakingDone) {
                const sizes = instances
                  .filter((i) => i.status !== 'disbanded')
                  .map(
                    (i) =>
                      acceptances.filter(
                        (a) => a.instance_id === i.id && a.status !== 'disbanded'
                      ).length
                  )
                  .filter((n) => n > 0);
                if (sizes.length === 0) {
                  indicator = <span className="text-slate-500">All teams disbanded</span>;
                } else {
                  const counts = sizes.reduce<Map<number, number>>((acc, n) => {
                    acc.set(n, (acc.get(n) ?? 0) + 1);
                    return acc;
                  }, new Map());
                  const parts = Array.from(counts.entries())
                    .sort((a, b) => b[0] - a[0])
                    .map(([size, n]) => `${n} team${n === 1 ? '' : 's'} of ${size}`);
                  indicator = <span>{parts.join(', ')}</span>;
                }
              } else {
                const enrolled = acceptances.filter((a) => a.status === 'enrolled').length;
                if (q.expires_at) {
                  const target = new Date(q.expires_at).getTime();
                  const cd = formatLongCountdown(target, now);
                  indicator = (
                    <span>
                      {enrolled} enrolled · matchmaking {cd === 'now' ? 'pending' : `in ${cd}`}
                    </span>
                  );
                } else {
                  indicator = <span>{enrolled} enrolled</span>;
                }
              }
            }

            return (
              <Link key={q.id} href={`/teacher/quests/${q.id}`}>
                <Card className="transition-colors hover:bg-slate-50">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate">{q.title}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-2 pt-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${q.quest_type === 'solo' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}
                          >
                            {q.quest_type}
                          </span>
                          <span className="text-xs text-slate-500">
                            {q.classes?.name ?? 'Unknown class'} · +{q.xp_reward} XP
                          </span>
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isClosed && (
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                            Closed
                          </span>
                        )}
                        {!isClosed && isExpired && q.quest_type === 'solo' && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                            Expired
                          </span>
                        )}
                        {pendingCount > 0 && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            {pendingCount} to review
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600">{indicator}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
