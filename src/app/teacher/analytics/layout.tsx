import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { InsightsTabs } from '@/components/insights-tabs';
import { AnalyticsSubTabs } from '@/components/analytics-subtabs';
import { ClassFilter } from '@/components/class-filter';

/**
 * Wraps every /teacher/analytics/* page with the shared header,
 * top-level Insights tabs, sub-tabs, and class filter.
 *
 * The class filter writes ?class= into the URL; sub-tabs preserve it.
 */
export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'teacher') redirect('/login');

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What needs your attention today.
        </p>
      </header>
      <InsightsTabs />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AnalyticsSubTabs />
        <ClassFilter classes={classes ?? []} />
      </div>
      {children}
    </div>
  );
}
