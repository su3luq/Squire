'use client';

import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/confirm-button';
import { deleteCard } from './actions';

export function DeleteCardButton({
  lessonId,
  cardId,
}: {
  lessonId: string;
  cardId: string;
}) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Delete card"
      pendingLabel="Deleting…"
      title="Delete this card?"
      description="The card, its quiz questions, and any student review state for it will be permanently removed. This cannot be undone."
      action={() => deleteCard(lessonId, cardId)}
      onSuccess={() => {
        router.push(`/teacher/cards/${lessonId}`);
        router.refresh();
      }}
    />
  );
}
