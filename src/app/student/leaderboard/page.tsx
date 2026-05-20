import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { rankName } from '@/lib/ranks';

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

  // public_profiles is the security-barrier view. RLS lets students see all
  // other students globally; teachers see everyone. The view excludes
  // sensitive columns. We sort by xp_total DESC for the ranking.
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

  // If the user is below the top, show a small context window around them.
  let contextRows: typeof rows = [];
  if (!userInTop && userPosition >= 0) {
    const start = Math.max(TOP_N, userPosition - CONTEXT_RADIUS);
    const end = Math.min(rows.length, userPosition + CONTEXT_RADIUS + 1);
    contextRows = rows.slice(start, end);
  }

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <Link
        href="/student"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Home
      </Link>
      <h1 className="mb-1 text-3xl font-bold">Leaderboard</h1>
      <p className="mb-6 text-sm text-slate-600">
        Global ranking by XP. Earn XP by reviewing cards and completing quests.
      </p>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-600">
            No students on the board yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-200">
              {topRows.map((r) => (
                <LeaderboardRow
                  key={r.id}
                  row={r}
                  isCurrentUser={r.id === user.id}
                />
              ))}
            </ul>
            {!userInTop && userRow && (
              <>
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-center text-xs uppercase tracking-wide text-slate-500">
                  Your position
                </div>
                <ul className="divide-y divide-slate-200">
                  {contextRows.map((r) => (
                    <LeaderboardRow
                      key={r.id}
                      row={r}
                      isCurrentUser={r.id === user.id}
                    />
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </main>
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
        isCurrentUser && 'bg-blue-50/60'
      )}
    >
      <span
        className={cn(
          'w-9 shrink-0 text-sm font-semibold tabular-nums text-slate-500',
          row.position <= 3 && 'text-amber-700'
        )}
      >
        #{row.position}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            isCurrentUser ? 'text-blue-900' : 'text-slate-900'
          )}
        >
          {row.full_name}
          {isCurrentUser && (
            <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              you
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          {rankName(row.current_rank)} · tier {row.current_rank}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
        {row.xp_total.toLocaleString()} XP
      </span>
    </li>
  );
}
