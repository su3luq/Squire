import { z } from 'zod';

export const questFormSchema = z
  .object({
    quest_type: z.enum(['solo', 'coop']),
    class_id: z.string().uuid({ message: 'Select a class.' }),
    title: z.string().trim().min(1, { message: 'Title is required.' }).max(200),
    description: z.string().default(''),
    xp_reward: z.coerce
      .number({ message: 'XP reward is required.' })
      .int({ message: 'XP reward must be a whole number.' })
      .min(1, { message: 'XP reward must be at least 1.' }),
    word_limit_min: z
      .union([z.coerce.number().int().min(0), z.literal('').transform(() => null)])
      .nullable()
      .optional(),
    max_team_size: z
      .union([z.coerce.number().int().min(2), z.literal('').transform(() => null)])
      .nullable()
      .optional(),
    expires_at: z.string().nullable().optional().default(null),
  })
  .superRefine((data, ctx) => {
    if (data.quest_type === 'coop') {
      if (data.max_team_size == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['max_team_size'],
          message: 'Max team size is required for co-op (min 2).',
        });
      }
      if (!data.expires_at || data.expires_at.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['expires_at'],
          message: 'Matchmaking deadline is required for co-op.',
        });
      }
    }
  });

export type QuestFormValues = z.infer<typeof questFormSchema>;

export const emptyQuest: QuestFormValues = {
  quest_type: 'solo',
  class_id: '',
  title: '',
  description: '',
  xp_reward: 20,
  word_limit_min: null,
  max_team_size: null,
  expires_at: null,
};

// Parse a datetime-local input value (browser-local) as Saigon time and
// serialize as a UTC ISO string for storage. Returns null for empty input.
// We force the +07:00 offset regardless of the browser's timezone because
// the teacher's intent is always Saigon-local (per CLAUDE.md hard rule #7).
export function saigonLocalToIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withOffset = trimmed.length === 16 ? `${trimmed}:00+07:00` : `${trimmed}+07:00`;
  const d = new Date(withOffset);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Inverse: a UTC ISO timestamp → "YYYY-MM-DDTHH:MM" in Saigon time, suitable
// for a datetime-local input's value attribute.
export function isoToSaigonLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const saigonMs = d.getTime() + 7 * 60 * 60 * 1000;
  const s = new Date(saigonMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}T${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
}
