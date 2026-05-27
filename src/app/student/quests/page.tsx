import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sword, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { LiveCountdown } from './countdown';
import { QuestActionButton } from './accept-button';

export const dynamic = 'force-dynamic';

export default async function StudentQuestsBoardPage() {
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

  const { data: quests } = await supabase
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
    .order('created_at', { ascending: false });

  const allAcceptances = (quests ?? []).flatMap((q) =>
    (q.quest_acceptances ?? []).filter((a) => a.student_id === user.id)
  );
  const hasActiveSoloElsewhere = allAcceptances.some(
    (a) => a.quest_type === 'solo' && a.status === 'active'
  );
  const hasActiveOrEnrolledCoopElsewhere = allAcceptances.some(
    (a) =>
      a.quest_type === 'coop' &&
      (a.status === 'active' || a.status === 'enrolled')
  );

  const visible = (quests ?? []).filter((q) => {
    if (q.quest_type !== 'coop') return true;
    const instances = q.coop_quest_instances ?? [];
    const matchmakingDoneForMyClass = instances.some(
      (i) => i.class_id === profile.class_id
    );
    return !matchmakingDoneForMyClass;
  });

  const soloQuests = visible.filter((q) => q.quest_type === 'solo');
  const coopQuests = visible.filter((q) => q.quest_type === 'coop');

  function renderActionForSolo(q: typeof visible[number]) {
    const ownAcceptance = (q.quest_acceptances ?? []).find(
      (a) => a.student_id === user!.id
    );
    if (ownAcceptance?.status === 'active') {
      return (
        <span className="text-xs text-muted-foreground">Already accepted</span>
      );
    }
    if (
      ownAcceptance?.status === 'passed' ||
      ownAcceptance?.status === 'failed'
    ) {
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
    const ownAcceptance = (q.quest_acceptances ?? []).find(
      (a) => a.student_id === user!.id
    );
    if (
      ownAcceptance?.status === 'passed' ||
      ownAcceptance?.status === 'active'
    ) {
      return (
        <span className="text-xs text-muted-foreground">Already done</span>
      );
    }
    if (ownAcceptance?.status === 'enrolled') {
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

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sword className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Solo
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
            Co-op
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
