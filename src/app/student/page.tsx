import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReviewLauncher } from '@/components/review-launcher';
import { EnableNotificationsButton } from '@/components/enable-notifications-button';

export const dynamic = 'force-dynamic';

export default async function StudentHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, current_rank, xp_total')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  const nowIso = new Date().toISOString();
  const [{ count: dueCountRaw }, { data: nextRow }] = await Promise.all([
    supabase
      .from('card_reviews')
      .select('id', { count: 'exact', head: true })
      .lte('due_at', nowIso),
    supabase
      .from('card_reviews')
      .select('due_at')
      .gt('due_at', nowIso)
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const dueCount = dueCountRaw ?? 0;
  const nextDueAt = nextRow?.due_at ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile.full_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rank {profile.current_rank} · {profile.xp_total} XP
        </p>
      </header>

      <div className="rounded-lg border border-border bg-card p-5">
        <ReviewLauncher dueCount={dueCount} nextDueAt={nextDueAt} />
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <EnableNotificationsButton />
      </div>
    </div>
  );
}
