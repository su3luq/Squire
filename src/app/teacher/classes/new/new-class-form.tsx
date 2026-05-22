'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClass, type CreateClassState } from './actions';

const initialState: CreateClassState = { error: null };

export function NewClassForm() {
  const [state, formAction, isPending] = useActionState(createClass, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Class name</Label>
        <Input
          id="name"
          name="name"
          autoFocus
          required
          disabled={isPending}
          placeholder="e.g. Grade 10 A — 2026 Spring"
        />
        <p className="text-xs text-slate-500">
          You can rename it any time. New classes start with registration closed
          — open it on the detail page when you&apos;re ready for students to
          sign up.
        </p>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-3 pt-2">
        <Link
          href="/teacher/classes"
          className={buttonVariants({ variant: 'outline', className: 'flex-1' })}
        >
          Cancel
        </Link>
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create class'}
        </Button>
      </div>
    </form>
  );
}
