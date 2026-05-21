import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { QuestForm } from '../quest-form';
import { createQuest } from './actions';

export default async function NewQuestPage() {
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <Link
        href="/teacher/quests"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Quests
      </Link>
      <h1 className="mb-6 text-3xl font-bold">New quest</h1>

      {!classes || classes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-600">
            You need at least one class before you can post a quest.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <QuestForm
              classes={classes}
              mode="new"
              action={createQuest}
              cancelHref="/teacher/quests"
            />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
