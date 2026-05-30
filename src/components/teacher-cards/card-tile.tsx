import { GridTile } from '@/components/ui/grid-tile';
import { CardStatus } from './status-bits';
import type { CardRow } from './types';

export function CardTile({ lessonId, card }: { lessonId: string; card: CardRow }) {
  return (
    <GridTile href={`/teacher/cards/${lessonId}/cards/${card.id}`}>
      <p className="line-clamp-2 text-sm font-medium leading-snug">{card.headline}</p>
      <CardStatus questionCount={card.questionCount} recall={card.recall} />
    </GridTile>
  );
}
