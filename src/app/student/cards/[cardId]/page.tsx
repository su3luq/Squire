import { notFound } from 'next/navigation';
import { CardReader, loadCardReaderData } from '@/components/cards/card-reader';

// Full-page reader — direct navigation / refresh / deep-link to
// /student/cards/[cardId] (the intercepting modal handles in-app clicks).

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const card = await loadCardReaderData(cardId);
  if (!card) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <CardReader card={card} />
    </div>
  );
}
