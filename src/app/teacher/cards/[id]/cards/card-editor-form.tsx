'use client';

import { useState, useTransition } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { MdxEditor } from '@/components/mdx-editor';
import { cn } from '@/lib/utils';
import {
  cardSchema,
  emptyCard,
  emptyMcq,
  type CardFormValues,
} from '@/lib/card-schema';

type CardEditorAction = (values: CardFormValues) => Promise<{ error: string | null }>;

export function CardEditorForm({
  lessonId,
  initial,
  mode,
  action,
}: {
  lessonId: string;
  initial?: CardFormValues;
  mode: 'new' | 'edit';
  action: CardEditorAction;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: initial ?? emptyCard,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'questions',
  });

  function onSubmit(values: CardFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await action(values);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      // Success path: action redirects, but in case it returns we refresh.
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Content section */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Content</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              {...register('headline')}
              disabled={isPending}
              placeholder="The concept or term this card teaches"
              className="text-base font-semibold"
            />
            {errors.headline && (
              <p className="text-xs text-destructive">{errors.headline.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Body</Label>
            <p className="text-xs text-muted-foreground">
              Type <code>/</code> for block commands. Images via <code>![alt](url)</code>.
              Lone YouTube and direct video URLs become embeds when the card is rendered.
            </p>
            <Controller
              control={control}
              name="body"
              render={({ field }) => (
                <MdxEditor
                  value={field.value}
                  onChange={field.onChange}
                  editable={!isPending}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Quiz section */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Quiz · {fields.length} of 10
          </h3>
          <button
            type="button"
            onClick={() => append(emptyMcq)}
            disabled={isPending || fields.length >= 10}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Add question
          </button>
        </div>
        <div className="p-4 space-y-4">
          {fields.length === 0 && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              No questions yet — this card stays a draft until you add one. Students only review cards with at least one question.
            </div>
          )}
          {errors.questions && !Array.isArray(errors.questions) && (
            <p className="text-xs text-destructive">
              {(errors.questions as { message?: string }).message}
            </p>
          )}

          <div className="space-y-4">
            {fields.map((field, idx) => (
              <div
                key={field.id}
                className="rounded-xl border border-border bg-muted/40 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Question {idx + 1}</p>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    disabled={isPending}
                    className="text-xs text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`q-${idx}-text`} className="text-xs">
                    Question
                  </Label>
                  <Input
                    id={`q-${idx}-text`}
                    {...register(`questions.${idx}.question_text` as const)}
                    disabled={isPending}
                  />
                  {errors.questions?.[idx]?.question_text && (
                    <p className="text-xs text-destructive">
                      {errors.questions[idx]?.question_text?.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {(['a', 'b', 'c', 'd'] as const).map((letter) => (
                    <ChoiceRow
                      key={letter}
                      idx={idx}
                      letter={letter}
                      register={register}
                      control={control}
                      error={errors.questions?.[idx]?.[`choice_${letter}` as const]?.message}
                      disabled={isPending}
                    />
                  ))}
                </div>
                {errors.questions?.[idx]?.correct_choice && (
                  <p className="text-xs text-destructive">
                    {errors.questions[idx]?.correct_choice?.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {mode === 'new' ? 'New card — not yet saved' : 'Unsaved changes'}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href={`/teacher/cards/${lessonId}`}
            className={buttonVariants({ variant: 'outline' })}
          >
            Cancel
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : mode === 'new' ? 'Create card' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ChoiceRow({ idx, letter, register, control, error, disabled }: {
  idx: number; letter: 'a' | 'b' | 'c' | 'd';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any; // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any; error?: string; disabled?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={`questions.${idx}.correct_choice` as const}
      render={({ field }) => {
        const correct = field.value === letter;
        return (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => field.onChange(letter)}
              disabled={disabled}
              aria-pressed={correct}
              aria-label={`Mark choice ${letter.toUpperCase()} correct`}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                correct ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/40',
              )}
            >
              <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded-full border-2', correct ? 'border-primary bg-primary' : 'border-muted-foreground/40')}>
                {correct && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className={cn('text-xs font-bold', correct ? 'text-primary' : 'text-muted-foreground')}>{letter.toUpperCase()}</span>
              <input
                {...register(`questions.${idx}.choice_${letter}` as const)}
                disabled={disabled}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={`Choice ${letter.toUpperCase()}`}
              />
              {correct && <span className="text-[9px] font-bold uppercase tracking-wide text-primary">Correct</span>}
            </button>
            {error && <p className="ml-6 text-xs text-destructive">{error}</p>}
          </div>
        );
      }}
    />
  );
}
