import Link from 'next/link';
import { ArrowRight, AlertTriangle, Sword, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import { buildHourlyBuckets, getStudentScope } from '@/lib/analytics-data';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ONE_WEEK_MS = 7 * 86_400_000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function formatDelta(curr: number, prev: number): {
  label: string;
  trend: 'positive' | 'negative' | 'neutral';
} {
  if (prev === 0 && curr === 0) return { label: 'No data yet', trend: 'neutral' };
  if (prev === 0) return { label: `+${curr.toLocaleString()} vs 0 last wk`, trend: 'positive' };
  const delta = curr - prev;
  const pct = (delta / prev) * 100;
  const sign = delta > 0 ? '+' : '';
  return {
    label: `${sign}${pct.toFixed(0)}% vs last wk`,
    trend: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
  };
}

export default async function PulsePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: classFilter } = await searchParams;
  const supabase = await createClient();
  const scope = await getStudentScope(classFilter);

  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const now = Date.now();
  const oneWeekAgo = new Date(now - ONE_WEEK_MS).toISOString();
  const twoWeeksAgo = new Date(now - 2 * ONE_WEEK_MS).toISOString();
  const sixHoursAgo = new Date(now - SIX_HOURS_MS).toISOString();

  const noStudents = scope.studentIds.length === 0;

  // ----- Rollup deltas -----
  const xpQuery = supabase
    .from('xp_ledger')
    .select('amount, created_at')
    .gte('created_at', twoWeeksAgo);
  const reviewsQuery = supabase
    .from('review_attempts')
    .select('answered_at')
    .gte('answered_at', twoWeeksAgo);
  const pulseXpQuery = supabase
    .from('xp_ledger')
    .select('student_id, amount, reason, created_at')
    .gte('created_at', sixHoursAgo);
  const pulseReviewsQuery = supabase
    .from('review_attempts')
    .select('answered_at')
    .gte('answered_at', sixHoursAgo);
  const pulseSubmissionsQuery = supabase
    .from('quest_submissions')
    .select('submitted_at, status')
    .gte('submitted_at', sixHoursAgo);

  const [
    { data: xpRows },
    { data: reviewRows },
    { data: pulseXp },
    { data: pulseReviews },
    { data: pulseSubmissions },
    { count: activeQuests },
    { count: pendingReview },
  ] = await Promise.all([
    noStudents ? { data: [] } : xpQuery.in('student_id', scope.studentIds),
    noStudents ? { data: [] } : reviewsQuery.in('student_id', scope.studentIds),
    noStudents
      ? { data: [] }
      : pulseXpQuery.in('student_id', scope.studentIds),
    noStudents
      ? { data: [] }
      : pulseReviewsQuery.in('student_id', scope.studentIds),
    noStudents
      ? { data: [] }
      : pulseSubmissionsQuery.in('submitted_by', scope.studentIds),
    supabase
      .from('quests')
      .select('id', { count: 'exact', head: true })
      .is('closed_at', null),
    supabase
      .from('quest_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review'),
  ]);

  let xpThisWeek = 0;
  let xpLastWeek = 0;
  for (const r of xpRows ?? []) {
    if (r.created_at >= oneWeekAgo) xpThisWeek += r.amount;
    else xpLastWeek += r.amount;
  }

  let reviewsThisWeek = 0;
  let reviewsLastWeek = 0;
  for (const r of reviewRows ?? []) {
    if (r.answered_at >= oneWeekAgo) reviewsThisWeek += 1;
    else reviewsLastWeek += 1;
  }

  const totalStudents = scope.studentIds.length;
  const avgVelocity =
    totalStudents > 0
      ? Array.from(scope.studentById.values()).reduce(
          (sum, s) => sum + s.learning_velocity,
          0,
        ) / totalStudents
      : 0;

  // ----- Today's pulse buckets -----
  const buckets = buildHourlyBuckets(now, 6);
  function bucketFor(iso: string): number {
    const ts = new Date(iso).getTime();
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (ts >= buckets[i].start.getTime()) return i;
    }
    return -1;
  }
  for (const row of pulseReviews ?? []) {
    const i = bucketFor(row.answered_at);
    if (i >= 0) buckets[i].reviews += 1;
  }
  for (const row of pulseSubmissions ?? []) {
    const i = bucketFor(row.submitted_at);
    if (i >= 0) buckets[i].submissions += 1;
  }
  for (const row of pulseXp ?? []) {
    const i = bucketFor(row.created_at);
    if (i >= 0) buckets[i].xp += row.amount;
  }
  const pulseTotals = {
    reviews: buckets.reduce((a, b) => a + b.reviews, 0),
    submissions: buckets.reduce((a, b) => a + b.submissions, 0),
    xp: buckets.reduce((a, b) => a + b.xp, 0),
  };
  const maxReviews = Math.max(1, ...buckets.map((b) => b.reviews));
  const maxSubs = Math.max(1, ...buckets.map((b) => b.submissions));
  const maxXp = Math.max(1, ...buckets.map((b) => b.xp));

  // ----- Top 3 at-risk (low velocity) -----
  const atRiskCandidates = Array.from(scope.studentById.values())
    .filter((s) => s.learning_velocity < 0.3)
    .sort((a, b) => a.learning_velocity - b.learning_velocity)
    .slice(0, 3);

  // ----- Top 3 quests needing attention -----
  // Compute pass-rate per quest from non-active acceptances of in-scope
  // students, plus stuck (≥3 pending) and dormant (no acceptances in 14d).
  const acceptancesQuery = supabase
    .from('quest_acceptances')
    .select('id, quest_id, status, accepted_at, completed_at, student_id');
  const { data: acceptances } = noStudents
    ? { data: [] }
    : await acceptancesQuery.in('student_id', scope.studentIds);

  const questIds = Array.from(
    new Set((acceptances ?? []).map((a) => a.quest_id)),
  );
  let quests: Array<{
    id: string;
    title: string;
    quest_type: string;
    created_at: string;
  }> = [];
  if (questIds.length > 0) {
    const { data } = await supabase
      .from('quests')
      .select('id, title, quest_type, created_at')
      .in('id', questIds);
    quests = data ?? [];
  }

  type QuestAgg = {
    total: number;
    passed: number;
    pending: number; // submitted, awaiting review
    active: number;
    lastAcceptedAt: string | null;
  };
  const agg = new Map<string, QuestAgg>();
  for (const a of acceptances ?? []) {
    const cur =
      agg.get(a.quest_id) ?? {
        total: 0,
        passed: 0,
        pending: 0,
        active: 0,
        lastAcceptedAt: null,
      };
    cur.total += 1;
    if (a.status === 'passed') cur.passed += 1;
    if (a.status === 'submitted') cur.pending += 1;
    if (a.status === 'active' || a.status === 'enrolled') cur.active += 1;
    if (!cur.lastAcceptedAt || a.accepted_at > cur.lastAcceptedAt)
      cur.lastAcceptedAt = a.accepted_at;
    agg.set(a.quest_id, cur);
  }

  const fourteenDaysAgo = new Date(now - 14 * 86_400_000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();

  type QuestOutlier = {
    id: string;
    title: string;
    reason: 'low_pass' | 'stuck' | 'dormant';
    reasonLabel: string;
    metric: string;
  };
  const outliers: QuestOutlier[] = [];
  for (const q of quests) {
    const a = agg.get(q.id);
    if (!a) continue;
    const decided = a.passed + a.pending;
    const passRate = decided > 0 ? a.passed / decided : 0;
    // Low pass: <50%, n≥5 decided
    if (decided >= 5 && passRate < 0.5) {
      outliers.push({
        id: q.id,
        title: q.title,
        reason: 'low_pass',
        reasonLabel: 'Low pass',
        metric: `${Math.round(passRate * 100)}% pass · ${decided} decided`,
      });
      continue;
    }
    // Stuck: ≥3 pending, no acceptance in 7d
    if (
      a.pending >= 3 &&
      a.lastAcceptedAt !== null &&
      a.lastAcceptedAt < sevenDaysAgo
    ) {
      outliers.push({
        id: q.id,
        title: q.title,
        reason: 'stuck',
        reasonLabel: 'Stuck',
        metric: `${a.pending} pending · no activity 7d+`,
      });
      continue;
    }
    // Dormant: no acceptances in 14d
    if (
      a.lastAcceptedAt === null ||
      a.lastAcceptedAt < fourteenDaysAgo
    ) {
      outliers.push({
        id: q.id,
        title: q.title,
        reason: 'dormant',
        reasonLabel: 'Dormant',
        metric: `Quiet 14d+ · ${a.total} lifetime accepts`,
      });
    }
  }
  const topQuests = outliers.slice(0, 3);

  // ----- Bottom 3 retention lessons -----
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
  const lessonAgg = new Map<
    string,
    { sumStability: number; n: number }
  >();
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
    .filter(([, v]) => v.n >= 5) // only lessons with enough signal
    .map(([lid, v]) => ({
      lessonId: lid,
      label: lessonNameById.get(lid) ?? '(unknown lesson)',
      avgStability: v.sumStability / v.n,
      n: v.n,
    }))
    .sort((a, b) => a.avgStability - b.avgStability);
  const bottomRetention = retentionRows.slice(0, 3);

  // ----- Renders -----
  const xpDelta = formatDelta(xpThisWeek, xpLastWeek);
  const reviewDelta = formatDelta(reviewsThisWeek, reviewsLastWeek);

  return (
    <div className="space-y-6">
      {/* Rollups */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students in scope"
          value={totalStudents.toLocaleString()}
          hint={
            scope.classFilter ? 'One class' : 'All classes'
          }
        />
        <StatCard
          label="XP this week"
          value={xpThisWeek.toLocaleString()}
          hint={xpDelta.label}
          trend={xpDelta.trend}
        />
        <StatCard
          label="Reviews this week"
          value={reviewsThisWeek.toLocaleString()}
          hint={reviewDelta.label}
          trend={reviewDelta.trend}
        />
        <StatCard
          label="Avg velocity"
          value={avgVelocity.toFixed(2)}
          hint={`${activeQuests ?? 0} open quests · ${pendingReview ?? 0} to review`}
        />
      </div>

      {/* Today's pulse */}
      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Last 6 hours</CardTitle>
            <p className="text-xs text-muted-foreground">
              {pulseTotals.reviews} reviews · {pulseTotals.submissions}{' '}
              submissions · {pulseTotals.xp >= 0 ? '+' : ''}
              {pulseTotals.xp} XP
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Saigon time
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <PulseMini
              label="Reviews"
              colorClass="bg-primary"
              buckets={buckets.map((b) => b.reviews)}
              labels={buckets.map((b) => b.label)}
              max={maxReviews}
            />
            <PulseMini
              label="Submissions"
              colorClass="bg-primary/60"
              buckets={buckets.map((b) => b.submissions)}
              labels={buckets.map((b) => b.label)}
              max={maxSubs}
            />
            <PulseMini
              label="XP"
              colorClass="bg-primary/80"
              buckets={buckets.map((b) => b.xp)}
              labels={buckets.map((b) => b.label)}
              max={maxXp}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {/* At-risk shortcut */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Students to check in on
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {atRiskCandidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nobody flagged for low velocity.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {atRiskCandidates.map((s) => (
                  <li
                    key={s.id}
                    className="flex min-w-0 items-center justify-between gap-2"
                  >
                    {s.class_id ? (
                      <Link
                        href={`/teacher/classes/${s.class_id}/students/${s.id}`}
                        className="min-w-0 truncate font-medium hover:text-primary hover:underline"
                      >
                        {s.full_name}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate font-medium">
                        {s.full_name}
                      </span>
                    )}
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                      vel {s.learning_velocity.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <SubFooterLink
            href={withClass('/teacher/analytics/at-risk', scope.classFilter)}
          >
            View full at-risk roster
          </SubFooterLink>
        </Card>

        {/* Quests shortcut */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sword className="h-4 w-4 text-amber-500" />
              Quests needing attention
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {topQuests.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Quest board looks healthy.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {topQuests.map((q) => (
                  <li key={q.id} className="min-w-0">
                    <Link
                      href={`/teacher/quests/${q.id}`}
                      className="flex min-w-0 items-center justify-between gap-2"
                    >
                      <span className="min-w-0 truncate font-medium hover:text-primary hover:underline">
                        {q.title}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                          q.reason === 'low_pass'
                            ? 'bg-destructive/10 text-destructive dark:bg-destructive/20'
                            : q.reason === 'stuck'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
                              : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {q.reasonLabel}
                      </span>
                    </Link>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {q.metric}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <SubFooterLink
            href={withClass('/teacher/analytics/quests', scope.classFilter)}
          >
            Open quest board health
          </SubFooterLink>
        </Card>

        {/* Content shortcut */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-amber-500" />
              Lessons fading fastest
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {bottomRetention.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Not enough review data for retention signal yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bottomRetention.map((r) => (
                  <li
                    key={r.lessonId}
                    className="flex min-w-0 items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {r.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">
                      {r.avgStability.toFixed(1)}d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <SubFooterLink
            href={withClass('/teacher/analytics/content', scope.classFilter)}
          >
            Dig into content health
          </SubFooterLink>
        </Card>
      </div>
    </div>
  );
}

function withClass(href: string, classFilter: string | null): string {
  return classFilter ? `${href}?class=${encodeURIComponent(classFilter)}` : href;
}

function SubFooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between border-t border-border px-6 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <span>{children}</span>
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function PulseMini({
  label,
  colorClass,
  buckets,
  labels,
  max,
}: {
  label: string;
  colorClass: string;
  buckets: number[];
  labels: string[];
  max: number;
}) {
  const total = buckets.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums">{total}</span>
      </div>
      <div className="grid grid-cols-6 items-end gap-1" style={{ height: '48px' }}>
        {buckets.map((v, i) => (
          <div
            key={i}
            role="img"
            aria-label={`${labels[i]} — ${v} ${label.toLowerCase()}`}
            title={`${labels[i]} — ${v}`}
            className="flex h-full items-end"
          >
            <div
              className={cn(
                'w-full rounded-sm',
                v === 0 ? 'bg-muted' : colorClass,
              )}
              style={{
                height: v === 0 ? '4px' : `${Math.max(8, (v / max) * 100)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-6 gap-1 text-center text-[10px] text-muted-foreground/70">
        {labels.map((l, i) => (
          <span key={i} className="truncate">
            {i === 0 || i === labels.length - 1 ? l : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
