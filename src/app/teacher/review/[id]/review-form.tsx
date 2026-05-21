'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MarkdownEditor } from '@/components/markdown-editor';
import { reviewSubmission } from '../actions';

export function ReviewForm({
  submissionId,
  xpReward,
}: {
  submissionId: string;
  xpReward: number;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingDecision, setPendingDecision] = useState<'pass' | 'fail' | null>(
    null
  );

  function submit(pass: boolean) {
    setError(null);
    setPendingDecision(pass ? 'pass' : 'fail');
    startTransition(async () => {
      const result = await reviewSubmission({
        submissionId,
        pass,
        feedback,
      });
      if (result.error) {
        setError(result.error);
        setPendingDecision(null);
        return;
      }
      router.push('/teacher/review');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">
          Feedback{' '}
          <span className="font-normal text-slate-500">
            (required if failing — markdown supported)
          </span>
        </p>
        <MarkdownEditor
          value={feedback}
          onChange={setFeedback}
          disabled={isPending}
          placeholder="What did the student get right? What needs revision? Be specific and actionable."
          rows={10}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3 pt-2">
        <Button
          type="button"
          variant="destructive"
          onClick={() => submit(false)}
          disabled={isPending}
        >
          {isPending && pendingDecision === 'fail' ? 'Failing...' : 'Fail (needs revision)'}
        </Button>
        <Button
          type="button"
          onClick={() => submit(true)}
          disabled={isPending}
          className="bg-green-600 hover:bg-green-700"
        >
          {isPending && pendingDecision === 'pass'
            ? 'Passing...'
            : `Pass (+${xpReward} XP)`}
        </Button>
      </div>
    </div>
  );
}
