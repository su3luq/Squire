import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default function TeacherSettingsHub() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="App settings"
        subtitle="Configure how the gamification mechanics behave for your students."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/teacher/settings/ranks"
          className="group rounded-lg border border-border p-4 transition hover:border-primary hover:bg-muted/40"
        >
          <p className="text-sm font-semibold">Rank ladder</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Edit tiers, XP thresholds, gradient colors, and optional tier
            names. Saved changes recompute every student&apos;s rank.
          </p>
        </Link>
      </div>
    </div>
  );
}
