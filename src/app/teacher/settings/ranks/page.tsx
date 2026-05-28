import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { RanksEditor } from './ranks-editor';

export const dynamic = 'force-dynamic';

export default async function RanksSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ranks')
    .select('tier, min_xp, gradient_id, name')
    .order('tier', { ascending: true });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Rank ladder"
        subtitle="Tier 1 is the top rank. Tier numbers and XP thresholds must increase together (highest tier has the highest min XP)."
      />
      <RanksEditor initial={data ?? []} />
    </div>
  );
}
