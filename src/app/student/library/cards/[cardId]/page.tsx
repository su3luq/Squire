import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { CopyMarkdownButton } from '@/components/copy-markdown-button';

// Full-page card detail. Hit when the user navigates directly to the URL,
// refreshes the modal, or shares the link. The intercepting route at
// @modal/(.)cards/[cardId] only matches when navigating from the library
// page itself.

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
    <main className="container mx-auto max-w-3xl p-6">
      <Link
        href="/student/library"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Library
      </Link>

      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Lesson {card.lessons?.lesson_number} · {card.lessons?.title}
      </p>
      <h1 className="mb-6 mt-1 text-3xl font-bold text-slate-900">{card.headline}</h1>

      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <MarkdownRenderer
          source={card.body}
          emptyPlaceholder="This card has no body content."
        />
      </article>

      <div className="mt-4 flex justify-end">
        <CopyMarkdownButton source={card.body} />
      </div>
    </main>
  );
}
