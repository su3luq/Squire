import { CardChip } from './card-chip';
import type { LessonData } from './types';

// The current (most recently unlocked) lesson surfaced as a quick-read row
// so the active material is one tap. Horizontal swipe on phones, a grid on
// wider screens.

export function ContinueStrip({ lesson }: { lesson: LessonData }) {
  if (lesson.cards.length === 0) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">
        Continue · Lesson{' '}
        <span className="tabular-nums">{lesson.lessonNumber}</span> —{' '}
        {lesson.title}
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
        {lesson.cards.map((card) => (
          <CardChip
            key={card.id}
            card={card}
            className="min-w-[68%] shrink-0 sm:min-w-0 sm:shrink"
          />
        ))}
      </div>
    </section>
  );
}
