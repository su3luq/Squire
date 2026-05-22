'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { transferStudent } from './actions';

export function TransferForm({
  studentId,
  options,
}: {
  studentId: string;
  options: { id: string; name: string }[];
}) {
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!target) return setError('Pick a destination class.');
    startTransition(async () => {
      const r = await transferStudent(studentId, target);
      if (r.error) {
        setError(r.error);
        return;
      }
      // transferStudent redirects on success
    });
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No other open, non-archived classes available to transfer into.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={isPending}
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Transfer to class...</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={isPending || !target}>
          {isPending ? 'Transferring...' : 'Transfer'}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        The student keeps their XP, rank, and review history. They&apos;ll
        stay on any coop team they&apos;re already in unless you disband it
        first.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
