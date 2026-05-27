import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { CopyMarkdownButton } from '@/components/copy-markdown-button';

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { data: card } = await supabase
    .from('review_cards')
    .select('id, headline, body, lesson_id, lessons(title, lesson_number)')
    .eq('id', cardId)
    .single();

  if (!card) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Lesson {card.lessons?.lesson_number} · {card.lessons?.title}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {card.headline}
        </h1>
      </div>

      <article className="rounded-lg border border-border bg-card p-6">
        <MarkdownRenderer
          source={card.body}
          emptyPlaceholder="This card has no body content."
        />
      </article>

      <div className="flex justify-end">
        <CopyMarkdownButton source={card.body} />
      </div>
    </div>
  );
}
