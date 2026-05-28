import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { AssessmentForm } from './assessment-form';
import { NotesSection } from './notes-section';
import { TransferForm } from './transfer-form';
import { DeleteStudentButton } from './delete-student-button';
import { ZoomableAvatar } from './zoomable-avatar';

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

const RANK_NAMES = [
  'Novice',
  'Apprentice',
  'Adept',
  'Expert',
  'Master',
  'Grandmaster',
  'Luminary',
];

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id: classId, studentId } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from('profiles')
    .select(
      'id, full_name, age, email, class_id, xp_total, current_rank, learning_velocity, last_active_at, created_at, role, avatar_url'
    )
    .eq('id', studentId)
    .maybeSingle();

  if (!student || student.role !== 'student') notFound();

  const { data: otherClasses } = await supabase
    .from('classes')
    .select('id, name')
    .neq('id', student.class_id ?? '')
    .is('archived_at', null)
    .order('name');

  const { data: assessment } = await supabase
    .from('student_assessments')
    .select('english_proficiency_pearson, english_proficiency_cefr')
    .eq('student_id', studentId)
    .maybeSingle();

  const { data: notes } = await supabase
    .from('teacher_notes')
    .select('id, note, created_at, updated_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  const { data: acceptances } = await supabase
    .from('quest_acceptances')
    .select(
      `
        id, status, instance_id, accepted_at, completed_at,
        quests:quest_id ( id, title, quest_type, xp_reward ),
        coop_quest_instances:instance_id ( id, status )
      `
    )
    .eq('student_id', studentId)
    .order('accepted_at', { ascending: false });

  // eslint-disable-next-line react-hooks/purity -- Server Component rendered per request.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count: reviewCount } = await supabase
    .from('review_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .gte('answered_at', thirtyDaysAgo);

  const { data: lastReview } = await supabase
    .from('review_attempts')
    .select('answered_at')
    .eq('student_id', studentId)
    .order('answered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  type AcceptanceRow = NonNullable<typeof acceptances>[number];
  const all = (acceptances ?? []) as AcceptanceRow[];
  const inProgress = all.filter(
    (a) => a.status === 'active' || a.status === 'enrolled'
  );
  const completed = all.filter((a) => a.status === 'passed');
  const activeTeamCount = all.filter((a) => {
    if (a.status !== 'active') return false;
    const inst = a.coop_quest_instances as { status: string } | null;
    return inst?.status === 'active' || inst?.status === 'submitted';
  }).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={student.full_name}
        avatar={
          <ZoomableAvatar
            url={student.avatar_url}
            name={student.full_name}
          />
        }
      />

      <div className="space-y-1 text-sm">
        <p className="text-muted-foreground">
          {student.email}
          {student.age != null && ` · ${student.age} years old`}
        </p>
        <p className="text-xs text-muted-foreground/70">
          Joined {formatSaigon(student.created_at)}
          {student.last_active_at &&
            ` · last active ${formatSaigon(student.last_active_at)}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Rank"
              value={`${student.current_rank}`}
              sub={RANK_NAMES[student.current_rank - 1] ?? ''}
            />
            <Stat label="XP" value={student.xp_total.toLocaleString()} />
            <Stat
              label="Velocity"
              value={Number(student.learning_velocity ?? 0).toFixed(3)}
              sub="14-day weighted"
            />
            <Stat
              label="Reviews (30 d)"
              value={`${reviewCount ?? 0}`}
              sub={
                lastReview?.answered_at
                  ? `last ${formatSaigon(lastReview.answered_at)}`
                  : 'none'
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            In progress ({inProgress.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quests in progress right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {inProgress.map((a) => {
                const q = a.quests as
                  | {
                      id: string;
                      title: string;
                      quest_type: string;
                      xp_reward: number;
                    }
                  | null;
                const inst = a.coop_quest_instances as
                  | { status: string }
                  | null;
                return (
                  <li
                    key={a.id}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <p className="font-medium">{q?.title ?? '(quest deleted)'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize">
                        {q?.quest_type ?? '—'}
                      </span>
                      <span>accepted {formatSaigon(a.accepted_at)}</span>
                      <span>·</span>
                      <span className="capitalize">
                        acceptance: {a.status}
                      </span>
                      {inst && (
                        <>
                          <span>·</span>
                          <span className="capitalize">team: {inst.status}</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {completed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Completed ({completed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {completed.map((a) => {
                const q = a.quests as
                  | { title: string; quest_type: string; xp_reward: number }
                  | null;
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <span>
                      <span className="font-medium">
                        {q?.title ?? '(quest deleted)'}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        +{q?.xp_reward ?? 0} XP
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground/70">
                      {formatSaigon(a.completed_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <AssessmentForm
            studentId={student.id}
            initialPearson={assessment?.english_proficiency_pearson ?? null}
            initialCefr={assessment?.english_proficiency_cefr ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Teacher notes ({(notes ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NotesSection studentId={student.id} notes={notes ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfer to another class</CardTitle>
        </CardHeader>
        <CardContent>
          <TransferForm studentId={student.id} options={otherClasses ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteStudentButton
            studentId={student.id}
            fromClassId={classId}
            studentName={student.full_name}
            activeTeamCount={activeTeamCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground/70">{sub}</p>}
    </div>
  );
}
