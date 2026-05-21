import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import SignOutButton from '../student/sign-out-button';

export default async function TeacherHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  const { count: pendingReviewCount } = await supabase
    .from('quest_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_review');

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 text-center shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Welcome, {profile.full_name}.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Link href="/teacher/lessons" className={buttonVariants()}>
            Lessons
          </Link>
          <Link href="/teacher/quests" className={buttonVariants({ variant: 'outline' })}>
            Quests
          </Link>
          <Link
            href="/teacher/review"
            className={buttonVariants({ variant: 'outline' })}
          >
            Review queue
            {(pendingReviewCount ?? 0) > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {pendingReviewCount}
              </span>
            )}
          </Link>
        </div>

        <SignOutButton />
      </div>
    </main>
  );
}
