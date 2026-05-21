import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { QuestForm } from '../quest-form';
import { createQuest } from './actions';

export default function NewQuestPage() {
  return (
    <main className="container mx-auto max-w-3xl p-6">
      <Link
        href="/teacher/quests"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Quests
      </Link>
      <h1 className="mb-6 text-3xl font-bold">New quest</h1>

      <Card>
        <CardContent className="pt-6">
          <QuestForm
            mode="new"
            action={createQuest}
            cancelHref="/teacher/quests"
          />
        </CardContent>
      </Card>
    </main>
  );
}
