import Link from 'next/link';
import { ArrowRight, Sword } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getStudentScope, relativeDaysAgo } from '@/lib/analytics-data';
import { StatusChip } from '@/components/status-chip';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ONE_WEEK_MS = 7 * 86_400_000;
const TWO_WEEKS_MS = 14 * 86_400_000;

export default async function QuestHealthPage({
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
  const fourteenDaysAgo = new Date(now - TWO_WEEKS_MS).toISOString();
  const sevenDaysAgo = oneWeekAgo;

  const noStudents = scope.studentIds.length === 0;

  // ----- Fetch acceptances, submissions, instances, quests -----
  const acceptancesQuery = supabase
    .from('quest_acceptances')
    .select(
      'id, quest_id, status, accepted_at, completed_at, student_id, instance_id',
    );
  const { data: acceptances } = noStudents
    ? { data: [] }
    : await acceptancesQuery.in('student_id', scope.studentIds);

  // Coop instances are class-scoped, not student-scoped — apply class filter
  // directly when active.
  const instancesQuery = supabase
    .from('coop_quest_instances')
    .select('id, quest_id, status, started_at, submitted_at, class_id');
  const { data: instances } = scope.classFilter
    ? await instancesQuery.eq('class_id', scope.classFilter)
    : await instancesQuery;

  const submissionsQuery = supabase
    .from('quest_submissions')
    .select('acceptance_id, instance_id, status, submitted_at');
  const { data: submissions } = noStudents
    ? { data: [] }
    : await submissionsQuery.in('submitted_by', scope.studentIds);

  const questIdsFromAcc = (acceptances ?? []).map((a) => a.quest_id);
  const questIdsFromInst = (instances ?? []).map((i) => i.quest_id);
  const questIds = Array.from(
    new Set([...questIdsFromAcc, ...questIdsFromInst]),
  );

  let quests: Array<{
    id: string;
    title: string;
    quest_type: string;
    xp_reward: number;
    created_at: string;
    closed_at: string | null;
  }> = [];
  if (questIds.length > 0) {
    const { data } = await supabase
      .from('quests')
      .select('id, title, quest_type, xp_reward, created_at, closed_at')
      .in('id', questIds);
    quests = data ?? [];
  }

  // ----- Funnel: acceptance statuses -----
  const statusFunnel = {
    enrolled: 0,
    active: 0,
    submitted: 0,
    passed: 0,
    failed: 0,
  };
  for (const a of acceptances ?? []) {
    const k = a.status as keyof typeof statusFunnel;
    if (k in statusFunnel) statusFunnel[k] += 1;
  }
  const totalAcceptances =
    statusFunnel.enrolled +
    statusFunnel.active +
    statusFunnel.submitted +
    statusFunnel.passed +
    statusFunnel.failed;
  const passedThisWeek = (acceptances ?? []).filter(
    (a) => a.status === 'passed' && a.completed_at && a.completed_at >= oneWeekAgo,
  ).length;
  const failedSubsThisWeek = (submissions ?? []).filter(
    (s) => s.status === 'failed' && s.submitted_at >= oneWeekAgo,
  ).length;

  // ----- Coop instance buckets -----
  const coopBuckets = {
    active: 0,
    submitted: 0,
    passed: 0,
    stuck: 0, // active, started_at >7 days ago (not progressing)
  };
  for (const inst of instances ?? []) {
    if (inst.status === 'active') {
      coopBuckets.active += 1;
      if (inst.started_at && inst.started_at < sevenDaysAgo) {
        coopBuckets.stuck += 1;
      }
    } else if (inst.status === 'submitted') {
      coopBuckets.submitted += 1;
    } else if (inst.status === 'passed') {
      coopBuckets.passed += 1;
    }
  }

  // ----- Outliers + humming -----
  type QuestAgg = {
    total: number;
    passed: number;
    pending: number;
    active: number;
    failed: number;
    lastAcceptedAt: string | null;
    weeklyAccepts: number;
  };
  const agg = new Map<string, QuestAgg>();
  for (const a of acceptances ?? []) {
    const cur =
      agg.get(a.quest_id) ?? {
        total: 0,
        passed: 0,
        pending: 0,
        active: 0,
        failed: 0,
        lastAcceptedAt: null,
        weeklyAccepts: 0,
      };
    cur.total += 1;
    if (a.status === 'passed') cur.passed += 1;
    if (a.status === 'submitted') cur.pending += 1;
    if (a.status === 'active' || a.status === 'enrolled') cur.active += 1;
    if (a.status === 'failed') cur.failed += 1;
    if (!cur.lastAcceptedAt || a.accepted_at > cur.lastAcceptedAt)
      cur.lastAcceptedAt = a.accepted_at;
    if (a.accepted_at >= oneWeekAgo) cur.weeklyAccepts += 1;
    agg.set(a.quest_id, cur);
  }

  type OutlierRow = {
    id: string;
    title: string;
    questType: string;
    metric: string;
  };
  const lowPass: OutlierRow[] = [];
  const stuck: OutlierRow[] = [];
  const dormant: OutlierRow[] = [];

  for (const q of quests) {
    if (q.closed_at) continue; // ignore closed quests
    const a = agg.get(q.id);
    if (!a) {
      // Quest has no acceptance from in-scope students
      if (q.created_at < fourteenDaysAgo) {
        dormant.push({
          id: q.id,
          title: q.title,
          questType: q.quest_type,
          metric: `Created ${relativeDaysAgo(q.created_at, now)} · 0 accepts`,
        });
      }
      continue;
    }
    const decided = a.passed + a.pending;
    const passRate = decided > 0 ? a.passed / decided : 0;
    if (decided >= 5 && passRate < 0.5) {
      lowPass.push({
        id: q.id,
        title: q.title,
        questType: q.quest_type,
        metric: `${Math.round(passRate * 100)}% pass · ${a.passed}/${decided} decided`,
      });
    } else if (
      a.pending >= 3 &&
      a.lastAcceptedAt !== null &&
      a.lastAcceptedAt < sevenDaysAgo
    ) {
      stuck.push({
        id: q.id,
        title: q.title,
        questType: q.quest_type,
        metric: `${a.pending} pending · last accept ${relativeDaysAgo(a.lastAcceptedAt, now)}`,
      });
    } else if (
      a.lastAcceptedAt === null ||
      a.lastAcceptedAt < fourteenDaysAgo
    ) {
      dormant.push({
        id: q.id,
        title: q.title,
        questType: q.quest_type,
        metric: `Quiet 14d+ · ${a.total} lifetime accepts`,
      });
    }
  }

  // Humming: top by weeklyAccepts among non-outlier, open quests
  const humming = quests
    .filter((q) => !q.closed_at)
    .map((q) => ({
      id: q.id,
      title: q.title,
      questType: q.quest_type,
      weekly: agg.get(q.id)?.weeklyAccepts ?? 0,
      passRate: (() => {
        const a = agg.get(q.id);
        if (!a) return null;
        const decided = a.passed + a.pending;
        return decided > 0 ? a.passed / decided : null;
      })(),
    }))
    .filter((q) => q.weekly > 0)
    .sort((a, b) => b.weekly - a.weekly)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quest acceptance funnel</CardTitle>
          <p className="text-xs text-muted-foreground">
            Where in-scope students are right now across every quest.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <FunnelStat
              label="Enrolled"
              value={statusFunnel.enrolled}
              hint="awaiting matchmaking"
            />
            <FunnelStat
              label="Active"
              value={statusFunnel.active}
              hint="in flight"
            />
            <FunnelStat
              label="Pending review"
              value={statusFunnel.submitted}
              hint="submitted, needs you"
              accent={statusFunnel.submitted > 0 ? 'warn' : 'neutral'}
            />
            <FunnelStat
              label="Passed (7d)"
              value={passedThisWeek}
              hint="of lifetime total"
              accent="good"
            />
            <FunnelStat
              label="Fails (7d)"
              value={failedSubsThisWeek}
              hint="resubmits expected"
              accent={failedSubsThisWeek > 0 ? 'warn' : 'neutral'}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Lifetime: {totalAcceptances.toLocaleString()} acceptances across{' '}
            {agg.size} quests with activity.
          </p>
        </CardContent>
      </Card>

      {/* Coop instance dashboard */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Co-op instances</CardTitle>
          <p className="text-xs text-muted-foreground">
            Team state across {scope.classFilter ? 'this class' : 'all classes'}.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FunnelStat label="Active teams" value={coopBuckets.active} />
            <FunnelStat
              label="Stuck (>7d)"
              value={coopBuckets.stuck}
              hint="no progress"
              accent={coopBuckets.stuck > 0 ? 'warn' : 'neutral'}
            />
            <FunnelStat
              label="Submitted"
              value={coopBuckets.submitted}
              hint="awaiting review"
              accent={coopBuckets.submitted > 0 ? 'warn' : 'neutral'}
            />
            <FunnelStat
              label="Passed"
              value={coopBuckets.passed}
              accent="good"
            />
          </div>
        </CardContent>
      </Card>

      {/* Outliers */}
      <div className="grid gap-4 lg:grid-cols-3">
        <OutlierCard
          title="Low pass rate"
          subtitle="<50% pass with ≥5 decided"
          tone="destructive"
          rows={lowPass.slice(0, 6)}
          totalCount={lowPass.length}
          emptyMessage="No quests are failing students at scale right now."
        />
        <OutlierCard
          title="Stuck"
          subtitle="≥3 pending review and no new accept in 7d"
          tone="warn"
          rows={stuck.slice(0, 6)}
          totalCount={stuck.length}
          emptyMessage="Nothing piling up in pending review."
        />
        <OutlierCard
          title="Dormant"
          subtitle="No acceptance in 14d"
          tone="muted"
          rows={dormant.slice(0, 6)}
          totalCount={dormant.length}
          emptyMessage="Every open quest is being taken."
        />
      </div>

      {/* Humming */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sword className="h-4 w-4 text-primary" />
            Quests humming
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Most accepted in the last 7 days. Open in students&apos; quest boards.
          </p>
        </CardHeader>
        <CardContent>
          {humming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No new acceptances in the last 7 days.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {humming.map((q) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <Link
                    href={`/teacher/quests/${q.id}`}
                    className="min-w-0 truncate text-sm font-medium hover:text-primary hover:underline"
                  >
                    {q.title}
                  </Link>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    {q.passRate !== null && (
                      <span className="tabular-nums">
                        {Math.round(q.passRate * 100)}% pass
                      </span>
                    )}
                    <StatusChip tone="good" className="tabular-nums">
                      +{q.weekly} this wk
                    </StatusChip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Footer link to full table */}
      <div className="flex justify-end">
        <Link
          href={withClass(
            '/teacher/analytics/quests/all',
            scope.classFilter,
          )}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Browse every quest
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function withClass(href: string, classFilter: string | null): string {
  return classFilter ? `${href}?class=${encodeURIComponent(classFilter)}` : href;
}

function FunnelStat({
  label,
  value,
  hint,
  accent = 'neutral',
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5',
        accent === 'good'
          ? 'border-primary/30 bg-primary/10'
          : accent === 'warn'
            ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/40'
            : 'border-border bg-card',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-xl font-semibold tabular-nums',
          accent === 'good'
            ? 'text-primary'
            : accent === 'warn'
              ? 'text-amber-900 dark:text-amber-300'
              : 'text-foreground',
        )}
      >
        {value.toLocaleString()}
      </p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-muted-foreground/80">{hint}</p>
      )}
    </div>
  );
}

function OutlierCard({
  title,
  subtitle,
  tone,
  rows,
  totalCount,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  tone: 'destructive' | 'warn' | 'muted';
  rows: Array<{
    id: string;
    title: string;
    questType: string;
    metric: string;
  }>;
  totalCount: number;
  emptyMessage: string;
}) {
  const dot =
    tone === 'destructive'
      ? 'bg-destructive'
      : tone === 'warn'
        ? 'bg-amber-500'
        : 'bg-muted-foreground/50';
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={cn('h-2 w-2 rounded-full', dot)} />
          {title}
          <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
            {totalCount}
          </span>
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="flex-1">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((q) => (
              <li key={q.id} className="min-w-0">
                <Link
                  href={`/teacher/quests/${q.id}`}
                  className="block min-w-0 hover:text-primary hover:underline"
                >
                  <span className="block truncate font-medium">{q.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {q.questType} · {q.metric}
                  </span>
                </Link>
              </li>
            ))}
            {totalCount > rows.length && (
              <li className="pt-1 text-[11px] text-muted-foreground">
                +{totalCount - rows.length} more
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
