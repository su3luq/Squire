import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  getClassMap,
  getStudentScope,
  relativeDaysAgo,
} from '@/lib/analytics-data';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const LOW_VELOCITY = 0.3;
const REPEAT_FAIL_THRESHOLD = 3;
const INACTIVE_DAYS = 4;

type SortKey = 'velocity' | 'fails' | 'name';

export default async function AtRiskPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; sort?: SortKey }>;
}) {
  const { class: classFilter, sort: sortRaw } = await searchParams;
  const sort: SortKey = sortRaw ?? 'velocity';
  const supabase = await createClient();
  const [scope, classMap] = await Promise.all([
    getStudentScope(classFilter),
    getClassMap(),
  ]);

  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const now = Date.now();
  const inactiveCutoff = new Date(
    now - INACTIVE_DAYS * 86_400_000,
  ).toISOString();

  const noStudents = scope.studentIds.length === 0;

  // ----- Failed submissions (for repeat-fail detection) -----
  const failedQuery = supabase
    .from('quest_submissions')
    .select('acceptance_id, instance_id, submitted_by')
    .eq('status', 'failed');
  const { data: failedSubs } = noStudents
    ? { data: [] }
    : await failedQuery.in('submitted_by', scope.studentIds);

  // ----- Acceptances (for mapping back from acceptance/instance to students) -----
  const acceptancesQuery = supabase
    .from('quest_acceptances')
    .select('id, instance_id, student_id, quest_id');
  const { data: acceptances } = noStudents
    ? { data: [] }
    : await acceptancesQuery.in('student_id', scope.studentIds);

  // ----- Last review per student (for inactivity flag) -----
  const lastReviewQuery = supabase
    .from('review_attempts')
    .select('student_id, answered_at')
    .order('answered_at', { ascending: false });
  const { data: recentAttempts } = noStudents
    ? { data: [] }
    : await lastReviewQuery.in('student_id', scope.studentIds).limit(2000);

  // ----- Card review due counts (does the student even have something to do?) -----
  const dueReviewsQuery = supabase
    .from('card_reviews')
    .select('student_id')
    .lte('due_at', new Date(now).toISOString());
  const { data: dueRows } = noStudents
    ? { data: [] }
    : await dueReviewsQuery.in('student_id', scope.studentIds);

  // Tally
  const failsByGroup = new Map<string, number>();
  for (const s of failedSubs ?? []) {
    const key = s.acceptance_id
      ? `a:${s.acceptance_id}`
      : s.instance_id
        ? `i:${s.instance_id}`
        : null;
    if (!key) continue;
    failsByGroup.set(key, (failsByGroup.get(key) ?? 0) + 1);
  }

  const lastReviewByStudent = new Map<string, string>();
  for (const r of recentAttempts ?? []) {
    if (!lastReviewByStudent.has(r.student_id)) {
      lastReviewByStudent.set(r.student_id, r.answered_at);
    }
  }

  const dueCountByStudent = new Map<string, number>();
  for (const r of dueRows ?? []) {
    dueCountByStudent.set(
      r.student_id,
      (dueCountByStudent.get(r.student_id) ?? 0) + 1,
    );
  }

  type Flag = {
    label: string;
    tone: 'destructive' | 'warn' | 'muted';
    detail?: string;
  };
  type Entry = {
    studentId: string;
    fullName: string;
    classId: string | null;
    velocity: number;
    flags: Flag[];
    failCount: number;
    lastReviewIso: string | null;
  };
  const entries = new Map<string, Entry>();

  function ensureEntry(studentId: string): Entry | null {
    const profile = scope.studentById.get(studentId);
    if (!profile) return null;
    let entry = entries.get(studentId);
    if (!entry) {
      entry = {
        studentId,
        fullName: profile.full_name,
        classId: profile.class_id,
        velocity: profile.learning_velocity,
        flags: [],
        failCount: 0,
        lastReviewIso: lastReviewByStudent.get(studentId) ?? null,
      };
      entries.set(studentId, entry);
    }
    return entry;
  }

  // Low velocity
  for (const s of scope.studentById.values()) {
    if (s.learning_velocity < LOW_VELOCITY) {
      const entry = ensureEntry(s.id);
      if (!entry) continue;
      entry.flags.push({
        label: 'Low velocity',
        tone: 'destructive',
        detail: s.learning_velocity.toFixed(2),
      });
    }
  }

  // Repeat fails
  for (const [key, count] of failsByGroup.entries()) {
    if (count < REPEAT_FAIL_THRESHOLD) continue;
    if (key.startsWith('a:')) {
      const accId = key.slice(2);
      const acc = (acceptances ?? []).find((a) => a.id === accId);
      if (!acc) continue;
      const entry = ensureEntry(acc.student_id);
      if (!entry) continue;
      entry.failCount = Math.max(entry.failCount, count);
      entry.flags.push({
        label: 'Repeat fails',
        tone: 'warn',
        detail: `${count}×`,
      });
    } else {
      const instId = key.slice(2);
      for (const acc of (acceptances ?? []).filter(
        (a) => a.instance_id === instId,
      )) {
        const entry = ensureEntry(acc.student_id);
        if (!entry) continue;
        entry.failCount = Math.max(entry.failCount, count);
        entry.flags.push({
          label: 'Team fails',
          tone: 'warn',
          detail: `${count}×`,
        });
      }
    }
  }

  // Inactive: due cards + no review in 4+ days
  for (const studentId of scope.studentIds) {
    const due = dueCountByStudent.get(studentId) ?? 0;
    if (due === 0) continue;
    const last = lastReviewByStudent.get(studentId);
    const isInactive =
      !last || last < inactiveCutoff; // no review in the cutoff window
    if (!isInactive) continue;
    const entry = ensureEntry(studentId);
    if (!entry) continue;
    entry.flags.push({
      label: 'Inactive',
      tone: 'warn',
      detail: last ? relativeDaysAgo(last, now) : 'no reviews',
    });
  }

  const allEntries = Array.from(entries.values());

  // Sort
  switch (sort) {
    case 'velocity':
      allEntries.sort((a, b) => a.velocity - b.velocity);
      break;
    case 'fails':
      allEntries.sort((a, b) => b.failCount - a.failCount);
      break;
    case 'name':
      allEntries.sort((a, b) => a.fullName.localeCompare(b.fullName));
      break;
  }

  const classFilterQs = scope.classFilter
    ? `class=${encodeURIComponent(scope.classFilter)}`
    : '';
  function sortHref(s: SortKey): string {
    const sp = new URLSearchParams();
    if (scope.classFilter) sp.set('class', scope.classFilter);
    if (s !== 'velocity') sp.set('sort', s);
    const qs = sp.toString();
    return qs ? `/teacher/analytics/at-risk?${qs}` : '/teacher/analytics/at-risk';
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Students needing intervention
          <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
            {allEntries.length}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Flagged for low velocity (&lt;{LOW_VELOCITY}), ≥
          {REPEAT_FAIL_THRESHOLD} fails on one quest, or no reviews in{' '}
          {INACTIVE_DAYS}+ days despite having due cards.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Sort by:</span>
          <SortChip current={sort} value="velocity" href={sortHref('velocity')}>
            Velocity
          </SortChip>
          <SortChip current={sort} value="fails" href={sortHref('fails')}>
            Fails
          </SortChip>
          <SortChip current={sort} value="name" href={sortHref('name')}>
            Name
          </SortChip>
          {classFilterQs && (
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {classMap.get(scope.classFilter ?? '') ?? 'class'}
            </span>
          )}
        </div>

        {allEntries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nobody flagged. Either everyone&apos;s on track or there isn&apos;t
            enough data yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {allEntries.map((entry) => {
              const link = entry.classId
                ? `/teacher/classes/${entry.classId}/students/${entry.studentId}`
                : null;
              const className = entry.classId
                ? classMap.get(entry.classId) ?? 'Unknown class'
                : 'Unassigned';
              return (
                <li
                  key={entry.studentId}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    {link ? (
                      <Link
                        href={link}
                        className="block truncate text-sm font-medium hover:text-primary hover:underline"
                      >
                        {entry.fullName}
                      </Link>
                    ) : (
                      <span className="block truncate text-sm font-medium">
                        {entry.fullName}
                      </span>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {className} · velocity {entry.velocity.toFixed(2)} ·
                      last review{' '}
                      {entry.lastReviewIso
                        ? relativeDaysAgo(entry.lastReviewIso, now)
                        : 'never'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5 sm:max-w-[55%] sm:justify-end">
                    {entry.flags.map((f, idx) => (
                      <span
                        key={`${f.label}-${idx}`}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          f.tone === 'destructive'
                            ? 'bg-destructive/10 text-destructive'
                            : f.tone === 'warn'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {f.label}
                        {f.detail ? ` · ${f.detail}` : ''}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SortChip({
  current,
  value,
  href,
  children,
}: {
  current: SortKey;
  value: SortKey;
  href: string;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full px-2.5 py-1 font-medium transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'border border-border bg-card text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </Link>
  );
}
