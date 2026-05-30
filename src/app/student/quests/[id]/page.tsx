import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PageHeader } from '@/components/page-header';
import { LiveCountdown } from '../countdown';
import { QuestActionButton } from '../accept-button';

export const dynamic = 'force-dynamic';

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

function formatSaigon(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAIGON_TZ,
  }).format(new Date(iso));
}

export default async function StudentQuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: quest } = await supabase
    .from('quests')
    .select(
      `
        id, title, description, quest_type, xp_reward, expires_at, closed_at, max_team_size, word_limit_min,
        quest_acceptances(id, student_id, status, instance_id),
        coop_quest_instances(id, class_id)
      `
    )
    .eq('id', id)
    .maybeSingle();

  if (!quest) notFound();

  const { data: profile } = await supabase
    .from('profiles')
    .select('class_id')
    .eq('id', user.id)
    .maybeSingle();

  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const now = Date.now();
  const isExpired =
    quest.expires_at !== null && new Date(quest.expires_at).getTime() <= now;
  const matchmakingDoneForMyClass = (quest.coop_quest_instances ?? []).some(
    (i) => i.class_id === profile?.class_id
  );

  if (quest.quest_type === 'coop' && matchmakingDoneForMyClass) {
    redirect('/student/my-quests');
  }

  const allAcceptances = quest.quest_acceptances ?? [];
  const ownAcceptance = allAcceptances.find((a) => a.student_id === user.id);
  const enrolledCount = allAcceptances.filter((a) => a.status === 'enrolled')
    .length;

  let action: React.ReactNode = null;
  let statusBanner: React.ReactNode = null;

  if (quest.closed_at) {
    statusBanner = (
      <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        This quest is closed. No new accepts or enrollments.
      </div>
    );
  } else if (isExpired) {
    statusBanner = (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
        This quest is past its deadline.
      </div>
    );
  }

  if (quest.quest_type === 'solo') {
    if (ownAcceptance?.status === 'active') {
      action = (
        <Link
          href="/student/my-quests"
          className="text-sm font-medium text-primary hover:underline"
        >
          You&apos;ve accepted this — go to My Quests →
        </Link>
      );
    } else if (
      ownAcceptance?.status === 'passed' ||
      ownAcceptance?.status === 'failed'
    ) {
      action = (
        <p className="text-sm text-muted-foreground">
          You&apos;ve already worked on this.
        </p>
      );
    } else if (!quest.closed_at && !isExpired) {
      action = (
        <QuestActionButton
          variant="accept-solo"
          questId={quest.id}
          redirectToMyQuestsOnAccept
        />
      );
    }
  } else {
    if (
      ownAcceptance?.status === 'passed' ||
      ownAcceptance?.status === 'active'
    ) {
      action = (
        <Link
          href="/student/my-quests"
          className="text-sm font-medium text-primary hover:underline"
        >
          Go to My Quests →
        </Link>
      );
    } else if (ownAcceptance?.status === 'enrolled') {
      action = (
        <div className="flex flex-col items-start gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            You&apos;re enrolled
          </span>
          <p className="text-xs text-muted-foreground">
            Enrollments are final. You&apos;ll be matched into a team at the
            deadline.
          </p>
        </div>
      );
    } else if (!quest.closed_at && !isExpired) {
      action = <QuestActionButton variant="enroll-coop" questId={quest.id} />;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={quest.title} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium capitalize text-muted-foreground">
            {quest.quest_type}
          </span>
          <span className="text-muted-foreground">+{quest.xp_reward} XP</span>
          {quest.word_limit_min != null && quest.word_limit_min > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                target {quest.word_limit_min} words
              </span>
            </>
          )}
          {quest.quest_type === 'coop' && quest.max_team_size && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                teams up to {quest.max_team_size}
              </span>
            </>
          )}
        </div>
        {quest.expires_at && (
          <p className="text-xs text-muted-foreground">
            {quest.quest_type === 'coop' ? 'Matchmaking' : 'Closes'} at{' '}
            {formatSaigon(quest.expires_at)} (Saigon)
            {!isExpired && (
              <>
                {' · '}
                <LiveCountdown targetIso={quest.expires_at} />
              </>
            )}
          </p>
        )}
        {quest.quest_type === 'coop' && (
          <p className="text-xs text-muted-foreground">
            {enrolledCount} student{enrolledCount === 1 ? '' : 's'} enrolled
          </p>
        )}
      </div>

      {statusBanner}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brief</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownRenderer
            source={quest.description ?? ''}
            emptyPlaceholder="No description provided."
          />
        </CardContent>
      </Card>

      {action && (
        <Card>
          <CardContent className="pt-6">{action}</CardContent>
        </Card>
      )}
    </div>
  );
}
