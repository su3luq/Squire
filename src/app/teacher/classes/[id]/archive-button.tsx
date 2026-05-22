'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
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
  const [open, setOpen] = useState(false);

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

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const r = await archiveClass(classId);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOpen(false);
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
          {isPending ? 'Unarchiving...' : 'Unarchive class'}
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          className={buttonVariants({ variant: 'outline' })}
          disabled={isPending}
        >
          Archive class
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this class?</AlertDialogTitle>
            <AlertDialogDescription>
              The class will be hidden from the student registration dropdown
              and from the new-quest workflow. Existing students keep their
              data; you can unarchive any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={isPending}>
              {isPending ? 'Archiving...' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
