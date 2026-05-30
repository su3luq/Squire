import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PageHeader } from '@/components/page-header';
import { StatusChip, QuestStatusChip } from '@/components/status-chip';
import { formatLongCountdown } from '../indicator';
import { EditQuestForm } from './edit-quest-form';
import { DeleteQuestButton } from './delete-quest-button';
import { CloseQuestButton } from './close-quest-button';
import { DisbandQuestButton } from './disband-quest-button';
import { DisbandInstanceButton } from './disband-instance-button';
import { ForceFinalizeButton } from './force-finalize-button';

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
    .select(
      'id, status, class_id, team_number, started_at, submitted_at, reviewed_at'
    )
    .eq('quest_id', id)
    .order('started_at', { ascending: true });

  // Per-instance draft submit counts (Phase 8 Day 3). We compute submitted /
  // total per instance to drive the teacher "Force submit" affordance.
  const instanceIdList = (instances ?? []).map((i) => i.id);
  const draftCountsByInstance = new Map<
    string,
    { total: number; submitted: number }
  >();
  if (instanceIdList.length > 0) {
    const { data: draftRows } = await supabase
      .from('coop_member_drafts')
      .select('instance_id, submitted_at')
      .in('instance_id', instanceIdList);
    for (const row of draftRows ?? []) {
      const cur = draftCountsByInstance.get(row.instance_id) ?? {
        total: 0,
        submitted: 0,
      };
      cur.total += 1;
      if (row.submitted_at != null) cur.submitted += 1;
      draftCountsByInstance.set(row.instance_id, cur);
    }
  }

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

  // Compute attempt number per submission (chronological position within
  // its acceptance/instance). We have submissions ordered DESC; counting
  // toward "this submission was the Nth attempt" means counting same-key
  // entries that came strictly before or at this point.
  const submissionsAsc = [...filteredSubmissions].sort((a, b) =>
    a.submitted_at < b.submitted_at ? -1 : 1
  );
  const attemptBySubmission = new Map<string, number>();
  const seenByAcceptance = new Map<string, number>();
  const seenByInstance = new Map<string, number>();
  for (const s of submissionsAsc) {
    let n: number;
    if (s.acceptance_id) {
      n = (seenByAcceptance.get(s.acceptance_id) ?? 0) + 1;
      seenByAcceptance.set(s.acceptance_id, n);
    } else if (s.instance_id) {
      n = (seenByInstance.get(s.instance_id) ?? 0) + 1;
      seenByInstance.set(s.instance_id, n);
    } else {
      n = 1;
    }
    attemptBySubmission.set(s.id, n);
  }

  const pendingCount = filteredSubmissions.filter(
    (s) => s.status === 'pending_review'
  ).length;
  const isClosed = quest.closed_at !== null;
  const matchmakingDone = (instances ?? []).length > 0;
  const hasAnyAcceptance = (acceptances ?? []).length > 0;
  const lockCoopFields = quest.quest_type === 'coop' && hasAnyAcceptance;

  // Disband preview counts — what would be cancelled if the teacher clicks
  // Disband right now.
  const disbandableAcceptances = (acceptances ?? []).filter(
    (a) =>
      a.status === 'active' ||
      a.status === 'enrolled' ||
      a.status === 'submitted'
  ).length;
  const disbandableInstances = (instances ?? []).filter(
    (i) => i.status === 'active' || i.status === 'submitted'
  ).length;
  const isExpired =
    quest.expires_at !== null &&
    // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request; "now" is deliberate.
    new Date(quest.expires_at).getTime() <= Date.now();

  // Surface matchmaking failure for the teacher (read from notifications log).
  // Only show if there are genuinely no acceptances — guards against stale
  // notifications from before a re-enrollment cycle.
  let noEnrollmentsFailure = false;
  if (
    quest.quest_type === 'coop' &&
    isExpired &&
    (acceptances ?? []).length === 0
  ) {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'quest_matchmaking_no_enrollments')
      .filter('data->>quest_id', 'eq', id);
    noEnrollmentsFailure = (count ?? 0) > 0;
  }

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
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={quest.title} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusChip tone="muted" capitalize>{quest.quest_type}</StatusChip>
          <span className="text-muted-foreground">+{quest.xp_reward} XP</span>
          {quest.quest_type === 'coop' && quest.max_team_size && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                max team size {quest.max_team_size}
              </span>
            </>
          )}
          {isClosed && (
            <StatusChip tone="muted">Closed</StatusChip>
          )}
          {!isClosed && isExpired && quest.quest_type === 'solo' && (
            <StatusChip tone="warn">Expired</StatusChip>
          )}
        </div>
        {quest.expires_at && (
          <p className="text-xs text-muted-foreground">
            {quest.quest_type === 'coop' ? 'Matchmaking' : 'Expires'} at{' '}
            {formatSaigon(quest.expires_at)} (Saigon)
            {!isExpired &&
              ` · ${formatLongCountdown(new Date(quest.expires_at).getTime())}`}
          </p>
        )}
      </div>
        {/* Matchmaking failure banner */}
        {noEnrollmentsFailure && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Matchmaking ran with no enrollments.</p>
            <p className="mt-1 text-xs">
              The deadline passed and no students had enrolled. You can close
              the quest, or re-open it with a new deadline by editing
              &quot;Matchmaking deadline&quot; below.
            </p>
          </div>
        )}

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
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
            <CardTitle className="text-base">
              {quest.quest_type === 'coop' ? 'Enrollments & members' : 'Acceptances'} (
              {(acceptances ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(acceptances ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
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
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {classLabel(classId)} ({list.length})
                      </h3>
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {list.map((a) => {
                          const student = a.profiles as
                            | { id: string; full_name: string }
                            | null;
                          return (
                            <li
                              key={a.id}
                              className="flex items-center justify-between px-3 py-2 text-sm"
                            >
                              <span className="font-medium">
                                {student?.full_name ?? '(unknown student)'}
                              </span>
                              <span className="text-xs text-muted-foreground capitalize">
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
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {classLabel(classId)} ({list.length}{' '}
                        {list.length === 1 ? 'team' : 'teams'})
                      </h3>
                      <ul className="space-y-3">
                        {list
                          .slice()
                          .sort(
                            (a, b) =>
                              (a.team_number ?? 0) - (b.team_number ?? 0)
                          )
                          .map((inst) => {
                            const members = (acceptances ?? []).filter(
                              (a) => a.instance_id === inst.id
                            );
                            return (
                              <li
                                key={inst.id}
                                className="rounded-md border border-border p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">
                                      {inst.team_number != null
                                        ? `Team ${inst.team_number}`
                                        : 'Team'}{' '}
                                      · {members.length}{' '}
                                      {members.length === 1
                                        ? 'member'
                                        : 'members'}{' '}
                                      ·{' '}
                                      <span
                                        className={`capitalize ${
                                          inst.status === 'passed'
                                            ? 'text-primary'
                                            : 'text-foreground'
                                        }`}
                                      >
                                        {inst.status}
                                      </span>
                                      {inst.status === 'active' &&
                                        (() => {
                                          const c = draftCountsByInstance.get(inst.id);
                                          if (!c || c.total === 0) return null;
                                          return (
                                            <StatusChip tone="muted" className="ml-2 font-normal">
                                              <span className="tabular-nums">{c.submitted}/{c.total}</span> drafts submitted
                                            </StatusChip>
                                          );
                                        })()}
                                    </p>
                                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                                      {members.map((m) => {
                                        const s = m.profiles as
                                          | { id: string; full_name: string }
                                          | null;
                                        return (
                                          <li key={m.id}>
                                            {s?.full_name ?? '(unknown)'} (
                                            {m.status})
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                  {inst.status === 'active' && (
                                    <div className="flex shrink-0 flex-col gap-2">
                                      {(() => {
                                        const counts = draftCountsByInstance.get(inst.id);
                                        if (
                                          counts &&
                                          counts.total > 0 &&
                                          counts.submitted < counts.total
                                        ) {
                                          return (
                                            <ForceFinalizeButton
                                              instanceId={inst.id}
                                              questId={quest.id}
                                              pendingCount={
                                                counts.total - counts.submitted
                                              }
                                              totalCount={counts.total}
                                            />
                                          );
                                        }
                                        return null;
                                      })()}
                                      <DisbandInstanceButton
                                        instanceId={inst.id}
                                      />
                                    </div>
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
            <CardTitle className="text-base">
              Submissions ({filteredSubmissions.length}
              {pendingCount > 0 && ` · ${pendingCount} pending`})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {filteredSubmissions.map((s) => {
                  const submitter = s.profiles as
                    | { id: string; full_name: string; class_id: string | null }
                    | null;
                  const attempt = attemptBySubmission.get(s.id) ?? 1;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium">
                          {submitter?.full_name ?? '(unknown)'}
                        </span>
                        {attempt > 1 && (
                          <StatusChip tone="warn" className="ml-2">
                            Attempt <span className="tabular-nums">{attempt}</span>
                          </StatusChip>
                        )}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {submitter?.class_id
                            ? `${classLabel(submitter.class_id)} · `
                            : ''}
                          {s.word_count ?? 0} words ·{' '}
                          {formatSaigon(s.submitted_at)}
                        </span>
                      </div>
                      <QuestStatusChip status={s.status} />
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
            <CardTitle className="text-base">Edit</CardTitle>
          </CardHeader>
          <CardContent>
            <EditQuestForm quest={quest} lockCoopFields={lockCoopFields} />
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CloseQuestButton questId={quest.id} isClosed={isClosed} />
            <hr className="border-border" />
            <DisbandQuestButton
              questId={quest.id}
              affectedStudents={disbandableAcceptances}
              affectedTeams={disbandableInstances}
            />
            <hr className="border-border" />
            <DeleteQuestButton
              questId={quest.id}
              hasPending={pendingCount > 0}
            />
          </CardContent>
        </Card>
    </div>
  );
}
