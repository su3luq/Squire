'use client';

import { useState, useTransition } from 'react';
import { renameLesson } from '../actions';

// Inline-rename for the lesson title. Used on the card editor pages so the teacher
// can iterate on the lesson name while writing cards.

export function LessonTitleRename({
  lessonId,
  initialTitle,
}: {
  lessonId: string;
  initialTitle: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTitle);
  const [displayed, setDisplayed] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Title cannot be empty.');
      setValue(displayed);
      setEditing(false);
      return;
    }
    if (trimmed === displayed) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await renameLesson(lessonId, trimmed);
      if (result.error) {
        setError(result.error);
        setValue(displayed);
        setEditing(false);
        return;
      }
      setDisplayed(trimmed);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setValue(displayed);
              setEditing(false);
            }
          }}
          disabled={isPending}
          className="w-full rounded-md border border-blue-400 bg-white px-2 py-1 text-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-300"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-2 cursor-text rounded-md px-2 py-1 text-left text-2xl font-bold text-slate-900 transition-colors hover:bg-slate-100"
        title="Click to rename"
      >
        {displayed}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
