import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PageHeader } from '@/components/page-header';
import { SubmissionForm } from '../submission-form';
import { TeamWorkspace, type DraftMember } from './team-workspace';
import {
  TeamNotesSidebar,
  type TeamNote,
} from './team-notes-sidebar';

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

export default async function MyQuestWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: questId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: quest } = await supabase
    .from('quests')
    .select(
      'id, title, description, quest_type, xp_reward, word_limit_min, max_team_size, closed_at, expires_at'
    )
    .eq('id', questId)
    .maybeSingle();

  if (!quest) notFound();

  const { data: acceptance } = await supabase
    .from('quest_acceptances')
    .select('id, status, instance_id, accepted_at, completed_at')
    .eq('student_id', user.id)
    .eq('quest_id', questId)
    .maybeSingle();

  if (!acceptance) redirect(`/student/quests/${questId}`);
  if (acceptance.status === 'enrolled') redirect(`/student/quests/${questId}`);

  const isCoop = acceptance.instance_id !== null;

  // Coop-specific fetches: instance + member drafts
  let instance:
    | {
        id: string;
        status: string;
        submitted_at: string | null;
        team_number: number | null;
      }
    | null = null;
  let draftMembers: DraftMember[] = [];
  if (isCoop && acceptance.instance_id) {
    const { data: inst } = await supabase
      .from('coop_quest_instances')
      .select('id, status, submitted_at, team_number')
      .eq('id', acceptance.instance_id)
      .maybeSingle();
    instance = inst ?? null;

    const { data: drafts } = await supabase
      .from('coop_member_drafts')
      .select('id, student_id, body_md, submitted_at')
      .eq('instance_id', acceptance.instance_id);

    const memberIds = (drafts ?? [])
      .map((d) => d.student_id)
      .filter((id): id is string => id !== null);

    const profilesById = new Map<string, string>();
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, full_name')
        .in('id', memberIds);
      for (const p of profiles ?? []) {
        if (p.id && p.full_name) profilesById.set(p.id, p.full_name);
      }
    }

    draftMembers = (drafts ?? [])
      .map((d): DraftMember => ({
        draftId: d.id,
        studentId: d.student_id,
        fullName: profilesById.get(d.student_id) ?? '(unknown)',
        bodyMd: d.body_md ?? '',
        submittedAt: d.submitted_at,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  // Coop team notes (Phase 8 Day 4). RLS scopes to teammates.
  let teamNotes: TeamNote[] = [];
  if (isCoop && acceptance.instance_id) {
    const { data: notes } = await supabase
      .from('coop_team_notes')
      .select('id, student_id, body, updated_at')
      .eq('instance_id', acceptance.instance_id);
    teamNotes = (notes ?? [])
      .map((n) => ({
        noteId: n.id,
        studentId: n.student_id,
        studentName:
          draftMembers.find((m) => m.studentId === n.student_id)?.fullName ??
          '(unknown)',
        body: n.body ?? '',
        updatedAt: n.updated_at,
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }

  // Submission history (latest first)
  const submissionQuery = supabase
    .from('quest_submissions')
    .select(
      'id, status, text_content, word_count, teacher_feedback, submitted_at, reviewed_at, submitted_by'
    )
    .order('submitted_at', { ascending: false });
  const { data: submissions } = isCoop
    ? await submissionQuery.eq('instance_id', acceptance.instance_id!)
    : await submissionQuery.eq('acceptance_id', acceptance.id);

  const submitterIds = Array.from(
    new Set((submissions ?? []).map((s) => s.submitted_by).filter(Boolean))
  );
  const submitterNameById = new Map<string, string>();
  if (submitterIds.length > 0) {
    const { data: submitterProfiles } = await supabase
      .from('public_profiles')
      .select('id, full_name')
      .in('id', submitterIds);
    for (const p of submitterProfiles ?? []) {
      if (p.id && p.full_name) submitterNameById.set(p.id, p.full_name);
    }
  }

  const latestSubmission = (submissions ?? [])[0] ?? null;
  const pendingSubmission =
    latestSubmission?.status === 'pending_review' ? latestSubmission : null;
  const lastFailed =
    latestSubmission?.status === 'failed' ? latestSubmission : null;
  const isCompleted = acceptance.status === 'passed';

  // For solo only: simple submit gate. For coop: TeamWorkspace handles
  // its own gates (per-member submit, instance status).
  const canSoloSubmit =
    !isCoop && !isCompleted && !pendingSubmission && acceptance.status === 'active';

  return (
    <div className="mx-auto flex max-w-6xl gap-6">
    <div className="min-w-0 flex-1 space-y-6 lg:max-w-3xl">
      <PageHeader title={quest.title} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium capitalize text-muted-foreground">
          {isCoop ? 'co-op' : 'solo'}
        </span>
        {isCoop && instance?.team_number != null && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">
            Team {instance.team_number}
          </span>
        )}
        <span className="text-muted-foreground">+{quest.xp_reward} XP</span>
        {quest.word_limit_min != null && quest.word_limit_min > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              target {quest.word_limit_min} words
            </span>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brief</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownRenderer
            source={quest.description ?? ''}
            emptyPlaceholder="No description provided."
          />
        </CardContent>
      </Card>

      {/* Coop: team workspace (drafts + dropdown + submit toggle) */}
      {isCoop && acceptance.instance_id && instance && !isCompleted && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {instance.team_number != null
                ? `Team ${instance.team_number} workspace`
                : 'Team workspace'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TeamWorkspace
              instanceId={acceptance.instance_id}
              questId={questId}
              members={draftMembers}
              viewerId={user.id}
              editable={instance.status === 'active'}
            />
          </CardContent>
        </Card>
      )}

      {/* Completed celebration (solo + coop) */}
      {isCompleted && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-primary">
                Passed
              </span>
              <p className="text-sm font-medium">
                +{quest.xp_reward} XP earned
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Reviewed {formatSaigon(acceptance.completed_at)}.
            </p>
            {latestSubmission?.teacher_feedback && (
              <div className="rounded-md border border-border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Teacher feedback
                </p>
                <MarkdownRenderer source={latestSubmission.teacher_feedback} />
              </div>
            )}
            {/* For coop completion, show each member's section too */}
            {isCoop && latestSubmission?.text_content && (
              <div className="rounded-md border border-border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Submitted team work
                </p>
                <MarkdownRenderer source={latestSubmission.text_content} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Awaiting review banner */}
      {pendingSubmission && !isCompleted && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-900">
                Awaiting review
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Submitted {formatSaigon(pendingSubmission.submitted_at)}
              {' · '}
              {pendingSubmission.word_count} words
              {isCoop &&
                submitterNameById.get(pendingSubmission.submitted_by) &&
                ` · last submit by ${submitterNameById.get(pendingSubmission.submitted_by)}`}
            </p>
            <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
              <MarkdownRenderer source={pendingSubmission.text_content ?? ''} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed-needs-revision: solo shows the resubmit form; coop unlocks
          via the TeamWorkspace above when instance flips back to 'active'. */}
      {lastFailed && !isCompleted && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-destructive">
                Needs revision
              </span>
            </div>
            {lastFailed.teacher_feedback && (
              <div className="rounded-md border border-border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Teacher feedback
                </p>
                <MarkdownRenderer source={lastFailed.teacher_feedback} />
              </div>
            )}
            <details className="rounded-md border border-border bg-muted/40 p-4 text-sm">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Previous submission ({lastFailed.word_count} words ·{' '}
                {formatSaigon(lastFailed.submitted_at)})
              </summary>
              <div className="mt-3">
                <MarkdownRenderer source={lastFailed.text_content ?? ''} />
              </div>
            </details>
            {!isCoop && canSoloSubmit && (
              <SubmissionForm
                questId={quest.id}
                acceptanceId={acceptance.id}
                instanceId={null}
                wordTarget={quest.word_limit_min}
                initialText={lastFailed.text_content ?? ''}
                startCollapsed
                collapsedLabel="Resubmit"
              />
            )}
            {isCoop && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Revise your drafts in the team workspace above, then each
                member re-submits.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Solo: first-submit form */}
      {!isCoop && canSoloSubmit && !lastFailed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your submission</CardTitle>
          </CardHeader>
          <CardContent>
            <SubmissionForm
              questId={quest.id}
              acceptanceId={acceptance.id}
              instanceId={null}
              wordTarget={quest.word_limit_min}
            />
          </CardContent>
        </Card>
      )}

      {/* History (more than one submission) */}
      {(submissions?.length ?? 0) > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(submissions ?? []).slice(1).map((s) => {
                const tone =
                  s.status === 'passed'
                    ? 'text-primary'
                    : s.status === 'failed'
                      ? 'text-destructive'
                      : 'text-amber-700';
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span>
                      {formatSaigon(s.submitted_at)} · {s.word_count} words
                    </span>
                    <span className={`font-medium capitalize ${tone}`}>
                      {s.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>

    {isCoop && acceptance.instance_id && (
      <TeamNotesSidebar
        instanceId={acceptance.instance_id}
        viewerId={user.id}
        initialNotes={teamNotes}
        editable={instance?.status === 'active'}
      />
    )}
    </div>
  );
}
