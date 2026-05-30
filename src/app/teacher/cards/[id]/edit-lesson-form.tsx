'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { updateLesson, type UpdateLessonState } from './actions';

type Lesson = {
  id: string;
  title: string;
  lesson_number: number;
};

const initialState: UpdateLessonState = { error: null, success: false };

export function EditLessonForm({ lesson }: { lesson: Lesson }) {
  const updateLessonWithId = updateLesson.bind(null, lesson.id);
  const [state, formAction, isPending] = useActionState(updateLessonWithId, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={lesson.title}
          required
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lesson_number">Lesson number</Label>
        <Input
          id="lesson_number"
          name="lesson_number"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={lesson.lesson_number}
          required
          disabled={isPending}
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-primary">Saved.</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </Button>
    </form>
  );
}
