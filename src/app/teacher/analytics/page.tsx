import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { InsightsTabs } from '@/components/insights-tabs';

export const dynamic = 'force-dynamic';

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

function formatSaigon(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAIGON_TZ,
  }).format(new Date(iso));
}

// "May 22" (Saigon)
function formatSaigonShort(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: SAIGON_TZ,
  }).format(d);
}

// Returns the Saigon-local Monday at 00:00 for the week containing the given Date
function saigonWeekStart(d: Date): Date {
  // Get the date components in Saigon TZ
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
  // Build the Saigon-local-midnight of the start of the week as a UTC ISO
  const utcMidnight = new Date(Date.UTC(year, month - 1, day) - offset * 86400000);
  // Saigon is UTC+7 — subtract 7h so that Saigon-midnight maps to UTC instant
  return new Date(utcMidnight.getTime() - 7 * 60 * 60 * 1000);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: classFilter } = await searchParams;
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');

  const classNameById = new Map<string, string>(
    (classes ?? []).map((c) => [c.id, c.name])
  );

  // Load students (subset by class filter if set)
  const studentsQuery = supabase
    .from('profiles')
    .select('id, full_name, class_id, xp_total, current_rank, learning_velocity')
    .eq('role', 'student');
  const { data: allStudents } = await (classFilter && classFilter !== 'all'
    ? studentsQuery.eq('class_id', classFilter)
    : studentsQuery);

  const studentIds = (allStudents ?? []).map((s) => s.id);
  const studentById = new Map<
    string,
    { id: string; full_name: string; class_id: string | null }
  >(
    (allStudents ?? []).map((s) => [
      s.id,
      { id: s.id, full_name: s.full_name, class_id: s.class_id },
    ])
  );

  // -----------------------------------------------------------------
  // Panel 1: Weekly XP — last 8 weeks
  // -----------------------------------------------------------------
  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
  const xpQuery = supabase
    .from('xp_ledger')
    .select('student_id, amount, created_at')
    .gte('created_at', eightWeeksAgo.toISOString());
  const { data: xpRows } =
    studentIds.length > 0
      ? await xpQuery.in('student_id', studentIds)
      : { data: [] };

  const currentWeekStart = saigonWeekStart(new Date());
  // Build 8 weekly buckets (oldest → newest)
  const weekBuckets: { start: Date; label: string; total: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(currentWeekStart.getTime() - i * 7 * 86400000);
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

  // -----------------------------------------------------------------
  // Panel 2: Completion rates per quest
  // -----------------------------------------------------------------
  const acceptanceQuery = supabase
    .from('quest_acceptances')
    .select(
      'id, status, quest_id, student_id, instance_id, accepted_at, completed_at'
    );
  const { data: acceptances } =
    studentIds.length > 0
      ? await acceptanceQuery.in('student_id', studentIds)
      : { data: [] };

  const questIds = Array.from(
    new Set((acceptances ?? []).map((a) => a.quest_id))
  );
  let questMetaById = new Map<
    string,
    { id: string; title: string; quest_type: string; xp_reward: number }
  >();
  if (questIds.length > 0) {
    const { data: qrows } = await supabase
      .from('quests')
      .select('id, title, quest_type, xp_reward')
      .in('id', questIds);
    questMetaById = new Map(
      (qrows ?? []).map((q) => [
        q.id,
        {
          id: q.id,
          title: q.title,
          quest_type: q.quest_type,
          xp_reward: q.xp_reward,
        },
      ])
    );
  }

  const completionByQuest = new Map<
    string,
    { total: number; passed: number; pending: number }
  >();
  for (const a of acceptances ?? []) {
    const cur = completionByQuest.get(a.quest_id) ?? {
      total: 0,
      passed: 0,
      pending: 0,
    };
    cur.total += 1;
    if (a.status === 'passed') cur.passed += 1;
    if (
      a.status === 'active' ||
      a.status === 'enrolled' ||
      a.status === 'submitted'
    )
      cur.pending += 1;
    completionByQuest.set(a.quest_id, cur);
  }
  const completionRows = Array.from(completionByQuest.entries())
    .map(([quest_id, { total, passed, pending }]) => ({
      quest_id,
      title: questMetaById.get(quest_id)?.title ?? '(unknown quest)',
      type: questMetaById.get(quest_id)?.quest_type ?? '—',
      total,
      passed,
      pending,
      rate: total > 0 ? passed / total : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // -----------------------------------------------------------------
  // Panel 3: Activity heatmap — review attempts by day of week × hour (last 30 days)
  // -----------------------------------------------------------------
  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const attemptsQuery = supabase
    .from('review_attempts')
    .select('answered_at')
    .gte('answered_at', thirtyDaysAgo.toISOString());
  const { data: attemptRows } =
    studentIds.length > 0
      ? await attemptsQuery.in('student_id', studentIds)
      : { data: [] };

  // 7 days × 24 hours grid. Day index: 0 = Monday in Saigon TZ.
  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    Array(24).fill(0)
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
    const hour = Number(hourStr) % 24; // some locales render 24 instead of 00
    const dayIdx = dowMap[wd] ?? 0;
    heatmap[dayIdx][hour] += 1;
  }
  const maxCell = Math.max(1, ...heatmap.flat());
  const totalAttempts = heatmap.flat().reduce((a, b) => a + b, 0);

  // -----------------------------------------------------------------
  // Panel 4: Card retention — average FSRS stability per lesson
  // -----------------------------------------------------------------
  const reviewsQuery = supabase
    .from('card_reviews')
    .select('stability, review_count, card_id');
  const { data: reviews } =
    studentIds.length > 0
      ? await reviewsQuery.in('student_id', studentIds)
      : { data: [] };

  const cardIds = Array.from(new Set((reviews ?? []).map((r) => r.card_id)));
  let lessonByCardId = new Map<string, { lesson_id: string }>();
  if (cardIds.length > 0) {
    const { data: cards } = await supabase
      .from('review_cards')
      .select('id, lesson_id')
      .in('id', cardIds);
    lessonByCardId = new Map(
      (cards ?? []).map((c) => [c.id, { lesson_id: c.lesson_id }])
    );
  }
  const lessonIds = Array.from(
    new Set(Array.from(lessonByCardId.values()).map((v) => v.lesson_id))
  );
  let lessonNameById = new Map<string, string>();
  if (lessonIds.length > 0) {
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, title, lesson_number')
      .in('id', lessonIds);
    lessonNameById = new Map(
      (lessons ?? []).map((l) => [
        l.id,
        `Lesson ${l.lesson_number} — ${l.title}`,
      ])
    );
  }
  const retentionByLesson = new Map<
    string,
    { sumStability: number; n: number; reviewCount: number }
  >();
  for (const r of reviews ?? []) {
    if (r.review_count === 0) continue; // skip new/never-reviewed cards
    const lessonId = lessonByCardId.get(r.card_id)?.lesson_id;
    if (!lessonId) continue;
    const cur = retentionByLesson.get(lessonId) ?? {
      sumStability: 0,
      n: 0,
      reviewCount: 0,
    };
    cur.sumStability += Number(r.stability);
    cur.n += 1;
    cur.reviewCount += r.review_count;
    retentionByLesson.set(lessonId, cur);
  }
  const retentionRows = Array.from(retentionByLesson.entries())
    .map(([lessonId, { sumStability, n, reviewCount }]) => ({
      lessonId,
      label: lessonNameById.get(lessonId) ?? '(unknown lesson)',
      avgStability: n > 0 ? sumStability / n : 0,
      n,
      reviewCount,
    }))
    .sort((a, b) => b.avgStability - a.avgStability);
  const maxRetention = Math.max(1, ...retentionRows.map((r) => r.avgStability));

  // -----------------------------------------------------------------
  // Panel 5: Live feed — recent activity (XP awards + submissions)
  // -----------------------------------------------------------------
  const xpFeedQuery = supabase
    .from('xp_ledger')
    .select('id, student_id, amount, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  const { data: xpFeed } =
    studentIds.length > 0
      ? await xpFeedQuery.in('student_id', studentIds)
      : { data: [] };

  const submissionFeedQuery = supabase
    .from('quest_submissions')
    .select('id, submitted_by, status, submitted_at, reviewed_at')
    .order('submitted_at', { ascending: false })
    .limit(20);
  const { data: subFeed } =
    studentIds.length > 0
      ? await submissionFeedQuery.in('submitted_by', studentIds)
      : { data: [] };

  type FeedItem = {
    key: string;
    when: string;
    kind: 'xp' | 'submission' | 'review';
    studentId: string;
    studentName: string;
    classId: string | null;
    detail: string; // what happened, minus the student name
  };
  const feedItems: FeedItem[] = [];
  for (const row of xpFeed ?? []) {
    const student = studentById.get(row.student_id);
    feedItems.push({
      key: `xp-${row.id}`,
      when: row.created_at,
      kind: 'xp',
      studentId: row.student_id,
      studentName: student?.full_name ?? '(student)',
      classId: student?.class_id ?? null,
      detail: `earned ${row.amount > 0 ? '+' : ''}${row.amount} XP (${row.reason})`,
    });
  }
  for (const row of subFeed ?? []) {
    const student = studentById.get(row.submitted_by);
    feedItems.push({
      key: `sub-${row.id}`,
      when: row.submitted_at,
      kind: 'submission',
      studentId: row.submitted_by,
      studentName: student?.full_name ?? '(student)',
      classId: student?.class_id ?? null,
      detail: 'submitted a quest',
    });
    if (row.reviewed_at && (row.status === 'passed' || row.status === 'failed')) {
      feedItems.push({
        key: `rev-${row.id}`,
        when: row.reviewed_at,
        kind: 'review',
        studentId: row.submitted_by,
        studentName: student?.full_name ?? '(student)',
        classId: student?.class_id ?? null,
        detail: `submission was ${row.status}`,
      });
    }
  }
  feedItems.sort((a, b) => (a.when < b.when ? 1 : -1));
  const feed = feedItems.slice(0, 25);

  // -----------------------------------------------------------------
  // Panel 6: Students at risk
  //   - Low velocity (< 0.3), bottom 10
  //   - Repeat failers: ≥3 failed submissions on a single quest
  //     (per-acceptance for solo, per-instance for coop — all team
  //     members of a failing instance are flagged.)
  // -----------------------------------------------------------------
  const failedSubsQuery = supabase
    .from('quest_submissions')
    .select('acceptance_id, instance_id, submitted_by')
    .eq('status', 'failed');
  const { data: failedSubs } =
    studentIds.length > 0
      ? await failedSubsQuery.in('submitted_by', studentIds)
      : { data: [] };

  const failuresByGroup = new Map<string, number>();
  for (const s of failedSubs ?? []) {
    const key = s.acceptance_id
      ? `a:${s.acceptance_id}`
      : s.instance_id
        ? `i:${s.instance_id}`
        : null;
    if (!key) continue;
    failuresByGroup.set(key, (failuresByGroup.get(key) ?? 0) + 1);
  }

  type AtRiskEntry = {
    studentId: string;
    fullName: string;
    classId: string | null;
    velocity: number;
    reasons: string[];
  };
  const atRiskByStudent = new Map<string, AtRiskEntry>();

  function flagStudent(studentId: string, reason: string) {
    const profile = studentById.get(studentId);
    if (!profile) return;
    const existing = atRiskByStudent.get(studentId);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    const fullStudent = (allStudents ?? []).find((s) => s.id === studentId);
    atRiskByStudent.set(studentId, {
      studentId,
      fullName: profile.full_name,
      classId: profile.class_id,
      velocity: Number(fullStudent?.learning_velocity ?? 0),
      reasons: [reason],
    });
  }

  // Low velocity
  for (const s of allStudents ?? []) {
    if (Number(s.learning_velocity ?? 0) < 0.3) {
      flagStudent(s.id, `velocity ${Number(s.learning_velocity).toFixed(2)}`);
    }
  }
  // Repeat-fail groups
  for (const [key, count] of failuresByGroup.entries()) {
    if (count < 3) continue;
    if (key.startsWith('a:')) {
      const accId = key.slice(2);
      const acc = (acceptances ?? []).find((a) => a.id === accId);
      if (acc) flagStudent(acc.student_id, `${count} fails on one quest`);
    } else {
      const instId = key.slice(2);
      for (const acc of (acceptances ?? []).filter(
        (a) => a.instance_id === instId
      )) {
        flagStudent(acc.student_id, `${count} team fails on one quest`);
      }
    }
  }

  const atRisk = Array.from(atRiskByStudent.values()).sort(
    (a, b) => a.velocity - b.velocity
  );

  // -----------------------------------------------------------------
  // Panel 7: Velocity distribution (5 buckets)
  // -----------------------------------------------------------------
  const velocityBuckets = [
    { range: '0.0–0.2', count: 0 },
    { range: '0.2–0.4', count: 0 },
    { range: '0.4–0.6', count: 0 },
    { range: '0.6–0.8', count: 0 },
    { range: '0.8–1.0', count: 0 },
  ];
  for (const s of allStudents ?? []) {
    const v = Math.max(0, Math.min(0.9999, Number(s.learning_velocity ?? 0)));
    const idx = Math.floor(v * 5);
    velocityBuckets[idx].count += 1;
  }
  const maxVelocityBucket = Math.max(1, ...velocityBuckets.map((b) => b.count));

  // -----------------------------------------------------------------
  // Top-of-page rollups
  // -----------------------------------------------------------------
  const totalStudents = (allStudents ?? []).length;
  const totalXpThisPeriod = weekBuckets.reduce((a, b) => a + b.total, 0);
  const avgVelocity =
    totalStudents > 0
      ? (allStudents ?? []).reduce(
          (sum, s) => sum + Number(s.learning_velocity ?? 0),
          0
        ) / totalStudents
      : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          At-a-glance view of class engagement.
        </p>
      </header>
      <InsightsTabs />

      {/* Class filter */}
      {classes && classes.length > 0 && (
        <form method="get" className="mb-6 flex items-center gap-2 text-sm">
          <label htmlFor="class" className="font-medium text-slate-700">
            Class:
          </label>
          <select
            id="class"
            name="class"
            defaultValue={classFilter ?? 'all'}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Apply
          </button>
        </form>
      )}

      {/* Rollups */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RollupCard label="Students" value={totalStudents.toLocaleString()} />
        <RollupCard
          label="XP (8 wks)"
          value={totalXpThisPeriod.toLocaleString()}
        />
        <RollupCard label="Reviews (30 d)" value={totalAttempts.toLocaleString()} />
        <RollupCard
          label="Avg velocity"
          value={avgVelocity.toFixed(3)}
        />
      </div>

      <div className="space-y-6">
        {/* Panel 0: Students at risk */}
        <Card>
          <CardHeader>
            <CardTitle>Students at risk</CardTitle>
            <CardDescription>
              Low velocity (&lt; 0.3) or ≥3 failed submissions on a single
              quest. Coop team members are flagged together when their team
              fails repeatedly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {atRisk.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nobody flagged. Either everyone&apos;s on track or there
                isn&apos;t enough data yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                {atRisk.map((s) => {
                  const link = s.classId
                    ? `/teacher/classes/${s.classId}/students/${s.studentId}`
                    : null;
                  return (
                    <li
                      key={s.studentId}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        {link ? (
                          <Link
                            href={link}
                            className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                          >
                            {s.fullName}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-900">
                            {s.fullName}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-slate-500">
                          {s.classId
                            ? (classNameById.get(s.classId) ?? 'Unknown')
                            : 'Unassigned'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {s.reasons.map((r) => (
                          <span
                            key={r}
                            className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                          >
                            {r}
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

        {/* Panel 0b: Velocity distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Velocity distribution</CardTitle>
            <CardDescription>
              How learning velocity is spread across students in the selected
              scope. An average alone hides bimodal classes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalStudents === 0 ? (
              <p className="text-sm text-slate-500">No students in scope.</p>
            ) : (
              <ul className="space-y-2">
                {velocityBuckets.map((b) => (
                  <li key={b.range} className="text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-16 shrink-0 font-mono text-slate-500">
                        {b.range}
                      </span>
                      <div className="flex-1">
                        <div
                          className="h-5 rounded-md bg-slate-700"
                          style={{
                            width: `${Math.max(1, (b.count / maxVelocityBucket) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-20 text-right tabular-nums text-slate-700">
                        {b.count}{' '}
                        {b.count === 1 ? 'student' : 'students'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Panel 1: Weekly XP */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly XP</CardTitle>
            <CardDescription>
              Total XP earned per week (Saigon weeks, Monday–Sunday), last 8 weeks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weekBuckets.every((b) => b.total === 0) ? (
              <p className="text-sm text-slate-500">No XP this period.</p>
            ) : (
              <ul className="space-y-2">
                {weekBuckets.map((b) => (
                  <li key={b.start.toISOString()} className="text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-16 shrink-0 font-mono text-slate-500">
                        {b.label}
                      </span>
                      <div className="flex-1">
                        <div
                          className="h-5 rounded-md bg-blue-500"
                          style={{
                            width: `${Math.max(1, (b.total / maxWeekly) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-20 text-right tabular-nums text-slate-700">
                        {b.total.toLocaleString()} XP
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Panel 2: Completion rates */}
        <Card>
          <CardHeader>
            <CardTitle>Quest completion</CardTitle>
            <CardDescription>
              Passed / accepted, by quest. Sorted by acceptance volume.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {completionRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                No quest activity yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {completionRows.map((row) => (
                  <li
                    key={row.quest_id}
                    className="rounded-md border border-slate-200 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-900">
                        {row.title}
                      </span>
                      <span className="text-xs text-slate-500">
                        {row.passed}/{row.total} passed
                        {row.pending > 0 && ` · ${row.pending} in flight`}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${Math.round(row.rate * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {Math.round(row.rate * 100)}% completion · {row.type}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Panel 3: Activity heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Activity heatmap</CardTitle>
            <CardDescription>
              Review attempts by day-of-week × hour (Saigon), last 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalAttempts === 0 ? (
              <p className="text-sm text-slate-500">No reviews this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="w-12"></th>
                      {Array.from({ length: 24 }, (_, h) => (
                        <th
                          key={h}
                          className="w-6 px-0.5 text-center font-normal text-slate-400"
                        >
                          {h % 6 === 0 ? h : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                      (label, dayIdx) => (
                        <tr key={label}>
                          <td className="pr-2 text-right text-slate-500">
                            {label}
                          </td>
                          {heatmap[dayIdx].map((cnt, h) => {
                            const intensity = cnt / maxCell;
                            const bg =
                              cnt === 0
                                ? 'bg-slate-50'
                                : intensity > 0.75
                                  ? 'bg-blue-700'
                                  : intensity > 0.5
                                    ? 'bg-blue-500'
                                    : intensity > 0.25
                                      ? 'bg-blue-300'
                                      : 'bg-blue-100';
                            return (
                              <td key={h} className="p-0.5">
                                <div
                                  className={`h-5 w-5 rounded ${bg}`}
                                  title={`${label} ${h}:00 — ${cnt} reviews`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500">
                  Darker = more reviews. Peak cell: {maxCell} reviews.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel 4: Card retention */}
        <Card>
          <CardHeader>
            <CardTitle>Card retention</CardTitle>
            <CardDescription>
              Average FSRS stability per lesson. Higher = students remember
              longer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {retentionRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                No reviewed cards yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {retentionRows.map((row) => (
                  <li key={row.lessonId} className="text-xs">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                        {row.label}
                      </span>
                      <span className="w-32 text-right tabular-nums text-slate-500">
                        {row.avgStability.toFixed(2)}d · {row.n} cards
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-purple-500"
                        style={{
                          width: `${Math.max(2, (row.avgStability / maxRetention) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Panel 5: Live feed */}
        <Card>
          <CardHeader>
            <CardTitle>Live feed</CardTitle>
            <CardDescription>
              Most recent XP awards, submissions, and reviews.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feed.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {feed.map((item) => {
                  const dot =
                    item.kind === 'xp'
                      ? 'bg-blue-400'
                      : item.kind === 'submission'
                        ? 'bg-amber-400'
                        : 'bg-green-500';
                  const studentLink = item.classId
                    ? `/teacher/classes/${item.classId}/students/${item.studentId}`
                    : null;
                  return (
                    <li
                      key={item.key}
                      className="flex items-baseline gap-2 border-b border-slate-100 py-1 last:border-0"
                    >
                      <span
                        className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${dot}`}
                      />
                      <span className="flex-1 text-slate-700">
                        {studentLink ? (
                          <Link
                            href={studentLink}
                            className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                          >
                            {item.studentName}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-900">
                            {item.studentName}
                          </span>
                        )}{' '}
                        {item.detail}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {formatSaigon(item.when)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Footer note about RLS */}
        <p className="text-xs text-slate-400">
          Per-class filter scopes the rollups, charts, and feed. Pending coop
          matchmaking is reflected in &quot;Quest completion&quot; via the
          &quot;in flight&quot; count. Class:{' '}
          {classFilter && classFilter !== 'all'
            ? (classNameById.get(classFilter) ?? 'unknown')
            : 'all'}
          .
        </p>
      </div>
    </div>
  );
}

function RollupCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
        {value}
      </p>
    </div>
  );
}
