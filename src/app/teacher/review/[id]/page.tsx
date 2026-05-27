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
import { ReviewForm } from './review-form';

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

export default async function ReviewSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from('quest_submissions')
    .select(
      `
        id, status, text_content, word_count, teacher_feedback, submitted_at, reviewed_at,
        submitted_by, acceptance_id, instance_id,
        profiles:submitted_by ( id, full_name, class_id ),
        quest_acceptances:acceptance_id (
          id,
          quests:quest_id ( id, title, xp_reward, word_limit_min, quest_type )
        ),
        coop_quest_instances:instance_id (
          id,
          class_id,
          quests:quest_id ( id, title, xp_reward, word_limit_min, quest_type )
        )
      `
    )
    .eq('id', id)
    .maybeSingle();

  if (!submission) notFound();

  type Quest = {
    id: string;
    title: string;
    xp_reward: number;
    word_limit_min: number | null;
    quest_type: 'solo' | 'coop' | 'daily_quiz';
  };
  const accept = submission.quest_acceptances as { quests: Quest | null } | null;
  const inst = submission.coop_quest_instances as {
    class_id: string;
    quests: Quest | null;
  } | null;
  const quest = accept?.quests ?? inst?.quests ?? null;
  const submitter = submission.profiles as
    | { full_name: string; class_id: string | null }
    | null;
  const isCoop = submission.instance_id !== null;
  const classId = inst?.class_id ?? submitter?.class_id ?? null;

  let className: string | null = null;
  if (classId) {
    const { data: cls } = await supabase
      .from('classes')
      .select('name')
      .eq('id', classId)
      .maybeSingle();
    className = cls?.name ?? null;
  }

  let teamMembers: string[] = [];
  let teamNotes: Array<{
    studentId: string;
    studentName: string;
    body: string;
    updatedAt: string;
  }> = [];
  if (isCoop && submission.instance_id) {
    const { data: members } = await supabase
      .from('quest_acceptances')
      .select('profiles:student_id(full_name)')
      .eq('instance_id', submission.instance_id);
    teamMembers = (members ?? [])
      .map((m) => (m.profiles as { full_name?: string } | null)?.full_name)
      .filter((n): n is string => typeof n === 'string');

    // Phase 8 Day 4: teacher can see the team's scratchpad once a
    // submission exists for the instance — which it does on this page.
    const { data: notes } = await supabase
      .from('coop_team_notes')
      .select('student_id, body, updated_at')
      .eq('instance_id', submission.instance_id);
    const noteStudentIds = (notes ?? []).map((n) => n.student_id);
    const nameById = new Map<string, string>();
    if (noteStudentIds.length > 0) {
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, full_name')
        .in('id', noteStudentIds);
      for (const p of profiles ?? []) {
        if (p.id && p.full_name) nameById.set(p.id, p.full_name);
      }
    }
    teamNotes = (notes ?? [])
      .map((n) => ({
        studentId: n.student_id,
        studentName: nameById.get(n.student_id) ?? '(unknown)',
        body: n.body ?? '',
        updatedAt: n.updated_at,
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }

  const isPending = submission.status === 'pending_review';

  let attempt = 1;
  if (submission.acceptance_id) {
    const { count } = await supabase
      .from('quest_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('acceptance_id', submission.acceptance_id)
      .lte('submitted_at', submission.submitted_at);
    attempt = count ?? 1;
  } else if (submission.instance_id) {
    const { count } = await supabase
      .from('quest_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('instance_id', submission.instance_id)
      .lte('submitted_at', submission.submitted_at);
    attempt = count ?? 1;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={quest?.title ?? '(quest deleted)'} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium capitalize text-muted-foreground">
            {isCoop ? 'co-op' : 'solo'}
          </span>
          {className && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">
              {className}
            </span>
          )}
          {attempt > 1 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-900">
              Attempt {attempt}
            </span>
          )}
          <span className="text-muted-foreground">
            +{quest?.xp_reward ?? 0} XP
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {submission.word_count ?? 0} words
          {quest?.word_limit_min != null &&
            quest.word_limit_min > 0 &&
            ` · target ${quest.word_limit_min}`}
          {' · '}by {submitter?.full_name ?? '(unknown)'}
          {' · '}submitted {formatSaigon(submission.submitted_at)}
        </p>
        {isCoop && teamMembers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Team: {teamMembers.join(', ')}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submission</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownRenderer
            source={submission.text_content ?? ''}
            emptyPlaceholder="(empty submission)"
          />
        </CardContent>
      </Card>

      {isCoop && teamNotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team discussion</CardTitle>
            <p className="text-xs text-muted-foreground">
              Notes the team wrote to each other while drafting.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {teamNotes.map((n) => (
                <li
                  key={n.studentId}
                  className="rounded-md border border-border bg-muted/40 p-3"
                >
                  <p className="mb-1 text-xs font-medium text-foreground">
                    {n.studentName}
                  </p>
                  {n.body.trim() ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {n.body}
                    </p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      (no note)
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {isPending && quest ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision</CardTitle>
          </CardHeader>
          <CardContent>
            <ReviewForm
              submissionId={submission.id}
              xpReward={quest.xp_reward}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Already reviewed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <span>Decision:</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  submission.status === 'passed'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {submission.status}
              </span>
              {submission.reviewed_at && (
                <span className="text-xs text-muted-foreground">
                  · {formatSaigon(submission.reviewed_at)}
                </span>
              )}
            </p>
            {submission.teacher_feedback && (
              <div className="rounded-md border border-border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Feedback given
                </p>
                <MarkdownRenderer source={submission.teacher_feedback} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
