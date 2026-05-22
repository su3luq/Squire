'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateClass, type UpdateClassState } from './actions';

const initialState: UpdateClassState = { error: null, success: false };

export function EditClassForm({
  classId,
  initialName,
}: {
  classId: string;
  initialName: string;
}) {
  const bound = updateClass.bind(null, classId);
  const [state, formAction, isPending] = useActionState(bound, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Class name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={initialName}
          required
          disabled={isPending}
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">Saved.</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save name'}
      </Button>
    </form>
  );
}
