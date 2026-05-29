'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/confirm-button';
import { Button } from '@/components/ui/button';
import { archiveClass, unarchiveClass } from './actions';

export function ArchiveButton({
  classId,
  isArchived,
}: {
  classId: string;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUnarchive() {
    setError(null);
    startTransition(async () => {
      const r = await unarchiveClass(classId);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (isArchived) {
    return (
      <div className="space-y-1">
        <Button
          type="button"
          variant="outline"
          onClick={handleUnarchive}
          disabled={isPending}
        >
          {isPending ? 'Unarchiving…' : 'Unarchive class'}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <ConfirmButton
      label="Archive class"
      pendingLabel="Archiving…"
      title="Archive this class?"
      description="The class will be hidden from the student registration dropdown and from the new-quest workflow. Existing students keep their data; you can unarchive any time."
      variant="outline"
      action={() => archiveClass(classId)}
      onSuccess={() => router.refresh()}
    />
  );
}
