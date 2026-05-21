'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { closeQuest, reopenQuest } from './actions';

export function CloseQuestButton({
  questId,
  isClosed,
}: {
  questId: string;
  isClosed: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = isClosed
        ? await reopenQuest(questId)
        : await closeQuest(questId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        variant="outline"
      >
        {isPending
          ? isClosed
            ? 'Reopening...'
            : 'Closing...'
          : isClosed
            ? 'Reopen quest'
            : 'Close quest'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!isClosed && (
        <p className="text-xs text-slate-500">
          Stops new accepts/enrollments. In-flight work continues.
        </p>
      )}
    </div>
  );
}
