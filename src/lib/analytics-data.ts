import 'server-only';
import { createClient } from '@/lib/supabase/server';

export const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

export type StudentScope = {
  classFilter: string | null;
  studentIds: string[];
  studentById: Map<
    string,
    {
      id: string;
      full_name: string;
      class_id: string | null;
      xp_total: number;
      current_rank: number | null;
      learning_velocity: number;
    }
  >;
};

/**
 * Loads the set of students in scope. Pass null/undefined/'all' to include
 * every student; pass a class UUID to restrict to that class.
 *
 * Centralised here so every analytics sub-page agrees on the same scope
 * resolution rule.
 */
export async function getStudentScope(
  classFilter: string | null | undefined,
): Promise<StudentScope> {
  const supabase = await createClient();
  const effectiveFilter =
    classFilter && classFilter !== 'all' ? classFilter : null;

  let query = supabase
    .from('profiles')
    .select(
      'id, full_name, class_id, xp_total, current_rank, learning_velocity',
    )
    .eq('role', 'student');
  if (effectiveFilter) query = query.eq('class_id', effectiveFilter);

  const { data: rows } = await query;

  const studentById = new Map<string, StudentScope['studentById'] extends Map<
    string,
    infer V
  >
    ? V
    : never>();
  for (const r of rows ?? []) {
    studentById.set(r.id, {
      id: r.id,
      full_name: r.full_name ?? '(student)',
      class_id: r.class_id ?? null,
      xp_total: r.xp_total ?? 0,
      current_rank: r.current_rank ?? null,
      learning_velocity: Number(r.learning_velocity ?? 0),
    });
  }

  return {
    classFilter: effectiveFilter,
    studentIds: Array.from(studentById.keys()),
    studentById,
  };
}

export async function getClassMap(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');
  return new Map((classes ?? []).map((c) => [c.id, c.name]));
}

export function formatSaigon(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAIGON_TZ,
  }).format(new Date(iso));
}

export function formatSaigonHour(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SAIGON_TZ,
    hour: 'numeric',
    hour12: true,
  }).format(d);
}

export function formatSaigonShort(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: SAIGON_TZ,
  }).format(d);
}

export function relativeDaysAgo(iso: string | null, now: number): string {
  if (!iso) return '—';
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Six 1-hour buckets ending at now (Saigon local). Returned oldest → newest.
 */
export function buildHourlyBuckets(now: number, count = 6) {
  const buckets: {
    start: Date;
    end: Date;
    label: string;
    reviews: number;
    submissions: number;
    xp: number;
  }[] = [];
  // Floor `now` to the start of its hour so bucket boundaries are clean.
  const floored = new Date(now);
  floored.setMinutes(0, 0, 0);
  const nowMs = floored.getTime();
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(nowMs - i * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    buckets.push({
      start,
      end,
      label: formatSaigonHour(start),
      reviews: 0,
      submissions: 0,
      xp: 0,
    });
  }
  return buckets;
}
