'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MdxEditor } from '@/components/mdx-editor';
import { countWords } from '@/lib/word-count';
import { submitQuest } from './actions';

export function SubmissionForm({
  questId,
  acceptanceId,
  instanceId,
  wordTarget,
  initialText = '',
  startCollapsed = false,
  collapsedLabel = 'Resubmit',
}: {
  questId: string;
  acceptanceId: string | null;
  instanceId: string | null;
  wordTarget: number | null;
  initialText?: string;
  startCollapsed?: boolean;
  collapsedLabel?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [isPending, startTransition] = useTransition();

  const words = countWords(text);
  const targetMet = wordTarget === null || words >= wordTarget;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitQuest({
        questId,
        acceptanceId,
        instanceId,
        textContent: text,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Submitted — waiting on teacher review');
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <Button type="button" onClick={() => setCollapsed(false)} size="lg">
        {collapsedLabel}
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <MdxEditor
        value={text}
        onChange={setText}
        editable={!isPending}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className={targetMet ? 'text-slate-600' : 'text-amber-700'}>
          {words} word{words === 1 ? '' : 's'}
          {wordTarget != null && wordTarget > 0 && (
            <span> · target: {wordTarget}</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {!startCollapsed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setText('')}
              disabled={isPending || text.length === 0}
            >
              Clear
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || text.trim().length === 0}
          >
            {isPending ? 'Submitting...' : 'Submit for review'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
