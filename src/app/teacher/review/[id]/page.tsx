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
  const submitter = submission.profiles as { full_name: string; class_id: string | null } | null;
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

  // For coop, surface the rest of the team for context
  let teamMembers: string[] = [];
  if (isCoop && submission.instance_id) {
    const { data: members } = await supabase
      .from('quest_acceptances')
      .select('profiles:student_id(full_name)')
      .eq('instance_id', submission.instance_id);
    teamMembers = (members ?? [])
      .map((m) => (m.profiles as { full_name?: string } | null)?.full_name)
      .filter((n): n is string => typeof n === 'string');
  }

  const isPending = submission.status === 'pending_review';

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <Link
        href="/teacher/review"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Review queue
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">{quest?.title ?? '(quest deleted)'}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${isCoop ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}
          >
            {isCoop ? 'co-op' : 'solo'}
          </span>
          {className && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {className}
            </span>
          )}
          <span>+{quest?.xp_reward ?? 0} XP</span>
          <span>·</span>
          <span>
            {submission.word_count ?? 0} words
            {quest?.word_limit_min != null &&
              quest.word_limit_min > 0 &&
              ` · target ${quest.word_limit_min}`}
          </span>
          <span>·</span>
          <span>by {submitter?.full_name ?? '(unknown)'}</span>
          <span>·</span>
          <span>submitted {formatSaigon(submission.submitted_at)}</span>
        </div>
        {isCoop && teamMembers.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Team: {teamMembers.join(', ')}
          </p>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Submission</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownRenderer
              source={submission.text_content ?? ''}
              emptyPlaceholder="(empty submission)"
            />
          </CardContent>
        </Card>

        {isPending && quest ? (
          <Card>
            <CardHeader>
              <CardTitle>Decision</CardTitle>
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
              <CardTitle>Already reviewed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Decision:{' '}
                <span
                  className={
                    submission.status === 'passed'
                      ? 'font-semibold text-green-700'
                      : 'font-semibold text-red-700'
                  }
                >
                  {submission.status}
                </span>
                {submission.reviewed_at &&
                  ` · ${formatSaigon(submission.reviewed_at)}`}
              </p>
              {submission.teacher_feedback && (
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Feedback given
                  </p>
                  <MarkdownRenderer source={submission.teacher_feedback} />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
