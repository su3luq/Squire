import Link from 'next/link';
import { Plus, Sword } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatusChip } from '@/components/status-chip';
import { formatLongCountdown } from './indicator';

export default async function QuestsListPage() {
  const supabase = await createClient();

  const { data: quests } = await supabase
    .from('quests')
    .select(
      `
        id, title, quest_type, xp_reward, expires_at, closed_at, max_team_size, created_at,
        quest_acceptances(id, status, instance_id),
        coop_quest_instances(id, status, class_id)
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

  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const now = Date.now();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Quests"
        subtitle="Quests are visible to every class. For co-op, matchmaking forms teams inside each class independently at the deadline."
        actions={
          <Link
            href="/teacher/quests/new"
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus className="h-4 w-4" />
            New quest
          </Link>
        }
      />

      {!quests || quests.length === 0 ? (
        <EmptyState
          icon={Sword}
          title="No quests yet"
          description="Create your first quest to give students something to work on."
          action={
            <Link href="/teacher/quests/new" className={buttonVariants()}>
              Create a quest
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {quests.map((q) => {
            const acceptances = q.quest_acceptances ?? [];
            const instances = q.coop_quest_instances ?? [];
            const pendingCount = pendingByQuest.get(q.id) ?? 0;
            const isClosed = q.closed_at !== null;
            const isExpired =
              q.expires_at !== null && new Date(q.expires_at).getTime() <= now;

            let indicator: React.ReactNode = null;
            if (q.quest_type === 'solo') {
              const active = acceptances.filter(
                (a) => a.status === 'active'
              ).length;
              indicator = <span>{active} active across all classes</span>;
            } else {
              const matchmakingDone = instances.length > 0;
              if (matchmakingDone) {
                const teamsByClass = new Map<string, number>();
                for (const inst of instances) {
                  teamsByClass.set(
                    inst.class_id,
                    (teamsByClass.get(inst.class_id) ?? 0) + 1
                  );
                }
                const totalTeams = Array.from(teamsByClass.values()).reduce(
                  (a, b) => a + b,
                  0
                );
                indicator = (
                  <span>
                    {totalTeams} {totalTeams === 1 ? 'team' : 'teams'} across{' '}
                    {teamsByClass.size}{' '}
                    {teamsByClass.size === 1 ? 'class' : 'classes'}
                  </span>
                );
              } else {
                const enrolled = acceptances.filter(
                  (a) => a.status === 'enrolled'
                ).length;
                if (q.expires_at) {
                  const target = new Date(q.expires_at).getTime();
                  const cd = formatLongCountdown(target, now);
                  indicator = (
                    <span>
                      {enrolled} enrolled · matchmaking{' '}
                      {cd === 'now' ? 'pending' : `in ${cd}`}
                    </span>
                  );
                } else {
                  indicator = <span>{enrolled} enrolled</span>;
                }
              }
            }

            return (
              <li key={q.id}>
                <Link
                  href={`/teacher/quests/${q.id}`}
                  className="block p-5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{q.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <StatusChip tone="muted" capitalize>{q.quest_type}</StatusChip>
                        <span>+{q.xp_reward} XP</span>
                        <span>·</span>
                        {indicator}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {isClosed && (
                        <StatusChip tone="muted">Closed</StatusChip>
                      )}
                      {!isClosed && isExpired && q.quest_type === 'solo' && (
                        <StatusChip tone="warn">Expired</StatusChip>
                      )}
                      {pendingCount > 0 && (
                        <StatusChip tone="warn"><span className="tabular-nums">{pendingCount}</span> to review</StatusChip>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
