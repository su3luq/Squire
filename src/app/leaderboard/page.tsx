import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { rankName } from '@/lib/ranks';
import { InsightsTabs } from '@/components/insights-tabs';

export const dynamic = 'force-dynamic';

const TOP_N = 10;
// When the user is past TOP_N, show them with this much surrounding context.
const CONTEXT_RADIUS = 2;

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const isTeacher = viewerProfile?.role === 'teacher';

  const { data: students } = await supabase
    .from('public_profiles')
    .select('id, full_name, xp_total, current_rank')
    .eq('role', 'student')
    .order('xp_total', { ascending: false })
    .order('full_name', { ascending: true });

  const rows = (students ?? []).map((s, idx) => ({
    position: idx + 1,
    id: s.id ?? '',
    full_name: s.full_name ?? 'Unknown',
    xp_total: s.xp_total ?? 0,
    current_rank: s.current_rank ?? 1,
  }));

  const userPosition = rows.findIndex((r) => r.id === user.id);
  const userRow = userPosition >= 0 ? rows[userPosition] : null;
  const userInTop = userPosition >= 0 && userPosition < TOP_N;

  const topRows = rows.slice(0, TOP_N);

  let contextRows: typeof rows = [];
  if (!userInTop && userPosition >= 0) {
    const start = Math.max(TOP_N, userPosition - CONTEXT_RADIUS);
    const end = Math.min(rows.length, userPosition + CONTEXT_RADIUS + 1);
    contextRows = rows.slice(start, end);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isTeacher ? 'Insights' : 'Leaderboard'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global ranking by XP. Earn XP by reviewing cards and completing quests.
        </p>
      </header>
      {isTeacher ? <InsightsTabs /> : <div className="mb-6" />}
      <div className="space-y-6">

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No students on the board yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {topRows.map((r) => (
                <LeaderboardRow
                  key={r.id}
                  row={r}
                  isCurrentUser={r.id === user.id}
                />
              ))}
            </ul>
            {!userInTop && userRow ? (
              <>
                <div className="border-t border-border bg-muted px-4 py-2 text-center text-xs uppercase tracking-wide text-muted-foreground">
                  Your position
                </div>
                <ul className="divide-y divide-border">
                  {contextRows.map((r) => (
                    <LeaderboardRow
                      key={r.id}
                      row={r}
                      isCurrentUser={r.id === user.id}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

function LeaderboardRow({
  row,
  isCurrentUser,
}: {
  row: {
    position: number;
    full_name: string;
    xp_total: number;
    current_rank: number;
  };
  isCurrentUser: boolean;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        isCurrentUser && 'bg-primary/5',
      )}
    >
      <span
        className={cn(
          'w-9 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground',
          row.position <= 3 && 'text-primary',
        )}
      >
        #{row.position}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            isCurrentUser ? 'text-primary' : 'text-foreground',
          )}
        >
          {row.full_name}
          {isCurrentUser ? (
            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              you
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {rankName(row.current_rank)} · tier {row.current_rank}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {row.xp_total.toLocaleString()} XP
      </span>
    </li>
  );
}
