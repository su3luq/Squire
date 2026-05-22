'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toggleRegistration } from './actions';

export function RegistrationToggle({
  classId,
  isOpen,
  isArchived,
}: {
  classId: string;
  isOpen: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const r = await toggleRegistration(classId);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={isPending || isArchived}
      >
        {isPending
          ? 'Updating...'
          : isOpen
            ? 'Close registration'
            : 'Open registration'}
      </Button>
      <p className="text-xs text-slate-500">
        {isArchived
          ? 'Class is archived. Unarchive to allow toggling.'
          : isOpen
            ? 'Students can register into this class right now.'
            : 'This class will not appear in the student registration dropdown.'}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
