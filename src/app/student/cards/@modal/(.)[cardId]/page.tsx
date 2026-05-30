import { notFound } from 'next/navigation';
import { CardModal } from '@/components/card-modal';
import { CardReader, loadCardReaderData } from '@/components/cards/card-reader';

// Intercepting route: clicking a card from /student/cards renders the
// reader into the @modal slot over the browser. Refresh / deep-link hits
// the full-page route instead.

export default async function CardModalPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const card = await loadCardReaderData(cardId);
  if (!card) notFound();

  return (
    <CardModal>
      <CardReader card={card} />
    </CardModal>
  );
}
