'use client';

import { useState, useTransition } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { BlockNoteEditor } from '@/components/blocknote-editor';
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
      <div className="space-y-2">
        <Label htmlFor="headline">Headline</Label>
        <Input
          id="headline"
          {...register('headline')}
          disabled={isPending}
          placeholder="The concept or term this card teaches"
        />
        {errors.headline && (
          <p className="text-xs text-red-600">{errors.headline.message}</p>
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
            <BlockNoteEditor
              value={field.value}
              onChange={field.onChange}
              editable={!isPending}
            />
          )}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>Quiz questions</Label>
            <p className="text-xs text-slate-500">
              Up to 10 multiple choice questions. At least one is required for
              the card to enter the review system when its lesson is unlocked.
            </p>
          </div>
          <button
            type="button"
            onClick={() => append(emptyMcq)}
            disabled={isPending || fields.length >= 10}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Add question
          </button>
        </div>
        {fields.length === 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This card has no quiz questions. It can be saved as a draft but
            will not appear in student reviews until you add at least one.
          </div>
        )}
        {errors.questions && !Array.isArray(errors.questions) && (
          <p className="text-xs text-red-600">
            {(errors.questions as { message?: string }).message}
          </p>
        )}

        <div className="space-y-4">
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Question {idx + 1}</p>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  disabled={isPending}
                  className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
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
                  <p className="text-xs text-red-600">
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
                <p className="text-xs text-red-600">
                  {errors.questions[idx]?.correct_choice?.message}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <Link
          href={`/teacher/lessons/${lessonId}`}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : mode === 'new' ? 'Create card' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

function ChoiceRow({
  idx,
  letter,
  register,
  control,
  error,
  disabled,
}: {
  idx: number;
  letter: 'a' | 'b' | 'c' | 'd';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name={`questions.${idx}.correct_choice` as const}
          render={({ field }) => (
            <input
              type="radio"
              id={`q-${idx}-correct-${letter}`}
              name={`questions.${idx}.correct_choice`}
              checked={field.value === letter}
              onChange={() => field.onChange(letter)}
              disabled={disabled}
              className="h-4 w-4"
              aria-label={`Mark choice ${letter.toUpperCase()} as correct`}
            />
          )}
        />
        <Label
          htmlFor={`q-${idx}-choice-${letter}`}
          className="text-xs uppercase text-slate-500"
        >
          {letter}
        </Label>
        <Input
          id={`q-${idx}-choice-${letter}`}
          {...register(`questions.${idx}.choice_${letter}` as const)}
          disabled={disabled}
          className="flex-1"
        />
      </div>
      {error && <p className="ml-6 text-xs text-red-600">{error}</p>}
    </div>
  );
}
