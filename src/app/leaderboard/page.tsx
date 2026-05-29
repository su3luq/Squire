import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/avatar';
import { InsightsTabs } from '@/components/insights-tabs';
import { ToggleChipGroup } from '@/components/toggle-chip-group';
import {
  LeaderboardPodium,
  type PodiumRow,
} from '@/components/leaderboard-podium';
import { ClosestRival, type RivalRow } from '@/components/closest-rival';
import { getRanksMap } from '@/lib/ranks-config';

export const dynamic = 'force-dynamic';

const TOP_N = 10;
// When the user is past TOP_N, show them with this much surrounding context.
const CONTEXT_RADIUS = 2;

type ScopeParam = 'global' | 'class';

function isScope(v: string | undefined): v is ScopeParam {
  return v === 'global' || v === 'class';
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: scopeRaw } = await searchParams;
  const scope: ScopeParam = isScope(scopeRaw) ? scopeRaw : 'global';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('role, class_id, xp_total')
    .eq('id', user.id)
    .single();
  const isTeacher = viewerProfile?.role === 'teacher';
  const viewerClassId = viewerProfile?.class_id ?? null;
  const viewerXp = viewerProfile?.xp_total ?? 0;

  // Class scope only makes sense for students who actually belong to a class.
  const effectiveScope: ScopeParam =
    scope === 'class' && viewerClassId ? 'class' : 'global';

  let studentsQuery = supabase
    .from('public_profiles')
    .select('id, full_name, xp_total, current_rank, avatar_url, class_id')
    .eq('role', 'student')
    .order('xp_total', { ascending: false })
    .order('full_name', { ascending: true });
  if (effectiveScope === 'class' && viewerClassId) {
    studentsQuery = studentsQuery.eq('class_id', viewerClassId);
  }

  const [{ data: students }, ranksMap] = await Promise.all([
    studentsQuery,
    getRanksMap(),
  ]);

  const rows = (students ?? []).map((s, idx) => {
    const tier = s.current_rank ?? 7;
    const r = ranksMap.get(tier);
    return {
      position: idx + 1,
      id: s.id ?? '',
      full_name: s.full_name ?? 'Unknown',
      xp_total: s.xp_total ?? 0,
      current_rank: tier,
      avatar_url: s.avatar_url ?? null,
      class_id: s.class_id ?? null,
      ringConfig: r?.gradient
        ? { gradient: r.gradient.gradient, glow: r.gradient.glow ?? null }
        : null,
    };
  });

  const userPosition = rows.findIndex((r) => r.id === user.id);
  const userRow = userPosition >= 0 ? rows[userPosition] : null;
  const userInTop = userPosition >= 0 && userPosition < TOP_N;

  // Podium gets the top 3; the list below starts at #4 to avoid duplication.
  const podiumRows: PodiumRow[] = rows.slice(0, 3);
  const listRows = rows.slice(3, TOP_N);

  let contextRows: typeof rows = [];
  if (!userInTop && userPosition >= 0) {
    const start = Math.max(TOP_N, userPosition - CONTEXT_RADIUS);
    const end = Math.min(rows.length, userPosition + CONTEXT_RADIUS + 1);
    contextRows = rows.slice(start, end);
  }

  // Closest rival above the viewer — only render for students (not teachers).
  let rivalAbove: RivalRow | null = null;
  let rivalBelow: RivalRow | null = null;
  if (!isTeacher && userPosition >= 0) {
    const aboveIdx = userPosition - 1;
    const belowIdx = userPosition + 1;
    if (aboveIdx >= 0) {
      const r = rows[aboveIdx];
      rivalAbove = {
        id: r.id,
        full_name: r.full_name,
        avatar_url: r.avatar_url,
        xp_total: r.xp_total,
        current_rank: r.current_rank,
        class_id: r.class_id,
        ringConfig: r.ringConfig,
      };
    }
    if (belowIdx < rows.length) {
      const r = rows[belowIdx];
      rivalBelow = {
        id: r.id,
        full_name: r.full_name,
        avatar_url: r.avatar_url,
        xp_total: r.xp_total,
        current_rank: r.current_rank,
        class_id: r.class_id,
        ringConfig: r.ringConfig,
      };
    }
  }

  const showScopeToggle = !isTeacher && viewerClassId !== null;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isTeacher ? 'Insights' : 'Leaderboard'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {effectiveScope === 'class'
            ? 'Your class only. Earn XP by reviewing cards and completing quests.'
            : 'Global ranking by XP. Earn XP by reviewing cards and completing quests.'}
        </p>
      </header>
      {isTeacher ? <InsightsTabs /> : <div className="mb-4" />}

      {showScopeToggle && (
        <div className="mb-5">
          <ToggleChipGroup
            ariaLabel="Leaderboard scope"
            current={effectiveScope}
            options={[
              { value: 'global', label: 'Global', href: '/leaderboard' },
              {
                value: 'class',
                label: 'My class',
                href: '/leaderboard?scope=class',
              },
            ]}
          />
        </div>
      )}

      <div className="space-y-6">
        {!isTeacher && userPosition >= 0 && (rivalAbove || rivalBelow) && (
          <ClosestRival
            viewerXp={viewerXp}
            viewerPosition={userPosition + 1}
            rivalAbove={rivalAbove}
            rivalBelow={rivalBelow}
          />
        )}

        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No students on the board yet.
            </CardContent>
          </Card>
        ) : (
          <>
            {podiumRows.length > 0 && (
              <LeaderboardPodium
                rows={podiumRows}
                viewerId={user.id}
                linkAsTeacher={isTeacher}
              />
            )}

            {(listRows.length > 0 || (!userInTop && userRow)) && (
              <Card>
                <CardContent className="p-0">
                  {listRows.length > 0 && (
                    <ul className="divide-y divide-border">
                      {listRows.map((r) => (
                        <LeaderboardRow
                          key={r.id}
                          row={r}
                          isCurrentUser={r.id === user.id}
                          isTeacher={isTeacher}
                        />
                      ))}
                    </ul>
                  )}
                  {!userInTop && userRow ? (
                    <>
                      <div className="flex items-center gap-2 border-t border-border bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <span className="h-px flex-1 bg-border" aria-hidden />
                        Your position
                        <span className="h-px flex-1 bg-border" aria-hidden />
                      </div>
                      <ul className="divide-y divide-border">
                        {contextRows.map((r) => (
                          <LeaderboardRow
                            key={r.id}
                            row={r}
                            isCurrentUser={r.id === user.id}
                            isTeacher={isTeacher}
                          />
                        ))}
                      </ul>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}


function LeaderboardRow({
  row,
  isCurrentUser,
  isTeacher,
}: {
  row: {
    id: string;
    position: number;
    full_name: string;
    xp_total: number;
    current_rank: number;
    avatar_url: string | null;
    class_id: string | null;
    ringConfig: { gradient: string; glow: string | null } | null;
  };
  isCurrentUser: boolean;
  isTeacher: boolean;
}) {
  const inner = (
    <>
      <span
        className={cn(
          'w-8 shrink-0 text-center text-xs font-semibold tabular-nums',
          row.position <= 3 ? 'text-foreground/60' : 'text-muted-foreground',
        )}
      >
        #{row.position}
      </span>
      <Avatar
        url={row.avatar_url}
        name={row.full_name}
        size="md"
        rank={row.current_rank}
        ringConfig={row.ringConfig}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'truncate text-sm font-medium',
              isCurrentUser ? 'text-primary' : 'text-foreground',
            )}
          >
            {row.full_name}
          </p>
          {isCurrentUser ? (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              you
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/80">
            Rank {row.current_rank}
          </span>
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {row.xp_total.toLocaleString()}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          XP
        </span>
      </span>
    </>
  );

  const linkable = isTeacher && row.class_id;
  if (linkable) {
    return (
      <li className={cn(isCurrentUser && 'bg-primary/5')}>
        <Link
          href={`/teacher/classes/${row.class_id}/students/${row.id}`}
          className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/60 focus:outline-none focus-visible:bg-muted"
        >
          {inner}
        </Link>
      </li>
    );
  }

  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-3.5',
        isCurrentUser && 'bg-primary/5',
      )}
    >
      {inner}
    </li>
  );
}
