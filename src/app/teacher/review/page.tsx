import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

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

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: classFilter } = await searchParams;
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');

  const classNameById = new Map<string, string>(
    (classes ?? []).map((c) => [c.id, c.name])
  );

  const { data: submissions } = await supabase
    .from('quest_submissions')
    .select(
      `
        id, status, word_count, submitted_at, submitted_by, acceptance_id, instance_id,
        profiles:submitted_by ( full_name, class_id ),
        quest_acceptances:acceptance_id (
          quests:quest_id ( id, title, xp_reward, word_limit_min, quest_type )
        ),
        coop_quest_instances:instance_id (
          class_id,
          quests:quest_id ( id, title, xp_reward, word_limit_min, quest_type )
        )
      `
    )
    .eq('status', 'pending_review')
    .order('submitted_at', { ascending: true });

  type Quest = {
    id: string;
    title: string;
    xp_reward: number;
    word_limit_min: number | null;
    quest_type: 'solo' | 'coop' | 'daily_quiz';
  };

  // Build attempt counts: for each pending submission, how many submissions
  // exist for its acceptance/instance (the count IS the attempt number, since
  // the pending one is the latest).
  const acceptanceIds = Array.from(
    new Set(
      (submissions ?? [])
        .map((s) => s.acceptance_id)
        .filter((x): x is string => x !== null)
    )
  );
  const instanceIds = Array.from(
    new Set(
      (submissions ?? [])
        .map((s) => s.instance_id)
        .filter((x): x is string => x !== null)
    )
  );
  const attemptByAcceptance = new Map<string, number>();
  const attemptByInstance = new Map<string, number>();
  if (acceptanceIds.length > 0) {
    const { data: prior } = await supabase
      .from('quest_submissions')
      .select('acceptance_id')
      .in('acceptance_id', acceptanceIds);
    for (const row of prior ?? []) {
      if (row.acceptance_id)
        attemptByAcceptance.set(
          row.acceptance_id,
          (attemptByAcceptance.get(row.acceptance_id) ?? 0) + 1
        );
    }
  }
  if (instanceIds.length > 0) {
    const { data: prior } = await supabase
      .from('quest_submissions')
      .select('instance_id')
      .in('instance_id', instanceIds);
    for (const row of prior ?? []) {
      if (row.instance_id)
        attemptByInstance.set(
          row.instance_id,
          (attemptByInstance.get(row.instance_id) ?? 0) + 1
        );
    }
  }

  const allItems = (submissions ?? []).map((s) => {
    const accept = s.quest_acceptances as { quests: Quest | null } | null;
    const inst = s.coop_quest_instances as {
      class_id: string;
      quests: Quest | null;
    } | null;
    const quest = accept?.quests ?? inst?.quests ?? null;
    const submitter = s.profiles as { full_name: string; class_id: string | null } | null;
    // For solo: class derived from the submitter. For coop: class on the instance.
    const classId = inst?.class_id ?? submitter?.class_id ?? null;
    const attempt = s.acceptance_id
      ? (attemptByAcceptance.get(s.acceptance_id) ?? 1)
      : s.instance_id
        ? (attemptByInstance.get(s.instance_id) ?? 1)
        : 1;
    return {
      id: s.id,
      quest,
      submitterName: submitter?.full_name ?? '(unknown)',
      classId,
      wordCount: s.word_count ?? 0,
      submittedAt: s.submitted_at,
      isCoop: s.instance_id !== null,
      attempt,
    };
  });

  const items =
    classFilter && classFilter !== 'all'
      ? allItems.filter((i) => i.classId === classFilter)
      : allItems;

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <Link
        href="/teacher"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Dashboard
      </Link>
      <h1 className="mb-2 text-3xl font-bold">Review queue</h1>
      <p className="mb-6 text-sm text-slate-600">
        Pending submissions, oldest first.
      </p>

      {/* Class filter */}
      {classes && classes.length > 0 && (
        <form method="get" className="mb-4 flex items-center gap-2 text-sm">
          <label htmlFor="class" className="font-medium text-slate-700">
            Class:
          </label>
          <select
            id="class"
            name="class"
            defaultValue={classFilter ?? 'all'}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All classes ({allItems.length})</option>
            {classes.map((c) => {
              const count = allItems.filter((i) => i.classId === c.id).length;
              return (
                <option key={c.id} value={c.id}>
                  {c.name} ({count})
                </option>
              );
            })}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Apply
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-600">
            {classFilter && classFilter !== 'all'
              ? 'Nothing pending in this class.'
              : 'Nothing to review. All caught up.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.id} href={`/teacher/review/${item.id}`}>
              <Card className="transition-colors hover:bg-slate-50">
                <CardHeader className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">
                        {item.quest?.title ?? '(quest deleted)'}
                      </CardTitle>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {item.isCoop ? (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-800">
                            co-op
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
                            solo
                          </span>
                        )}
                        {item.classId && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                            {classNameById.get(item.classId) ?? 'Unknown class'}
                          </span>
                        )}
                        {item.attempt > 1 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                            Attempt {item.attempt}
                          </span>
                        )}
                        <span>{item.submitterName}</span>
                        <span>·</span>
                        <span>
                          {item.wordCount} words
                          {item.quest?.word_limit_min != null &&
                            item.quest.word_limit_min > 0 &&
                            ` · target ${item.quest.word_limit_min}`}
                        </span>
                        <span>·</span>
                        <span>submitted {formatSaigon(item.submittedAt)}</span>
                      </p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
