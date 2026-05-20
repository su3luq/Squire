import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { ReviewLauncher } from '@/components/review-launcher';
import SignOutButton from './sign-out-button';

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

  // Count of currently-due review cards for this student. RLS scopes to own.
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
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 text-center shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Student Home</h1>
          <p className="mt-1 text-sm text-slate-600">Welcome, {profile.full_name}.</p>
          <p className="mt-1 text-xs text-slate-500">
            Rank: {profile.current_rank} · XP: {profile.xp_total}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <ReviewLauncher dueCount={dueCount} nextDueAt={nextDueAt} />
          <Link
            href="/student/library"
            className={buttonVariants({ variant: 'outline' })}
          >
            Library
          </Link>
        </div>

        <SignOutButton />
      </div>
    </main>
  );
}
