import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import SignOutButton from './sign-out-button';

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

        <div className="flex flex-col gap-2">
          <Link href="/student/library" className={buttonVariants()}>
            Library
          </Link>
        </div>

        <SignOutButton />
      </div>
    </main>
  );
}
