'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MarkdownEditor } from '@/components/markdown-editor';
import {
  emptyQuest,
  questFormSchema,
  type QuestFormValues,
} from '@/lib/quest-schema';

type FormInput = z.input<typeof questFormSchema>;

type ClassOption = { id: string; name: string };

type QuestFormAction = (
  values: QuestFormValues
) => Promise<{ error: string | null; id?: string }>;

export function QuestForm({
  classes,
  initial,
  mode,
  action,
  cancelHref,
  lockCoopFields = false,
}: {
  classes: ClassOption[];
  initial?: QuestFormValues;
  mode: 'new' | 'edit';
  action: QuestFormAction;
  cancelHref: string;
  /**
   * When true, max_team_size is read-only with an inline notice. Set by the
   * edit page when acceptances exist (Spec E: live-update editing model).
   */
  lockCoopFields?: boolean;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, QuestFormValues>({
    resolver: zodResolver(questFormSchema),
    defaultValues:
      initial ??
      (classes.length === 1
        ? { ...emptyQuest, class_id: classes[0].id }
        : emptyQuest),
  });

  const questType = watch('quest_type');
  const maxTeamSize = watch('max_team_size');

  function onSubmit(values: QuestFormValues) {
    setServerError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await action(values);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      if (mode === 'new' && result?.id) {
        router.push(`/teacher/quests/${result.id}`);
        router.refresh();
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Section: Basics */}
      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">Basics</h2>
          <p className="text-xs text-slate-500">
            Type, class, title, and description.
          </p>
        </header>

        <fieldset className="space-y-2" disabled={isPending}>
          <Label>Quest type</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="solo"
                {...register('quest_type')}
                disabled={mode === 'edit'}
              />
              <span>Solo — one student works independently</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="coop"
                {...register('quest_type')}
                disabled={mode === 'edit'}
              />
              <span>Co-op — teams formed via matchmaking</span>
            </label>
          </div>
          {mode === 'edit' && (
            <p className="text-xs text-slate-500">
              Quest type can&apos;t be changed after creation.
            </p>
          )}
          {errors.quest_type && (
            <p className="text-xs text-red-600">{errors.quest_type.message}</p>
          )}
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="class_id">Class</Label>
          <select
            id="class_id"
            {...register('class_id')}
            disabled={isPending}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select a class...</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.class_id && (
            <p className="text-xs text-red-600">{errors.class_id.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            {...register('title')}
            disabled={isPending}
            placeholder="Short, action-oriented title"
          />
          {errors.title && (
            <p className="text-xs text-red-600">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <p className="text-xs text-slate-500">
            Markdown. Images via{' '}
            <code className="rounded bg-slate-100 px-1">![alt](url)</code>, links to
            YouTube and direct video files render as embeds.
          </p>
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <MarkdownEditor
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={isPending}
                placeholder="What students need to do, how it'll be assessed, any examples or constraints..."
              />
            )}
          />
        </div>
      </section>

      {/* Section: Mechanics */}
      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">Mechanics</h2>
          <p className="text-xs text-slate-500">XP reward and word target.</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="xp_reward">XP reward</Label>
            <Input
              id="xp_reward"
              type="number"
              inputMode="numeric"
              min={1}
              {...register('xp_reward')}
              disabled={isPending}
            />
            {errors.xp_reward && (
              <p className="text-xs text-red-600">{errors.xp_reward.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="word_limit_min">Word target (optional)</Label>
            <Input
              id="word_limit_min"
              type="number"
              inputMode="numeric"
              min={0}
              {...register('word_limit_min')}
              disabled={isPending}
              placeholder="e.g. 150"
            />
            <p className="text-xs text-slate-500">
              Shown to students as guidance. Not enforced at submit.
            </p>
            {errors.word_limit_min && (
              <p className="text-xs text-red-600">{errors.word_limit_min.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* Section: Co-op */}
      {questType === 'coop' && (
        <section className="space-y-4">
          <header>
            <h2 className="text-lg font-semibold">Co-op</h2>
            <p className="text-xs text-slate-500">
              Matchmaking will run automatically at the deadline.
            </p>
          </header>

          {lockCoopFields && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This co-op quest already has enrolled students. Max team size can&apos;t
              be changed.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max_team_size">Max team size</Label>
              <Input
                id="max_team_size"
                type="number"
                inputMode="numeric"
                min={2}
                {...register('max_team_size')}
                disabled={isPending || lockCoopFields}
                placeholder="2 or more"
              />
              {maxTeamSize != null && Number(maxTeamSize) === 2 && (
                <p className="text-xs text-slate-500">
                  If the number of enrolled students is odd, one team may have 3 members.
                </p>
              )}
              {errors.max_team_size && (
                <p className="text-xs text-red-600">{errors.max_team_size.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expires_at">Matchmaking deadline (Saigon)</Label>
              <Input
                id="expires_at"
                type="datetime-local"
                {...register('expires_at')}
                disabled={isPending}
              />
              <p className="text-xs text-slate-500">
                Students can enroll until this moment. Then teams are formed.
              </p>
              {errors.expires_at && (
                <p className="text-xs text-red-600">{errors.expires_at.message}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Section: Schedule (solo only) */}
      {questType === 'solo' && (
        <section className="space-y-4">
          <header>
            <h2 className="text-lg font-semibold">Schedule</h2>
            <p className="text-xs text-slate-500">Optional expiry.</p>
          </header>

          <div className="space-y-2">
            <Label htmlFor="expires_at">Expires at (Saigon, optional)</Label>
            <Input
              id="expires_at"
              type="datetime-local"
              {...register('expires_at')}
              disabled={isPending}
            />
            <p className="text-xs text-slate-500">
              After this moment, students can no longer accept. Leave blank for no expiry.
            </p>
            {errors.expires_at && (
              <p className="text-xs text-red-600">{errors.expires_at.message}</p>
            )}
          </div>
        </section>
      )}

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}

      <div className="flex gap-3 pt-2">
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: 'outline', className: 'flex-1' })}
        >
          Cancel
        </Link>
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending
            ? mode === 'new'
              ? 'Creating...'
              : 'Saving...'
            : mode === 'new'
              ? 'Create quest'
              : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
