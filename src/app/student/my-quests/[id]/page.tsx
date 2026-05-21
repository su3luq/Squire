import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { SubmissionForm } from '../submission-form';

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

  if (!acceptance) {
    redirect(`/student/quests/${questId}`);
  }

  // Pre-matchmaking enrollment → board page
  if (acceptance.status === 'enrolled') {
    redirect(`/student/quests/${questId}`);
  }

  const isCoop = acceptance.instance_id !== null;

  // Resolve instance + team members (for coop)
  let instance: {
    id: string;
    status: string;
    submitted_at: string | null;
  } | null = null;
  let teamMembers: { id: string; full_name: string }[] = [];
  if (isCoop && acceptance.instance_id) {
    const { data: inst } = await supabase
      .from('coop_quest_instances')
      .select('id, status, submitted_at')
      .eq('id', acceptance.instance_id)
      .maybeSingle();
    instance = inst ?? null;

    const { data: members } = await supabase
      .from('quest_acceptances')
      .select('profiles:student_id(id, full_name)')
      .eq('instance_id', acceptance.instance_id);
    teamMembers = (members ?? [])
      .map((m) => m.profiles as { id: string; full_name: string } | null)
      .filter((p): p is { id: string; full_name: string } => p !== null);
  }

  // Fetch submission history for this acceptance / instance, newest first.
  const submissionQuery = supabase
    .from('quest_submissions')
    .select(
      'id, status, text_content, word_count, teacher_feedback, submitted_at, reviewed_at, submitted_by, profiles:submitted_by(full_name)'
    )
    .order('submitted_at', { ascending: false });
  const { data: submissions } = isCoop
    ? await submissionQuery.eq('instance_id', acceptance.instance_id!)
    : await submissionQuery.eq('acceptance_id', acceptance.id);

  const latestSubmission = (submissions ?? [])[0] ?? null;
  const pendingSubmission =
    latestSubmission?.status === 'pending_review' ? latestSubmission : null;
  const lastFailed =
    latestSubmission?.status === 'failed' ? latestSubmission : null;

  const isCompleted = acceptance.status === 'passed';
  const isDisbanded =
    acceptance.status === 'disbanded' || instance?.status === 'disbanded';

  // Can we submit right now?
  // - Solo: acceptance is active AND no pending submission
  // - Coop: instance is active AND no pending submission
  const canSubmit =
    !isCompleted &&
    !isDisbanded &&
    !pendingSubmission &&
    (isCoop ? instance?.status === 'active' : acceptance.status === 'active');

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <Link
        href="/student/my-quests"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← My Quests
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">{quest.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${isCoop ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}
          >
            {isCoop ? 'co-op' : 'solo'}
          </span>
          <span>+{quest.xp_reward} XP</span>
          {quest.word_limit_min != null && quest.word_limit_min > 0 && (
            <>
              <span>·</span>
              <span>target {quest.word_limit_min} words</span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Brief */}
        <Card>
          <CardHeader>
            <CardTitle>Brief</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownRenderer
              source={quest.description ?? ''}
              emptyPlaceholder="No description provided."
            />
          </CardContent>
        </Card>

        {/* Team panel for coop */}
        {isCoop && (
          <Card>
            <CardHeader>
              <CardTitle>Your team</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-700">
                {teamMembers.map((m) => (
                  <li key={m.id}>• {m.full_name}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* State-specific UI */}
        {isCompleted && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold text-green-900">
                Passed — +{quest.xp_reward} XP earned
              </h3>
              <p className="mt-1 text-sm text-green-800">
                Reviewed {formatSaigon(acceptance.completed_at)}.
              </p>
              {latestSubmission?.teacher_feedback && (
                <div className="mt-3 rounded-md bg-white p-3 text-sm text-slate-700">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Teacher feedback
                  </p>
                  <MarkdownRenderer source={latestSubmission.teacher_feedback} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isDisbanded && (
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="pt-6 text-sm text-slate-700">
              Your team was disbanded by the teacher.
            </CardContent>
          </Card>
        )}

        {pendingSubmission && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-lg font-semibold text-amber-900">
                Awaiting review
              </h3>
              <p className="text-sm text-amber-800">
                Submitted {formatSaigon(pendingSubmission.submitted_at)}
                {' · '}
                {pendingSubmission.word_count} words
                {isCoop &&
                  (pendingSubmission.profiles as { full_name?: string } | null)
                    ?.full_name &&
                  ` · by ${(pendingSubmission.profiles as { full_name: string }).full_name}`}
              </p>
              <div className="rounded-md bg-white p-3 text-sm text-slate-700">
                <MarkdownRenderer source={pendingSubmission.text_content ?? ''} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Failed-resubmit UX (Spec A) */}
        {lastFailed && !isCompleted && !isDisbanded && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-lg font-semibold text-red-900">
                Needs revision
              </h3>
              {lastFailed.teacher_feedback && (
                <div className="rounded-md bg-white p-3 text-sm text-slate-800">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Teacher feedback
                  </p>
                  <MarkdownRenderer source={lastFailed.teacher_feedback} />
                </div>
              )}
              <details className="rounded-md bg-white p-3 text-sm text-slate-700">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Your previous submission ({lastFailed.word_count} words ·{' '}
                  {formatSaigon(lastFailed.submitted_at)})
                </summary>
                <div className="mt-2">
                  <MarkdownRenderer source={lastFailed.text_content ?? ''} />
                </div>
              </details>
              {canSubmit && (
                <SubmissionForm
                  questId={quest.id}
                  acceptanceId={isCoop ? null : acceptance.id}
                  instanceId={isCoop ? acceptance.instance_id : null}
                  wordTarget={quest.word_limit_min}
                  initialText={lastFailed.text_content ?? ''}
                  startCollapsed
                  collapsedLabel="Resubmit"
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Editor for first submission */}
        {canSubmit && !lastFailed && (
          <Card>
            <CardHeader>
              <CardTitle>Your submission</CardTitle>
            </CardHeader>
            <CardContent>
              <SubmissionForm
                questId={quest.id}
                acceptanceId={isCoop ? null : acceptance.id}
                instanceId={isCoop ? acceptance.instance_id : null}
                wordTarget={quest.word_limit_min}
              />
            </CardContent>
          </Card>
        )}

        {/* History */}
        {(submissions?.length ?? 0) > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                {(submissions ?? []).slice(1).map((s) => (
                  <li
                    key={s.id}
                    className="rounded-md border border-slate-200 px-3 py-2"
                  >
                    <p className="text-xs text-slate-500">
                      {formatSaigon(s.submitted_at)} · {s.word_count} words ·{' '}
                      <span
                        className={
                          s.status === 'passed'
                            ? 'text-green-700'
                            : s.status === 'failed'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }
                      >
                        {s.status}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
