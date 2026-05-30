import Link from 'next/link';
import { Zap } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { CopyMarkdownButton } from '@/components/copy-markdown-button';
import { NextReviewCountdown } from '@/components/next-review-countdown';

// Shared reader body for a single card, used by both the intercepting
// modal and the full-page route. Read ↔ recall: a due card offers
// "Review now" (enters the due-queue session via ?review=1); a not-due
// card shows when it next comes up. Reading is always available.

export type CardReaderData = {
  headline: string;
  body: string;
  lessonNumber: number | null;
  lessonTitle: string | null;
  /** Due now? */
  due: boolean;
  /** Next due timestamp when not due (and a review row exists). */
  nextDueAt: string | null;
};

export function CardReader({ card }: { card: CardReaderData }) {
  return (
    <div className="space-y-4">
      <div className="pr-10">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Lesson <span className="tabular-nums">{card.lessonNumber}</span> ·{' '}
          {card.lessonTitle}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-foreground">
          {card.headline}
        </h2>
      </div>

      <div className="border-t border-border pt-4">
        <MarkdownRenderer
          source={card.body}
          emptyPlaceholder="This card has no body content."
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        {card.due ? (
          <Link
            href="/student/cards?review=1"
            className={buttonVariants({ size: 'sm' })}
          >
            <Zap className="h-4 w-4" aria-hidden />
            Review now
          </Link>
        ) : card.nextDueAt ? (
          <span className="text-xs text-muted-foreground">
            Next review <NextReviewCountdown dueAt={card.nextDueAt} />
          </span>
        ) : (
          <span />
        )}
        <CopyMarkdownButton source={card.body} />
      </div>
    </div>
  );
}

// Shared fetch + shape used by both reader routes. Returns null when the
// card isn't visible to the viewer (RLS) so callers can notFound().
import { createClient } from '@/lib/supabase/server';

export async function loadCardReaderData(
  cardId: string,
): Promise<CardReaderData | null> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [{ data: card }, { data: review }] = await Promise.all([
    supabase
      .from('review_cards')
      .select('id, headline, body, lessons(title, lesson_number)')
      .eq('id', cardId)
      .single(),
    supabase
      .from('card_reviews')
      .select('due_at')
      .eq('card_id', cardId)
      .maybeSingle(),
  ]);

  if (!card) return null;

  const lessons = card.lessons as
    | { title: string | null; lesson_number: number | null }
    | null;
  const dueAt = review?.due_at ?? null;
  const due = dueAt != null && dueAt <= nowIso;

  return {
    headline: card.headline,
    body: card.body,
    lessonNumber: lessons?.lesson_number ?? null,
    lessonTitle: lessons?.title ?? null,
    due,
    nextDueAt: due ? null : dueAt,
  };
}
