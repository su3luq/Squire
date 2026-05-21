import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { formatLongCountdown } from '../indicator';
import { EditQuestForm } from './edit-quest-form';
import { DeleteQuestButton } from './delete-quest-button';
import { CloseQuestButton } from './close-quest-button';
import { DisbandInstanceButton } from './disband-instance-button';

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

function formatSaigon(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAIGON_TZ,
  }).format(new Date(iso));
}

export default async function QuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quest } = await supabase
    .from('quests')
    .select('*')
    .eq('id', id)
    .single();

  if (!quest) notFound();

  // All non-archived classes (used to label per-class groupings)
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');

  const classNameById = new Map<string, string>(
    (classes ?? []).map((c) => [c.id, c.name])
  );

  const { data: acceptances } = await supabase
    .from('quest_acceptances')
    .select(
      'id, status, instance_id, accepted_at, completed_at, profiles:student_id(id, full_name, class_id)'
    )
    .eq('quest_id', id)
    .order('accepted_at', { ascending: false });

  const { data: instances } = await supabase
    .from('coop_quest_instances')
    .select('id, status, class_id, started_at, submitted_at, reviewed_at')
    .eq('quest_id', id)
    .order('started_at', { ascending: true });

  const { data: submissions } = await supabase
    .from('quest_submissions')
    .select(
      `
        id, status, submitted_at, reviewed_at, word_count, acceptance_id, instance_id, submitted_by,
        profiles:submitted_by(id, full_name, class_id),
        quest_acceptances:acceptance_id(quest_id),
        coop_quest_instances:instance_id(quest_id, class_id)
      `
    )
    .or(
      `quest_acceptances.quest_id.eq.${id},coop_quest_instances.quest_id.eq.${id}`
    )
    .order('submitted_at', { ascending: false });

  const filteredSubmissions = (submissions ?? []).filter((s) => {
    const a = s.quest_acceptances as { quest_id: string } | null;
    const i = s.coop_quest_instances as { quest_id: string } | null;
    return a?.quest_id === id || i?.quest_id === id;
  });

  const pendingCount = filteredSubmissions.filter(
    (s) => s.status === 'pending_review'
  ).length;
  const isClosed = quest.closed_at !== null;
  const matchmakingDone = (instances ?? []).length > 0;
  const hasAnyAcceptance = (acceptances ?? []).length > 0;
  const lockCoopFields = quest.quest_type === 'coop' && hasAnyAcceptance;
  const isExpired =
    quest.expires_at !== null &&
    // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request; "now" is deliberate.
    new Date(quest.expires_at).getTime() <= Date.now();

  // Group acceptances by class (for coop pre-matchmaking + general overview)
  type AcceptanceRow = NonNullable<typeof acceptances>[number];
  const acceptancesByClass = new Map<string, AcceptanceRow[]>();
  for (const a of acceptances ?? []) {
    const profile = a.profiles as { class_id: string | null } | null;
    const cid = profile?.class_id ?? '__unknown__';
    if (!acceptancesByClass.has(cid)) acceptancesByClass.set(cid, []);
    acceptancesByClass.get(cid)!.push(a);
  }

  // Group instances by class
  type InstanceRow = NonNullable<typeof instances>[number];
  const instancesByClass = new Map<string, InstanceRow[]>();
  for (const inst of instances ?? []) {
    if (!instancesByClass.has(inst.class_id))
      instancesByClass.set(inst.class_id, []);
    instancesByClass.get(inst.class_id)!.push(inst);
  }

  function classLabel(classId: string): string {
    if (classId === '__unknown__') return 'Unassigned';
    return classNameById.get(classId) ?? 'Unknown class';
  }

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <Link
        href="/teacher/quests"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Quests
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{quest.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${quest.quest_type === 'solo' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}
            >
              {quest.quest_type}
            </span>
            <span>+{quest.xp_reward} XP</span>
            {quest.quest_type === 'coop' && quest.max_team_size && (
              <>
                <span>·</span>
                <span>max team size {quest.max_team_size}</span>
              </>
            )}
            {isClosed && (
              <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                Closed
              </span>
            )}
            {!isClosed && isExpired && quest.quest_type === 'solo' && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                Expired
              </span>
            )}
          </div>
          {quest.expires_at && (
            <p className="mt-1 text-xs text-slate-500">
              {quest.quest_type === 'coop' ? 'Matchmaking' : 'Expires'} at{' '}
              {formatSaigon(quest.expires_at)} (Saigon)
              {!isExpired &&
                ` · ${formatLongCountdown(new Date(quest.expires_at).getTime())}`}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownRenderer
              source={quest.description ?? ''}
              emptyPlaceholder="No description yet."
            />
          </CardContent>
        </Card>

        {/* Acceptances / enrollments — grouped by class */}
        <Card>
          <CardHeader>
            <CardTitle>
              {quest.quest_type === 'coop' ? 'Enrollments & members' : 'Acceptances'} (
              {(acceptances ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(acceptances ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">
                Nobody has{' '}
                {quest.quest_type === 'coop' ? 'enrolled' : 'accepted'} yet.
              </p>
            ) : (
              <div className="space-y-4">
                {Array.from(acceptancesByClass.entries())
                  .sort(([a], [b]) =>
                    classLabel(a).localeCompare(classLabel(b))
                  )
                  .map(([classId, list]) => (
                    <div key={classId}>
                      <h3 className="mb-2 text-sm font-semibold text-slate-700">
                        {classLabel(classId)} ({list.length})
                      </h3>
                      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                        {list.map((a) => {
                          const student = a.profiles as
                            | { id: string; full_name: string }
                            | null;
                          return (
                            <li
                              key={a.id}
                              className="flex items-center justify-between px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-slate-900">
                                {student?.full_name ?? '(unknown student)'}
                              </span>
                              <span className="text-xs text-slate-500">
                                {a.status}
                                {a.completed_at &&
                                  ` · ${formatSaigon(a.completed_at)}`}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coop instances — grouped by class */}
        {quest.quest_type === 'coop' && matchmakingDone && (
          <Card>
            <CardHeader>
              <CardTitle>Teams ({(instances ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from(instancesByClass.entries())
                  .sort(([a], [b]) =>
                    classLabel(a).localeCompare(classLabel(b))
                  )
                  .map(([classId, list]) => (
                    <div key={classId}>
                      <h3 className="mb-2 text-sm font-semibold text-slate-700">
                        {classLabel(classId)} ({list.length}{' '}
                        {list.length === 1 ? 'team' : 'teams'})
                      </h3>
                      <ul className="space-y-3">
                        {list.map((inst) => {
                          const members = (acceptances ?? []).filter(
                            (a) => a.instance_id === inst.id
                          );
                          return (
                            <li
                              key={inst.id}
                              className="rounded-md border border-slate-200 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium">
                                    Team of {members.length} ·{' '}
                                    <span
                                      className={
                                        inst.status === 'disbanded'
                                          ? 'text-slate-500'
                                          : inst.status === 'passed'
                                            ? 'text-green-700'
                                            : 'text-slate-700'
                                      }
                                    >
                                      {inst.status}
                                    </span>
                                  </p>
                                  <ul className="mt-1 text-xs text-slate-600">
                                    {members.map((m) => {
                                      const s = m.profiles as
                                        | { id: string; full_name: string }
                                        | null;
                                      return (
                                        <li key={m.id}>
                                          • {s?.full_name ?? '(unknown)'} ({m.status})
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                                {inst.status === 'active' && (
                                  <DisbandInstanceButton instanceId={inst.id} />
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submissions */}
        <Card>
          <CardHeader>
            <CardTitle>
              Submissions ({filteredSubmissions.length}
              {pendingCount > 0 && ` · ${pendingCount} pending`})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredSubmissions.length === 0 ? (
              <p className="text-sm text-slate-500">No submissions yet.</p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                {filteredSubmissions.map((s) => {
                  const submitter = s.profiles as
                    | { id: string; full_name: string; class_id: string | null }
                    | null;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium text-slate-900">
                          {submitter?.full_name ?? '(unknown)'}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          {submitter?.class_id
                            ? `${classLabel(submitter.class_id)} · `
                            : ''}
                          {s.word_count ?? 0} words · {formatSaigon(s.submitted_at)}
                        </span>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          s.status === 'passed'
                            ? 'bg-green-100 text-green-800'
                            : s.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {s.status === 'pending_review' ? 'pending review' : s.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Edit */}
        <Card>
          <CardHeader>
            <CardTitle>Edit</CardTitle>
          </CardHeader>
          <CardContent>
            <EditQuestForm quest={quest} lockCoopFields={lockCoopFields} />
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CloseQuestButton questId={quest.id} isClosed={isClosed} />
            <hr className="border-slate-200" />
            <DeleteQuestButton questId={quest.id} hasPending={pendingCount > 0} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
