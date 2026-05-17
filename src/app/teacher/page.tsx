import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SignOutButton from '../student/sign-out-button';

export default async function TeacherHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
        <p className="text-sm text-slate-600">Welcome, {profile.display_name}.</p>
        <p className="text-xs text-slate-500">Username: {profile.username}</p>
        <SignOutButton />
      </div>
    </main>
  );
}
