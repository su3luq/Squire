'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { createLesson, type CreateLessonState } from './actions';

type ClassOption = { id: string; name: string };

const initialState: CreateLessonState = { error: null };

export function NewLessonForm({
  classes,
  nextLessonNumber,
  defaultTitle,
}: {
  classes: ClassOption[];
  nextLessonNumber: number;
  defaultTitle: string;
}) {
  const [state, formAction, isPending] = useActionState(createLesson, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="class_id">Class</Label>
        {classes.length === 1 ? (
          <>
            <Input id="class_display" value={classes[0].name} disabled />
            <input type="hidden" name="class_id" value={classes[0].id} />
          </>
        ) : (
          <select
            id="class_id"
            name="class_id"
            defaultValue={classes[0]?.id ?? ''}
            disabled={isPending}
            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            required
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

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
        <p className="text-xs text-slate-500">Must be unique within the class.</p>
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
