import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
      <main className="container mx-auto max-w-3xl p-6">
        <Link
          href="/student"
          className="mb-4 inline-block text-sm text-blue-600 hover:underline"
        >
          ← Home
        </Link>
        <h1 className="text-3xl font-bold">Quests</h1>
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-slate-600">
            You&apos;re not enrolled in a class yet. Ask your teacher to add you.
          </CardContent>
        </Card>
      </main>
    );
  }

  const nowIso = new Date().toISOString();

  // All open, non-expired quests visible to this student (RLS scopes by class).
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

  // Global "you're busy" state. Filter by quest_type so that having an active
  // solo doesn't block coop enrollment (and vice versa).
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

  // A coop quest is hidden from this student's board only if matchmaking has
  // already run for THEIR class. Matchmaking in other classes does not block.
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
      return <span className="text-xs text-slate-500">Already accepted</span>;
    }
    if (
      ownAcceptance?.status === 'passed' ||
      ownAcceptance?.status === 'failed'
    ) {
      return <span className="text-xs text-slate-500">Already done</span>;
    }
    if (hasActiveSoloElsewhere) {
      return (
        <span className="text-xs text-slate-500">
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
      return <span className="text-xs text-slate-500">Already done</span>;
    }
    if (ownAcceptance?.status === 'enrolled') {
      return (
        <div className="flex flex-col items-end gap-1">
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            Enrolled
          </span>
          <QuestActionButton variant="unenroll-coop" questId={q.id} />
        </div>
      );
    }
    if (hasActiveOrEnrolledCoopElsewhere) {
      return (
        <span className="text-xs text-slate-500">
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
    <main className="container mx-auto max-w-3xl p-6">
      <Link
        href="/student"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Home
      </Link>
      <h1 className="mb-2 text-3xl font-bold">Quests</h1>
      <p className="mb-6 text-sm text-slate-600">
        Solo quests are work you do on your own. Co-op quests collect
        enrollments and then form teams at the matchmaking deadline.
      </p>

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900">
            Solo quests
          </h2>
          {soloQuests.length === 0 ? (
            <p className="text-sm text-slate-500">No solo quests right now.</p>
          ) : (
            <div className="space-y-3">
              {soloQuests.map((q) => (
                <Card key={q.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/student/quests/${q.id}`}>
                          <CardTitle className="truncate hover:text-blue-600">
                            {q.title}
                          </CardTitle>
                        </Link>
                        <CardDescription className="pt-1 text-xs">
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
                        </CardDescription>
                      </div>
                      <div className="shrink-0">{renderActionForSolo(q)}</div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900">
            Co-op quests
          </h2>
          {coopQuests.length === 0 ? (
            <p className="text-sm text-slate-500">No co-op quests right now.</p>
          ) : (
            <div className="space-y-3">
              {coopQuests.map((q) => (
                <Card key={q.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/student/quests/${q.id}`}>
                          <CardTitle className="truncate hover:text-blue-600">
                            {q.title}
                          </CardTitle>
                        </Link>
                        <CardDescription className="pt-1 text-xs">
                          +{q.xp_reward} XP · teams up to {q.max_team_size}
                          {' · '}
                          {enrolledCount(q)} enrolled
                          {q.expires_at && (
                            <>
                              {' · matchmaking '}
                              <LiveCountdown targetIso={q.expires_at} />
                            </>
                          )}
                        </CardDescription>
                      </div>
                      <div className="shrink-0">{renderActionForCoop(q)}</div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
