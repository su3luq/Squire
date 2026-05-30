import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  ClipboardCheck,
  GraduationCap,
  Layers,
  Sword,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { EnableNotificationsButton } from '@/components/enable-notifications-button';
import { StatCard } from '@/components/stat-card';

export const dynamic = 'force-dynamic';

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

  const [
    { count: pendingReviewCount },
    { count: openQuestsCount },
    { count: classesCount },
    { count: studentsCount },
  ] = await Promise.all([
    supabase
      .from('quest_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review'),
    supabase
      .from('quests')
      .select('id', { count: 'exact', head: true })
      .is('closed_at', null),
    supabase.from('classes').select('id', { count: 'exact', head: true }),
    supabase
      .from('public_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student'),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile.full_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quick overview of your classroom.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending review"
          value={pendingReviewCount ?? 0}
          hint={
            (pendingReviewCount ?? 0) === 0
              ? 'All caught up'
              : 'Submissions waiting'
          }
          icon={ClipboardCheck}
          trend={(pendingReviewCount ?? 0) > 0 ? 'positive' : 'neutral'}
        />
        <StatCard
          label="Open quests"
          value={openQuestsCount ?? 0}
          hint="Not closed"
          icon={Sword}
        />
        <StatCard
          label="Students"
          value={studentsCount ?? 0}
          hint="Across all classes"
          icon={GraduationCap}
        />
        <StatCard
          label="Classes"
          value={classesCount ?? 0}
          hint="Total enrolled"
          icon={Layers}
        />
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold">Review queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {(pendingReviewCount ?? 0) > 0
                ? `${pendingReviewCount} ${pendingReviewCount === 1 ? 'submission needs' : 'submissions need'} your feedback.`
                : 'No submissions waiting right now.'}
            </p>
          </div>
          <Link
            href="/teacher/review"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open queue
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="text-base font-semibold">Jump to</h2>
        </div>
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <TeacherQuickLink
            href="/teacher/cards"
            label="Cards"
            description="Author cards and unlock for classes"
          />
          <TeacherQuickLink
            href="/teacher/quests"
            label="Quests"
            description="Create solo and co-op work"
          />
          <TeacherQuickLink
            href="/teacher/classes"
            label="Classes"
            description="Roster, codes, and enrolment"
          />
          <TeacherQuickLink
            href="/teacher/analytics"
            label="Insights"
            description="Velocity, leaderboard, activity"
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <EnableNotificationsButton />
      </section>
    </div>
  );
}

function TeacherQuickLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 p-5 transition-colors hover:bg-muted/40"
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
