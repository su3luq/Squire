'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { createLesson, type CreateLessonState } from './actions';

const initialState: CreateLessonState = { error: null };

export function NewLessonForm({
  nextLessonNumber,
  defaultTitle,
}: {
  nextLessonNumber: number;
  defaultTitle: string;
}) {
  const [state, formAction, isPending] = useActionState(createLesson, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={defaultTitle}
          required
          autoFocus
          disabled={isPending}
        />
        <p className="text-xs text-slate-500">You can rename this any time.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lesson_number">Lesson number</Label>
        <Input
          id="lesson_number"
          name="lesson_number"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={nextLessonNumber}
          required
          disabled={isPending}
        />
        <p className="text-xs text-slate-500">Must be unique across all lessons.</p>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-3 pt-2">
        <Link
          href="/teacher/lessons"
          className={buttonVariants({ variant: 'outline', className: 'flex-1' })}
        >
          Cancel
        </Link>
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create lesson'}
        </Button>
      </div>
    </form>
  );
}
