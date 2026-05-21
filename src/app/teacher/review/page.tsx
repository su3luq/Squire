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

export default async function ReviewQueuePage() {
  const supabase = await createClient();

  const { data: submissions } = await supabase
    .from('quest_submissions')
    .select(
      `
        id, status, word_count, submitted_at, submitted_by, acceptance_id, instance_id,
        profiles:submitted_by ( full_name ),
        quest_acceptances:acceptance_id (
          quests:quest_id ( id, title, xp_reward, word_limit_min, quest_type )
        ),
        coop_quest_instances:instance_id (
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

  const items = (submissions ?? []).map((s) => {
    const accept = s.quest_acceptances as { quests: Quest | null } | null;
    const inst = s.coop_quest_instances as { quests: Quest | null } | null;
    const quest = accept?.quests ?? inst?.quests ?? null;
    const submitter = s.profiles as { full_name: string } | null;
    return {
      id: s.id,
      quest,
      submitterName: submitter?.full_name ?? '(unknown)',
      wordCount: s.word_count ?? 0,
      submittedAt: s.submitted_at,
      isCoop: s.instance_id !== null,
    };
  });

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

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-600">
            Nothing to review. All caught up.
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
                      <p className="mt-1 text-xs text-slate-500">
                        {item.isCoop ? (
                          <span className="mr-1 rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-800">
                            co-op
                          </span>
                        ) : (
                          <span className="mr-1 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
                            solo
                          </span>
                        )}
                        {item.submitterName} · {item.wordCount} words
                        {item.quest?.word_limit_min != null &&
                          item.quest.word_limit_min > 0 &&
                          ` · target ${item.quest.word_limit_min}`}
                        {' · submitted '}
                        {formatSaigon(item.submittedAt)}
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
