'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MdxEditor } from '@/components/mdx-editor';
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
        <p className="text-sm font-medium">
          Feedback{' '}
          <span className="font-normal text-muted-foreground">
            (required if failing — markdown supported)
          </span>
        </p>
        <MdxEditor
          value={feedback}
          onChange={setFeedback}
          editable={!isPending}
          minHeight="220px"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-3 pt-2">
        <Button
          type="button"
          variant="destructive"
          onClick={() => submit(false)}
          disabled={isPending}
        >
          {isPending && pendingDecision === 'fail'
            ? 'Failing...'
            : 'Fail (needs revision)'}
        </Button>
        <Button type="button" onClick={() => submit(true)} disabled={isPending}>
          {isPending && pendingDecision === 'pass'
            ? 'Passing...'
            : `Pass (+${xpReward} XP)`}
        </Button>
      </div>
    </div>
  );
}
