'use client';

import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/confirm-button';
import { deleteLesson } from './actions';

export function DeleteLessonButton({
  lessonId,
  cardCount,
}: {
  lessonId: string;
  cardCount: number;
}) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Delete lesson"
      pendingLabel="Deleting…"
      title="Delete this lesson?"
      description={`This will permanently remove the lesson, all ${cardCount} ${cardCount === 1 ? 'card' : 'cards'}, and any review state for students. This cannot be undone.`}
      action={() => deleteLesson(lessonId)}
      onSuccess={() => {
        router.push('/teacher/lessons');
        router.refresh();
      }}
    />
  );
}
