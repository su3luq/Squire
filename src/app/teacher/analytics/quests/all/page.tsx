import Link from 'next/link';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import {
  getStudentScope,
  relativeDaysAgo,
} from '@/lib/analytics-data';
import { ToggleChipGroup } from '@/components/toggle-chip-group';
import { StatusChip } from '@/components/status-chip';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type SortKey =
  | 'title'
  | 'type'
  | 'accepts'
  | 'pending'
  | 'pass_rate'
  | 'last_activity';

interface QueryParams {
  class?: string;
  sort?: SortKey;
  dir?: 'asc' | 'desc';
  page?: string;
  type?: 'all' | 'solo' | 'coop';
  status?: 'all' | 'open' | 'closed';
}

export default async function AllQuestsAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<QueryParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const scope = await getStudentScope(params.class);

  const sort: SortKey = params.sort ?? 'accepts';
  const dir: 'asc' | 'desc' = params.dir ?? 'desc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const typeFilter = params.type ?? 'all';
  const statusFilter = params.status ?? 'open';

  const noStudents = scope.studentIds.length === 0;

  // Load every relevant quest (filter by type + status)
  let questQuery = supabase
    .from('quests')
    .select('id, title, quest_type, xp_reward, created_at, closed_at')
    .neq('quest_type', 'daily_quiz');
  if (typeFilter !== 'all') questQuery = questQuery.eq('quest_type', typeFilter);
  if (statusFilter === 'open') questQuery = questQuery.is('closed_at', null);
  if (statusFilter === 'closed') questQuery = questQuery.not('closed_at', 'is', null);
  const { data: quests } = await questQuery;

  // Acceptances scoped to current student set
  const acceptancesQuery = supabase
    .from('quest_acceptances')
    .select('quest_id, status, accepted_at, student_id');
  const { data: acceptances } = noStudents
    ? { data: [] }
    : await acceptancesQuery.in('student_id', scope.studentIds);

  type Row = {
    id: string;
    title: string;
    quest_type: string;
    xp_reward: number;
    closed_at: string | null;
    accepts: number;
    pending: number;
    passed: number;
    failed: number;
    passRate: number | null;
    lastActivity: string | null;
  };

  const agg = new Map<string, Omit<Row, 'id' | 'title' | 'quest_type' | 'xp_reward' | 'closed_at'>>();
  for (const a of acceptances ?? []) {
    const cur =
      agg.get(a.quest_id) ?? {
        accepts: 0,
        pending: 0,
        passed: 0,
        failed: 0,
        passRate: null,
        lastActivity: null,
      };
    cur.accepts += 1;
    if (a.status === 'submitted') cur.pending += 1;
    if (a.status === 'passed') cur.passed += 1;
    if (a.status === 'failed') cur.failed += 1;
    if (!cur.lastActivity || a.accepted_at > cur.lastActivity)
      cur.lastActivity = a.accepted_at;
    agg.set(a.quest_id, cur);
  }

  const rows: Row[] = (quests ?? []).map((q) => {
    const a = agg.get(q.id);
    const accepts = a?.accepts ?? 0;
    const pending = a?.pending ?? 0;
    const passed = a?.passed ?? 0;
    const failed = a?.failed ?? 0;
    const decided = passed + pending;
    const passRate = decided > 0 ? passed / decided : null;
    return {
      id: q.id,
      title: q.title,
      quest_type: q.quest_type,
      xp_reward: q.xp_reward,
      closed_at: q.closed_at,
      accepts,
      pending,
      passed,
      failed,
      passRate,
      lastActivity: a?.lastActivity ?? null,
    };
  });

  // Sort
  const cmp = (a: Row, b: Row): number => {
    const factor = dir === 'asc' ? 1 : -1;
    switch (sort) {
      case 'title':
        return factor * a.title.localeCompare(b.title);
      case 'type':
        return factor * a.quest_type.localeCompare(b.quest_type);
      case 'accepts':
        return factor * (a.accepts - b.accepts);
      case 'pending':
        return factor * (a.pending - b.pending);
      case 'pass_rate':
        // nulls last regardless of direction
        if (a.passRate === null && b.passRate === null) return 0;
        if (a.passRate === null) return 1;
        if (b.passRate === null) return -1;
        return factor * (a.passRate - b.passRate);
      case 'last_activity':
        if (!a.lastActivity && !b.lastActivity) return 0;
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return factor * a.lastActivity.localeCompare(b.lastActivity);
    }
  };
  rows.sort(cmp);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const now = Date.now();

  function buildUrl(overrides: Partial<QueryParams>): string {
    const sp = new URLSearchParams();
    const merged = { ...params, ...overrides };
    if (merged.class) sp.set('class', merged.class);
    if (merged.sort && merged.sort !== 'accepts') sp.set('sort', merged.sort);
    if (merged.dir && merged.dir !== 'desc') sp.set('dir', merged.dir);
    if (merged.page && merged.page !== '1') sp.set('page', merged.page);
    if (merged.type && merged.type !== 'all') sp.set('type', merged.type);
    if (merged.status && merged.status !== 'open') sp.set('status', merged.status);
    const qs = sp.toString();
    return qs
      ? `/teacher/analytics/quests/all?${qs}`
      : '/teacher/analytics/quests/all';
  }

  function sortLink(label: string, key: SortKey) {
    const active = sort === key;
    const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
    return (
      <Link
        href={buildUrl({ sort: key, dir: nextDir, page: '1' })}
        className={cn(
          'inline-flex items-center gap-0.5',
          active && 'text-foreground',
        )}
      >
        {label}
        {active &&
          (dir === 'desc' ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          ))}
      </Link>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Status:</span>
          <ToggleChipGroup
            ariaLabel="Filter by quest status"
            current={statusFilter}
            options={[
              {
                value: 'open',
                label: 'Open',
                href: buildUrl({ status: 'open', page: '1' }),
              },
              {
                value: 'closed',
                label: 'Closed',
                href: buildUrl({ status: 'closed', page: '1' }),
              },
              {
                value: 'all',
                label: 'All',
                href: buildUrl({ status: 'all', page: '1' }),
              },
            ]}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Type:</span>
          <ToggleChipGroup
            ariaLabel="Filter by quest type"
            current={typeFilter}
            options={[
              {
                value: 'all',
                label: 'All',
                href: buildUrl({ type: 'all', page: '1' }),
              },
              {
                value: 'solo',
                label: 'Solo',
                href: buildUrl({ type: 'solo', page: '1' }),
              },
              {
                value: 'coop',
                label: 'Co-op',
                href: buildUrl({ type: 'coop', page: '1' }),
              },
            ]}
          />
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {totalRows.toLocaleString()} quests · page {safePage}/{totalPages}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {pageRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No quests match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">
                      {sortLink('Title', 'title')}
                    </th>
                    <th className="px-3 py-2.5 font-medium">
                      {sortLink('Type', 'type')}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      {sortLink('Accepts', 'accepts')}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      {sortLink('Pending', 'pending')}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      {sortLink('Pass rate', 'pass_rate')}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      {sortLink('Last activity', 'last_activity')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="max-w-[280px] truncate px-4 py-2.5 font-medium">
                        <Link
                          href={`/teacher/quests/${r.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {r.title}
                        </Link>
                        {r.closed_at && (
                          <StatusChip tone="muted" className="ml-2 uppercase tracking-wide">
                            Closed
                          </StatusChip>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                        {r.quest_type}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.accepts.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.pending > 0 ? (
                          <StatusChip tone="warn" className="tabular-nums">
                            {r.pending}
                          </StatusChip>
                        ) : (
                          <span className="text-muted-foreground/60">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.passRate === null ? (
                          <span className="text-muted-foreground/60">—</span>
                        ) : (
                          <span
                            className={cn(
                              r.passRate < 0.5 && 'text-destructive',
                            )}
                          >
                            {Math.round(r.passRate * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                        {relativeDaysAgo(r.lastActivity, now)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          {safePage > 1 ? (
            <Link
              href={buildUrl({ page: String(safePage - 1) })}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1 text-xs hover:bg-muted"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1 text-xs text-muted-foreground/60">
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </span>
          )}
          {safePage < totalPages ? (
            <Link
              href={buildUrl({ page: String(safePage + 1) })}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1 text-xs hover:bg-muted"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1 text-xs text-muted-foreground/60">
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

