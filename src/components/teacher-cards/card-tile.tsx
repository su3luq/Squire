import Link from 'next/link';
import { CardStatus } from './status-bits';
import type { CardRow } from './types';

export function CardTile({ lessonId, card }: { lessonId: string; card: CardRow }) {
  return (
    <Link
      href={`/teacher/cards/${lessonId}/cards/${card.id}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <p className="text-sm font-medium leading-snug">{card.headline}</p>
      <CardStatus questionCount={card.questionCount} recall={card.recall} />
    </Link>
  );
}
