'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveAssessment, type AssessmentState } from './actions';

const initialState: AssessmentState = { error: null, success: false };

export function AssessmentForm({
  studentId,
  initialPearson,
  initialCefr,
}: {
  studentId: string;
  initialPearson: number | null;
  initialCefr: string | null;
}) {
  const bound = saveAssessment.bind(null, studentId);
  const [state, formAction, isPending] = useActionState(bound, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pearson">Pearson English (10–90)</Label>
          <Input
            id="pearson"
            name="pearson"
            type="number"
            inputMode="numeric"
            min={10}
            max={90}
            defaultValue={initialPearson ?? ''}
            disabled={isPending}
            placeholder="e.g. 58"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cefr">CEFR level</Label>
          <Input
            id="cefr"
            name="cefr"
            type="text"
            maxLength={8}
            defaultValue={initialCefr ?? ''}
            disabled={isPending}
            placeholder="A1, A2, B1, B2, C1, C2"
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Teacher-only fields. Students never see these.
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">Saved.</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save assessment'}
      </Button>
    </form>
  );
}
