import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getStudentScope, SAIGON_TZ } from '@/lib/analytics-data';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TOP_N = 5;

// Returns the Saigon-local Monday at 00:00 for the week containing the given Date.
function saigonWeekStart(d: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAIGON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  const wd = parts.find((p) => p.type === 'weekday')!.value;
  const dowMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = dowMap[wd] ?? 0;
  const utcMidnight = new Date(
    Date.UTC(year, month - 1, day) - offset * 86_400_000,
  );
  return new Date(utcMidnight.getTime() - 7 * 60 * 60 * 1000);
}

function formatSaigonShort(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: SAIGON_TZ,
  }).format(d);
}

export default async function ContentHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; expand?: 'retention' }>;
}) {
  const { class: classFilter, expand } = await searchParams;
  const supabase = await createClient();
  const scope = await getStudentScope(classFilter);

  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const now = Date.now();
  const eightWeeksAgo = new Date(now - 8 * 7 * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 86_400_000).toISOString();

  const noStudents = scope.studentIds.length === 0;

  // ----- Weekly XP -----
  const xpQuery = supabase
    .from('xp_ledger')
    .select('amount, created_at')
    .gte('created_at', eightWeeksAgo);
  const { data: xpRows } = noStudents
    ? { data: [] }
    : await xpQuery.in('student_id', scope.studentIds);

  const currentWeekStart = saigonWeekStart(new Date(now));
  const weekBuckets: { start: Date; label: string; total: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(currentWeekStart.getTime() - i * 7 * 86_400_000);
    weekBuckets.push({
      start,
      label: formatSaigonShort(start),
      total: 0,
    });
  }
  for (const row of xpRows ?? []) {
    const ts = new Date(row.created_at).getTime();
    for (let i = weekBuckets.length - 1; i >= 0; i--) {
      if (ts >= weekBuckets[i].start.getTime()) {
        weekBuckets[i].total += row.amount;
        break;
      }
    }
  }
  const maxWeekly = Math.max(1, ...weekBuckets.map((b) => b.total));

  // ----- Activity heatmap -----
  const attemptsQuery = supabase
    .from('review_attempts')
    .select('answered_at')
    .gte('answered_at', thirtyDaysAgo);
  const { data: attemptRows } = noStudents
    ? { data: [] }
    : await attemptsQuery.in('student_id', scope.studentIds);

  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    Array(24).fill(0),
  );
  const dowMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  for (const row of attemptRows ?? []) {
    const d = new Date(row.answered_at);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SAIGON_TZ,
      weekday: 'short',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const wd = parts.find((p) => p.type === 'weekday')!.value;
    const hourStr = parts.find((p) => p.type === 'hour')!.value;
    const hour = Number(hourStr) % 24;
    const dayIdx = dowMap[wd] ?? 0;
    heatmap[dayIdx][hour] += 1;
  }
  const maxCell = Math.max(1, ...heatmap.flat());
  const totalAttempts = heatmap.flat().reduce((a, b) => a + b, 0);

  // ----- Velocity distribution -----
  const velocityBuckets = [
    { range: '0.0–0.2', count: 0 },
    { range: '0.2–0.4', count: 0 },
    { range: '0.4–0.6', count: 0 },
    { range: '0.6–0.8', count: 0 },
    { range: '0.8–1.0', count: 0 },
  ];
  for (const s of scope.studentById.values()) {
    const v = Math.max(0, Math.min(0.9999, s.learning_velocity));
    const idx = Math.floor(v * 5);
    velocityBuckets[idx].count += 1;
  }
  const totalStudents = scope.studentIds.length;
  const maxVelocityBucket = Math.max(1, ...velocityBuckets.map((b) => b.count));

  // ----- Retention -----
  const reviewsForRetentionQuery = supabase
    .from('card_reviews')
    .select('stability, review_count, card_id');
  const { data: cr } = noStudents
    ? { data: [] }
    : await reviewsForRetentionQuery.in('student_id', scope.studentIds);

  const cardIds = Array.from(new Set((cr ?? []).map((r) => r.card_id)));
  let lessonByCardId = new Map<string, string>();
  if (cardIds.length > 0) {
    const { data } = await supabase
      .from('review_cards')
      .select('id, lesson_id')
      .in('id', cardIds);
    lessonByCardId = new Map((data ?? []).map((c) => [c.id, c.lesson_id]));
  }
  const lessonIds = Array.from(new Set(lessonByCardId.values()));
  let lessonNameById = new Map<string, string>();
  if (lessonIds.length > 0) {
    const { data } = await supabase
      .from('lessons')
      .select('id, title, lesson_number')
      .in('id', lessonIds);
    lessonNameById = new Map(
      (data ?? []).map((l) => [
        l.id,
        `Lesson ${l.lesson_number} — ${l.title}`,
      ]),
    );
  }
  const lessonAgg = new Map<string, { sumStability: number; n: number }>();
  for (const r of cr ?? []) {
    if (r.review_count === 0) continue;
    const lid = lessonByCardId.get(r.card_id);
    if (!lid) continue;
    const cur = lessonAgg.get(lid) ?? { sumStability: 0, n: 0 };
    cur.sumStability += Number(r.stability);
    cur.n += 1;
    lessonAgg.set(lid, cur);
  }
  const retentionRows = Array.from(lessonAgg.entries())
    .filter(([, v]) => v.n >= 5)
    .map(([lid, v]) => ({
      lessonId: lid,
      label: lessonNameById.get(lid) ?? '(unknown lesson)',
      avgStability: v.sumStability / v.n,
      n: v.n,
    }))
    .sort((a, b) => b.avgStability - a.avgStability);
  const maxRetention = Math.max(
    1,
    ...retentionRows.map((r) => r.avgStability),
  );
  const showAllRetention = expand === 'retention';
  const topRetention = retentionRows.slice(0, TOP_N);
  const bottomRetention = retentionRows.slice(-TOP_N).reverse();

  const classFilterQs = scope.classFilter
    ? `?class=${encodeURIComponent(scope.classFilter)}`
    : '';
  const expandQs = scope.classFilter
    ? `?class=${encodeURIComponent(scope.classFilter)}&expand=retention`
    : `?expand=retention`;

  return (
    <div className="space-y-6">
      {/* Weekly XP */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weekly XP</CardTitle>
          <p className="text-xs text-muted-foreground">
            Total XP earned per Saigon week (Mon–Sun), last 8 weeks.
          </p>
        </CardHeader>
        <CardContent>
          {weekBuckets.every((b) => b.total === 0) ? (
            <p className="text-sm text-muted-foreground">No XP this period.</p>
          ) : (
            <ul className="space-y-2">
              {weekBuckets.map((b) => (
                <li key={b.start.toISOString()}>
                  <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_5rem] items-center gap-3 text-xs">
                    <span className="font-mono text-muted-foreground">
                      {b.label}
                    </span>
                    <div className="min-w-0">
                      <div
                        className="h-5 rounded-md bg-primary"
                        style={{
                          width: `${Math.max(1, (b.total / maxWeekly) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-right tabular-nums text-foreground">
                      {b.total.toLocaleString()} XP
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Velocity distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Velocity distribution</CardTitle>
            <p className="text-xs text-muted-foreground">
              How learning velocity is spread across students.
            </p>
          </CardHeader>
          <CardContent>
            {totalStudents === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students in scope.
              </p>
            ) : (
              <ul className="space-y-2">
                {velocityBuckets.map((b) => (
                  <li key={b.range}>
                    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-xs">
                      <span className="font-mono text-muted-foreground">
                        {b.range}
                      </span>
                      <div className="min-w-0">
                        <div
                          className="h-4 rounded-md bg-foreground/80"
                          style={{
                            width: `${Math.max(1, (b.count / maxVelocityBucket) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-right tabular-nums text-foreground">
                        {b.count}{' '}
                        <span className="text-muted-foreground">
                          {b.count === 1 ? 'student' : 'students'}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Activity heatmap */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">When students review</CardTitle>
            <p className="text-xs text-muted-foreground">
              Day-of-week × hour, last 30 days. Saigon time. Peak:{' '}
              {maxCell} reviews in one hour.
            </p>
          </CardHeader>
          <CardContent>
            {totalAttempts === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reviews this period.
              </p>
            ) : (
              <Heatmap heatmap={heatmap} maxCell={maxCell} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Card retention */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Card retention by lesson</CardTitle>
          <p className="text-xs text-muted-foreground">
            Average FSRS stability in days. Higher = students remember longer.
            Lessons need ≥5 reviewed cards from in-scope students to appear.
          </p>
        </CardHeader>
        <CardContent>
          {retentionRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not enough reviewed cards yet.
            </p>
          ) : showAllRetention ? (
            <RetentionList
              rows={retentionRows}
              maxRetention={maxRetention}
              variant="all"
            />
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-destructive">
                  <span className="h-2 w-2 rounded-full bg-destructive" />
                  Fading fastest
                </p>
                <RetentionList
                  rows={bottomRetention}
                  maxRetention={maxRetention}
                  variant="bottom"
                />
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Sticking best
                </p>
                <RetentionList
                  rows={topRetention}
                  maxRetention={maxRetention}
                  variant="top"
                />
              </div>
              {retentionRows.length > TOP_N * 2 && (
                <a
                  href={`/teacher/analytics/content${expandQs}`}
                  className="block text-center text-xs font-medium text-primary hover:underline"
                >
                  Show all {retentionRows.length} lessons
                </a>
              )}
            </div>
          )}
          {showAllRetention && (
            <a
              href={`/teacher/analytics/content${classFilterQs}`}
              className="mt-3 block text-center text-xs font-medium text-primary hover:underline"
            >
              Collapse
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Heatmap({
  heatmap,
  maxCell,
}: {
  heatmap: number[][];
  maxCell: number;
}) {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Show hour labels at 0, 6, 12, 18 to avoid clutter.
  return (
    <div className="space-y-1">
      {/* Hour label row */}
      <div
        className="grid gap-px text-[9px] text-muted-foreground/70"
        style={{ gridTemplateColumns: '1.5rem repeat(24, minmax(0,1fr))' }}
      >
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center">
            {h % 6 === 0 ? h : ''}
          </span>
        ))}
      </div>
      {DAYS.map((label, dayIdx) => (
        <div
          key={label}
          className="grid items-center gap-px"
          style={{ gridTemplateColumns: '1.5rem repeat(24, minmax(0,1fr))' }}
        >
          <span className="text-[10px] text-muted-foreground">{label}</span>
          {heatmap[dayIdx].map((cnt, h) => {
            const intensity = cnt / maxCell;
            const bg =
              cnt === 0
                ? 'bg-muted/40'
                : intensity > 0.75
                  ? 'bg-primary'
                  : intensity > 0.5
                    ? 'bg-primary/70'
                    : intensity > 0.25
                      ? 'bg-primary/40'
                      : 'bg-primary/20';
            return (
              <div
                key={h}
                role="img"
                aria-label={`${label} ${h}:00 — ${cnt} ${cnt === 1 ? 'review' : 'reviews'}`}
                title={`${label} ${h}:00 — ${cnt} reviews`}
                className={cn('aspect-square rounded-sm', bg)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function RetentionList({
  rows,
  maxRetention,
  variant,
}: {
  rows: Array<{
    lessonId: string;
    label: string;
    avgStability: number;
    n: number;
  }>;
  maxRetention: number;
  variant: 'top' | 'bottom' | 'all';
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.lessonId}>
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 text-xs">
            <span className="min-w-0 truncate font-medium text-foreground">
              {row.label}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {row.avgStability.toFixed(1)}d · {row.n}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full',
                variant === 'bottom' ? 'bg-destructive/70' : 'bg-primary',
              )}
              style={{
                width: `${Math.max(2, (row.avgStability / maxRetention) * 100)}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
