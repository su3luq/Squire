import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CardModal } from '@/components/card-modal';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { CopyMarkdownButton } from '@/components/copy-markdown-button';

// Intercepting route: when a student clicks a card from /student/library,
// this matches `/student/library/cards/[cardId]` and renders into the @modal
// parallel slot. The underlying library page stays visible behind the modal.
// Refresh or direct navigation bypasses this and hits the full-page route.

export default async function CardModalPage({
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
    <CardModal>
      <div className="space-y-4">
        <div className="pr-10">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Lesson {card.lessons?.lesson_number} · {card.lessons?.title}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-foreground">{card.headline}</h2>
        </div>

        <div className="border-t border-border pt-4">
          <MarkdownRenderer
            source={card.body}
            emptyPlaceholder="This card has no body content."
          />
        </div>

        <div className="flex justify-end border-t border-border pt-3">
          <CopyMarkdownButton source={card.body} />
        </div>
      </div>
    </CardModal>
  );
}
