import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';

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
    const submitter = s.profiles as
      | { full_name: string; class_id: string | null }
      | null;
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
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Review queue"
        subtitle="Pending submissions, oldest first."
      />

      {classes && classes.length > 0 && (
        <form method="get" className="flex items-center gap-2 text-sm">
          <label htmlFor="class" className="font-medium text-foreground">
            Class:
          </label>
          <select
            id="class"
            name="class"
            defaultValue={classFilter ?? 'all'}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Apply
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={
            classFilter && classFilter !== 'all'
              ? 'Nothing pending in this class'
              : 'All caught up'
          }
          description="New submissions will appear here when students send them in."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/teacher/review/${item.id}`}
                className="block p-5 transition-colors hover:bg-muted/40"
              >
                <p className="truncate text-sm font-medium">
                  {item.quest?.title ?? '(quest deleted)'}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize">
                    {item.isCoop ? 'co-op' : 'solo'}
                  </span>
                  {item.classId && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
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
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
