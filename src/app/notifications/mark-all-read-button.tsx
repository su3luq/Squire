'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { markAllNotificationsRead } from './actions';

export function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await markAllNotificationsRead();
      toast.success('Inbox cleared');
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? 'Marking…' : 'Mark all read'}
    </Button>
  );
}
