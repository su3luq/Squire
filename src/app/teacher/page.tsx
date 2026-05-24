import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { EnableNotificationsButton } from '@/components/enable-notifications-button';

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {profile.full_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a section from the menu to get started.
        </p>
      </header>

      <div className="rounded-lg border border-border bg-card p-5">
        <EnableNotificationsButton />
      </div>
    </div>
  );
}
