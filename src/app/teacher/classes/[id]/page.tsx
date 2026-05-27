import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar } from '@/components/avatar';
import { PageHeader } from '@/components/page-header';
import { EditClassForm } from './edit-class-form';
import { RegistrationToggle } from './registration-toggle';
import { ArchiveButton } from './archive-button';

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

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, registration_open, archived_at, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!cls) notFound();

  const { data: students } = await supabase
    .from('profiles')
    .select(
      'id, full_name, age, email, xp_total, current_rank, learning_velocity, last_active_at, created_at, avatar_url'
    )
    .eq('class_id', id)
    .eq('role', 'student')
    .order('full_name');

  const isArchived = cls.archived_at !== null;
  const studentCount = (students ?? []).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={cls.name} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isArchived ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">
            Archived
          </span>
        ) : cls.registration_open ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
            Registration open
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">
            Registration closed
          </span>
        )}
        <span className="text-muted-foreground">
          {studentCount} {studentCount === 1 ? 'student' : 'students'}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Students ({studentCount})</CardTitle>
        </CardHeader>
        <CardContent>
          {studentCount === 0 ? (
            <p className="text-sm text-muted-foreground">
              No students in this class yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(students ?? []).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/teacher/classes/${id}/students/${s.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar
                        url={s.avatar_url}
                        name={s.full_name}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.age ? `${s.age}y · ` : ''}
                          {s.email}
                        </p>
                      </div>
                      <span className="hidden w-20 shrink-0 justify-self-start rounded-full bg-muted px-2 py-0.5 text-center text-xs font-medium text-muted-foreground sm:inline-block">
                        Rank {s.current_rank}
                      </span>
                      <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline-block">
                        {s.xp_total.toLocaleString()} XP
                      </span>
                      <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline-block">
                        v {Number(s.learning_velocity ?? 0).toFixed(2)}
                      </span>
                    </div>
                    {s.last_active_at && (
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        Last active {formatSaigon(s.last_active_at)}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Name</CardTitle>
        </CardHeader>
        <CardContent>
          <EditClassForm classId={cls.id} initialName={cls.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RegistrationToggle
            classId={cls.id}
            isOpen={cls.registration_open}
            isArchived={isArchived}
          />
          <hr className="border-border" />
          <ArchiveButton classId={cls.id} isArchived={isArchived} />
        </CardContent>
      </Card>
    </div>
  );
}
